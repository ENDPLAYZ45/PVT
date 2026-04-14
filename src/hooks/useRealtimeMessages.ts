"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";

export interface RawMessage {
  id: string;
  sender_id: string;
  receiver_id: string;
  ciphertext: string;
  sender_ciphertext: string | null;
  delivered_at: string | null;
  read_at: string | null;
  created_at: string;
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

      if (!error && data) setMessages(data as RawMessage[]);
      setLoading(false);
    }

    fetchMessages();
  }, [currentUserId, partnerId]);

  // Realtime inserts + updates (for read receipts)
  useEffect(() => {
    if (!currentUserId || !partnerId) return;
    const supabase = createClient();

    const channel = supabase
      .channel(`messages:${currentUserId}:${partnerId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages" },
        (payload) => {
          const newMsg = payload.new as RawMessage;
          const isRelevant =
            (newMsg.sender_id === currentUserId && newMsg.receiver_id === partnerId) ||
            (newMsg.sender_id === partnerId && newMsg.receiver_id === currentUserId);
          if (isRelevant) {
            setMessages((prev) => {
              if (prev.some((m) => m.id === newMsg.id)) return prev;
              return [...prev, newMsg];
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
      .subscribe();

    channelRef.current = channel;
    return () => { supabase.removeChannel(channel); };
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
      return [...prev, msg];
    });
  }, []);

  const clearMessages = useCallback(() => setMessages([]), []);

  return { messages, loading, addOptimisticMessage, clearMessages };
}
