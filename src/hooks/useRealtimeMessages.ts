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
  // Local-only: marks a freshly sent optimistic message for enter animation
  _isNew?: boolean;
}

const PAGE_SIZE = 50;

export function useRealtimeMessages(
  currentUserId: string | undefined,
  partnerId: string | undefined
) {
  const [messages, setMessages] = useState<RawMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(false);
  const oldestCreatedAt = useRef<string | null>(null);
  const channelRef = useRef<ReturnType<ReturnType<typeof createClient>["channel"]> | null>(null);

  // Initial fetch — last PAGE_SIZE messages
  useEffect(() => {
    if (!currentUserId || !partnerId) return;

    async function fetchMessages() {
      const supabase = createClient();
      const { data, error, count } = await supabase
        .from("messages")
        .select("*", { count: "exact" })
        .or(
          `and(sender_id.eq.${currentUserId},receiver_id.eq.${partnerId}),and(sender_id.eq.${partnerId},receiver_id.eq.${currentUserId})`
        )
        .order("created_at", { ascending: false })
        .range(0, PAGE_SIZE - 1);

      if (!error && data) {
        // data comes newest-first; reverse so display is chronological
        const sorted = (data as RawMessage[]).reverse();
        oldestCreatedAt.current = sorted[0]?.created_at ?? null;
        setHasMore((count ?? 0) > PAGE_SIZE);

        // Load reactions
        const msgIds = sorted.map(m => m.id);
        const { data: reactData } = await supabase
          .from("message_reactions")
          .select("message_id, emoji, user_id")
          .in("message_id", msgIds);

        setMessages(sorted.map(msg => ({
          ...msg,
          _reactions: buildReactions(reactData || [], msg.id, currentUserId!),
        })));
      }
      setLoading(false);
    }

    fetchMessages();
  }, [currentUserId, partnerId]);

  // Load older messages (called on scroll-to-top)
  const loadMore = useCallback(async () => {
    if (!currentUserId || !partnerId || !oldestCreatedAt.current) return;
    const supabase = createClient();

    const { data, error } = await supabase
      .from("messages")
      .select("*")
      .or(
        `and(sender_id.eq.${currentUserId},receiver_id.eq.${partnerId}),and(sender_id.eq.${partnerId},receiver_id.eq.${currentUserId})`
      )
      .lt("created_at", oldestCreatedAt.current)
      .order("created_at", { ascending: false })
      .range(0, PAGE_SIZE - 1);

    if (!error && data && data.length > 0) {
      const older = (data as RawMessage[]).reverse();
      oldestCreatedAt.current = older[0].created_at;
      setHasMore(data.length === PAGE_SIZE);

      const msgIds = older.map(m => m.id);
      const { data: reactData } = await supabase
        .from("message_reactions")
        .select("message_id, emoji, user_id")
        .in("message_id", msgIds);

      const withReactions = older.map(msg => ({
        ...msg,
        _reactions: buildReactions(reactData || [], msg.id, currentUserId!),
      }));

      setMessages(prev => [...withReactions, ...prev]);
    } else {
      setHasMore(false);
    }
  }, [currentUserId, partnerId]);

  // Realtime: message inserts + updates + reaction changes
  useEffect(() => {
    if (!currentUserId || !partnerId) return;
    const supabase = createClient();

    const handleNewMessage = (newMsg: RawMessage) => {
      const isRelevant =
        (newMsg.sender_id === currentUserId && newMsg.receiver_id === partnerId) ||
        (newMsg.sender_id === partnerId && newMsg.receiver_id === currentUserId);

      if (!isRelevant) return;

      // Fix delivered receipts: write delivered_at immediately when we receive a message
      if (newMsg.receiver_id === currentUserId && !newMsg.delivered_at) {
        supabase
          .from("messages")
          .update({ delivered_at: new Date().toISOString() })
          .eq("id", newMsg.id)
          .then(() => {});
      }

      setMessages(prev => {
        if (prev.some(m => m.id === newMsg.id)) return prev;
        const next = [...prev, { ...newMsg, _reactions: [], _isNew: true }];
        return next.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
      });
    };

    const handleUpdateMessage = (updated: RawMessage) => {
      setMessages(prev => prev.map(m => (m.id === updated.id ? { ...m, ...updated } : m)));
    };

    const channelId = `chat:${currentUserId}:${partnerId}-${Math.random()}`;
    const channel = supabase
      .channel(channelId)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages", filter: `receiver_id=eq.${currentUserId}` },
        (payload) => handleNewMessage(payload.new as RawMessage)
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages", filter: `sender_id=eq.${currentUserId}` },
        (payload) => handleNewMessage(payload.new as RawMessage)
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "messages", filter: `receiver_id=eq.${currentUserId}` },
        (payload) => handleUpdateMessage(payload.new as RawMessage)
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "messages", filter: `sender_id=eq.${currentUserId}` },
        (payload) => handleUpdateMessage(payload.new as RawMessage)
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

          setMessages(prev =>
            prev.map(m =>
              m.id === msgId
                ? { ...m, _reactions: buildReactions(reactData || [], msgId, currentUserId!) }
                : m
            )
          );
        }
      )
      .subscribe((status) => {
        console.log(`[Realtime] Subscription status for chat:${partnerId}:`, status);
        if (status === 'CHANNEL_ERROR') {
          console.error('[Realtime] Channel error occurred. Possible RLS or Replication issue.');
        }
      });

    channelRef.current = channel;
    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentUserId, partnerId]);

  // Mark messages as read when chat is open
  const processedUnreadIds = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!currentUserId || !partnerId || !messages.length) return;
    const supabase = createClient();
    const unread = messages.filter(
      m => m.sender_id === partnerId && m.receiver_id === currentUserId && !m.read_at && !processedUnreadIds.current.has(m.id)
    );
    if (!unread.length) return;
    const ids = unread.map(m => m.id);
    ids.forEach(id => processedUnreadIds.current.add(id));

    supabase
      .from("messages")
      .update({ read_at: new Date().toISOString() })
      .in("id", ids)
      .then(() => {});
  }, [messages, currentUserId, partnerId]);

  const addOptimisticMessage = useCallback((msg: RawMessage) => {
    setMessages(prev => {
      if (prev.some(m => m.id === msg.id)) return prev;
      return [...prev, { ...msg, _reactions: [], _isNew: true }];
    });
  }, []);

  const clearMessages = useCallback(() => setMessages([]), []);

  const updateMessage = useCallback((id: string, patch: Partial<RawMessage>) => {
    setMessages(prev => prev.map(m => (m.id === id ? { ...m, ...patch } : m)));
  }, []);

  return { messages, loading, hasMore, loadMore, addOptimisticMessage, clearMessages, updateMessage };
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
