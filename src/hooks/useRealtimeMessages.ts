"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";

export interface Reaction {
  emoji: string;
  count: number;
  hasReacted: boolean;
}

export interface RawMessage {
  id: string;
  sender_id: string;
  receiver_id: string;
  ciphertext: string;
  sender_ciphertext: string | null;
  delivered_at: string | null;
  read_at: string | null;
  created_at: string;
  edited_at: string | null;
  is_deleted: boolean;
  // Reply
  reply_to_id: string | null;
  reply_preview: string | null;
  // Image
  message_type: "text" | "image";
  image_url: string | null;
  image_aes_key: string | null;
  image_aes_key_sender: string | null;
  image_iv: string | null;
  image_mime: string | null;
  // Local only
  _plaintext?: string;
  // Reactions (loaded client-side)
  _reactions?: Reaction[];
}

export function useRealtimeMessages(
  currentUserId: string | undefined,
  partnerId: string | undefined
) {
  const [messages, setMessages] = useState<RawMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const channelRef = useRef<ReturnType<ReturnType<typeof createClient>["channel"]> | null>(null);

  useEffect(() => {
    if (!currentUserId || !partnerId) return;

    async function fetchMessages() {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("messages")
        .select("*")
        .or(
          `and(sender_id.eq.${currentUserId},receiver_id.eq.${partnerId}),and(sender_id.eq.${partnerId},receiver_id.eq.${currentUserId})`
        )
        .order("created_at", { ascending: true });

      if (!error && data) {
        // Load reactions for all messages
        const msgIds = (data as RawMessage[]).map(m => m.id);
        const { data: reactData } = await supabase
          .from("message_reactions")
          .select("message_id, emoji, user_id")
          .in("message_id", msgIds);

        const messagesWithReactions = (data as RawMessage[]).map(msg => ({
          ...msg,
          _reactions: buildReactions(reactData || [], msg.id, currentUserId!),
        }));

        setMessages(messagesWithReactions);
      }
      setLoading(false);
    }

    fetchMessages();
  }, [currentUserId, partnerId]);

  // Realtime: message inserts + updates + reaction changes
  useEffect(() => {
    if (!currentUserId || !partnerId) return;
    const supabase = createClient();

    const channel = supabase
      .channel(`chat:${currentUserId}:${partnerId}`)
      .on(
        "postgres_changes",
        { 
          event: "INSERT", 
          schema: "public", 
          table: "messages"
        },
        (payload) => {
          const newMsg = payload.new as RawMessage;
          const isRelevant =
            (newMsg.sender_id === currentUserId && newMsg.receiver_id === partnerId) ||
            (newMsg.sender_id === partnerId && newMsg.receiver_id === currentUserId);
          
          if (isRelevant) {
            setMessages((prev) => {
              if (prev.some((m) => m.id === newMsg.id)) return prev;
              const next = [...prev, { ...newMsg, _reactions: [] }];
              return next.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
            });
          }
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "messages" },
        (payload) => {
          const updated = payload.new as RawMessage;
          setMessages((prev) =>
            prev.map((m) => (m.id === updated.id ? { ...m, ...updated } : m))
          );
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "message_reactions" },
        async (payload) => {
          const msgId = (payload.new as { message_id: string })?.message_id
            || (payload.old as { message_id: string })?.message_id;
          if (!msgId) return;

          const { data: reactData } = await supabase
            .from("message_reactions")
            .select("message_id, emoji, user_id")
            .eq("message_id", msgId);

          setMessages((prev) =>
            prev.map((m) =>
              m.id === msgId
                ? { ...m, _reactions: buildReactions(reactData || [], msgId, currentUserId!) }
                : m
            )
          );
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          console.log('[Realtime] Subscribed to chat channel');
        }
      });

    channelRef.current = channel;
    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentUserId, partnerId]);

  // Mark messages as read when chat is open
  useEffect(() => {
    if (!currentUserId || !partnerId || !messages.length) return;
    const supabase = createClient();
    const unread = messages.filter(
      (m) => m.sender_id === partnerId && m.receiver_id === currentUserId && !m.read_at
    );
    if (!unread.length) return;
    const ids = unread.map((m) => m.id);
    supabase
      .from("messages")
      .update({ read_at: new Date().toISOString() })
      .in("id", ids)
      .then(() => {});
  }, [messages, currentUserId, partnerId]);

  const addOptimisticMessage = useCallback((msg: RawMessage) => {
    setMessages((prev) => {
      if (prev.some((m) => m.id === msg.id)) return prev;
      return [...prev, { ...msg, _reactions: [] }];
    });
  }, []);

  const clearMessages = useCallback(() => setMessages([]), []);

  const updateMessage = useCallback((id: string, patch: Partial<RawMessage>) => {
    setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, ...patch } : m)));
  }, []);

  return { messages, loading, addOptimisticMessage, clearMessages, updateMessage };
}

function buildReactions(
  reactData: { message_id: string; emoji: string; user_id: string }[],
  messageId: string,
  currentUserId: string
): Reaction[] {
  const forMsg = reactData.filter(r => r.message_id === messageId);
  const grouped: Record<string, { count: number; hasReacted: boolean }> = {};
  for (const r of forMsg) {
    if (!grouped[r.emoji]) grouped[r.emoji] = { count: 0, hasReacted: false };
    grouped[r.emoji].count++;
    if (r.user_id === currentUserId) grouped[r.emoji].hasReacted = true;
  }
  return Object.entries(grouped).map(([emoji, v]) => ({ emoji, ...v }));
}
