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
  reply_to_id: string | null;
  reply_preview: string | null;
  message_type: "text" | "image";
  image_url: string | null;
  image_aes_key: string | null;
  image_aes_key_sender: string | null;
  image_iv: string | null;
  image_mime: string | null;
  _plaintext?: string;
  _reactions?: Reaction[];
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

  // ─── fetchMessages ────────────────────────────────────────────────────────
  // The SINGLE source of truth. Called on mount and on every realtime INSERT.
  // This is the same pattern useConversations uses for its sidebar — it works.
  const fetchMessages = useCallback(async () => {
    if (!currentUserId || !partnerId) return;
    const supabase = createClient();

    const { data, error, count } = await supabase
      .from("messages")
      .select("*", { count: "exact" })
      .or(
        `and(sender_id.eq.${currentUserId},receiver_id.eq.${partnerId}),and(sender_id.eq.${partnerId},receiver_id.eq.${currentUserId})`
      )
      .order("created_at", { ascending: false })
      .range(0, PAGE_SIZE - 1);

    if (error) {
      console.error("[useRealtimeMessages] fetchMessages error:", error.message);
      return;
    }

    if (data) {
      const sorted = (data as RawMessage[]).reverse();
      oldestCreatedAt.current = sorted[0]?.created_at ?? null;
      setHasMore((count ?? 0) > PAGE_SIZE);

      const msgIds = sorted.map(m => m.id);
      const { data: reactData } = await supabase
        .from("message_reactions")
        .select("message_id, emoji, user_id")
        .in("message_id", msgIds.length ? msgIds : ["00000000-0000-0000-0000-000000000000"]);

      setMessages(prev => {
        // Preserve _isNew flags for messages that are already in state
        const prevMap = new Map(prev.map(m => [m.id, m]));
        return sorted.map(msg => ({
          ...msg,
          _reactions: buildReactions(reactData || [], msg.id, currentUserId!),
          _isNew: prevMap.has(msg.id) ? false : true,
        }));
      });
    }

    setLoading(false);
  }, [currentUserId, partnerId]);

  // Initial load
  useEffect(() => {
    setLoading(true);
    setMessages([]);
    fetchMessages();
  }, [fetchMessages]);

  // ─── Load older pages ─────────────────────────────────────────────────────
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

      setMessages(prev => [
        ...older.map(msg => ({
          ...msg,
          _reactions: buildReactions(reactData || [], msg.id, currentUserId!),
        })),
        ...prev,
      ]);
    } else {
      setHasMore(false);
    }
  }, [currentUserId, partnerId]);

  // ─── Realtime subscription ────────────────────────────────────────────────
  useEffect(() => {
    if (!currentUserId || !partnerId) return;
    const supabase = createClient();

    // Each user gets a UNIQUE channel name based on their OWN userId first.
    // If we sort, both A and B share "chat:A:B" — Supabase can merge/conflict them.
    const channelName = `chat:${currentUserId}:${partnerId}`;

    const channel = supabase
      .channel(channelName)
      // ── New message sent TO me ─────────────────────────────────────────────
      // Use fetchMessages() — the same reliable pattern that works for the
      // sidebar. Avoids relying on payload.new which can be incomplete, and
      // avoids the read-replica lag problem with single-row lookups.
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `receiver_id=eq.${currentUserId}`,
        },
        () => {
          console.log("[Realtime] INSERT received — refetching messages");
          fetchMessages();
        }
      )
      // ── Sent message confirmation (optimistic message already shown) ────────
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `sender_id=eq.${currentUserId}`,
        },
        () => {
          // Refetch to reconcile the optimistic message with the real DB id/timestamps
          fetchMessages();
        }
      )
      // ── Message updated (edit / delete / delivered / read) ────────────────
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "messages",
          filter: `receiver_id=eq.${currentUserId}`,
        },
        payload => {
          const updated = payload.new as RawMessage;
          setMessages(prev =>
            prev.map(m => (m.id === updated.id ? { ...m, ...updated } : m))
          );
        }
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "messages",
          filter: `sender_id=eq.${currentUserId}`,
        },
        payload => {
          const updated = payload.new as RawMessage;
          setMessages(prev =>
            prev.map(m => (m.id === updated.id ? { ...m, ...updated } : m))
          );
        }
      )
      // ── Reactions ─────────────────────────────────────────────────────────
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "message_reactions" },
        async payload => {
          const msgId =
            (payload.new as { message_id?: string })?.message_id ||
            (payload.old as { message_id?: string })?.message_id;
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
      .subscribe(status => {
        console.log(`[Realtime] ${channelName} → ${status}`);
        if (status === "CHANNEL_ERROR") {
          console.error("[Realtime] Channel error — retrying fetch in 3s");
          setTimeout(() => fetchMessages(), 3000);
        }
        if (status === "TIMED_OUT") {
          console.warn("[Realtime] Timed out — refetching");
          fetchMessages();
        }
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentUserId, partnerId, fetchMessages]);

  // ─── Mark messages as read ────────────────────────────────────────────────
  const processedUnreadIds = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!currentUserId || !partnerId || !messages.length) return;
    const supabase = createClient();

    const unread = messages.filter(
      m =>
        m.sender_id === partnerId &&
        m.receiver_id === currentUserId &&
        !m.read_at &&
        !processedUnreadIds.current.has(m.id)
    );
    if (!unread.length) return;

    const ids = unread.map(m => m.id);
    ids.forEach(id => processedUnreadIds.current.add(id));

    supabase
      .from("messages")
      .update({ read_at: new Date().toISOString() })
      .in("id", ids)
      .then(() => {});

    // Also mark delivered for any that slipped through
    const undelivered = unread.filter(m => !m.delivered_at);
    if (undelivered.length) {
      supabase
        .from("messages")
        .update({ delivered_at: new Date().toISOString() })
        .in("id", undelivered.map(m => m.id))
        .then(() => {});
    }
  }, [messages, currentUserId, partnerId]);

  // ─── Helpers ──────────────────────────────────────────────────────────────
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

  return {
    messages,
    loading,
    hasMore,
    loadMore,
    addOptimisticMessage,
    clearMessages,
    updateMessage,
  };
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
