"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";

interface RawMessage {
  id: string;
  sender_id: string;
  receiver_id: string;
  ciphertext: string;
  sender_ciphertext: string | null;
  delivered_at: string | null;
  created_at: string;
  _plaintext?: string;
}

export function useRealtimeMessages(
  currentUserId: string | undefined,
  partnerId: string | undefined
) {
  const [messages, setMessages] = useState<RawMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const channelRef = useRef<ReturnType<
    ReturnType<typeof createClient>["channel"]
  > | null>(null);

  // Fetch existing messages for this conversation
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
        setMessages(data);
      }
      setLoading(false);
    }

    fetchMessages();
  }, [currentUserId, partnerId]);

  // Subscribe to realtime inserts
  useEffect(() => {
    if (!currentUserId || !partnerId) return;

    const supabase = createClient();

    const channel = supabase
      .channel(`messages:${currentUserId}:${partnerId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
        },
        (payload) => {
          const newMsg = payload.new as RawMessage;
          // Only add if it belongs to this conversation
          const isRelevant =
            (newMsg.sender_id === currentUserId &&
              newMsg.receiver_id === partnerId) ||
            (newMsg.sender_id === partnerId &&
              newMsg.receiver_id === currentUserId);

          if (isRelevant) {
            setMessages((prev) => {
              // Avoid duplicates
              if (prev.some((m) => m.id === newMsg.id)) return prev;
              return [...prev, newMsg];
            });
          }
        }
      )
      .subscribe();

    channelRef.current = channel;

    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentUserId, partnerId]);

  const addOptimisticMessage = useCallback((msg: RawMessage) => {
    setMessages((prev) => {
      // Avoid duplicates from realtime subscription
      if (prev.some((m) => m.id === msg.id)) return prev;
      return [...prev, msg];
    });
  }, []);

  const clearMessages = useCallback(() => {
    setMessages([]);
  }, []);

  return { messages, loading, addOptimisticMessage, clearMessages };
}
