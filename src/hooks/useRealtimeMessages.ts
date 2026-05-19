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
const POLL_INTERVAL_MS = 3000; // fallback poll every 3s

export function useRealtimeMessages(
  currentUserId: string | undefined,
  partnerId: string | undefined
) {
  const [messages, setMessages] = useState<RawMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(false);
  const oldestCreatedAt = useRef<string | null>(null);
  const lastKnownCount = useRef(0);

  // ─── fetchMessages ────────────────────────────────────────────────────────
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
      console.error("[Messages] fetch error:", error.message);
      return;
    }

    if (data) {
      const sorted = (data as RawMessage[]).reverse();
      oldestCreatedAt.current = sorted[0]?.created_at ?? null;
      setHasMore((count ?? 0) > PAGE_SIZE);
      lastKnownCount.current = count ?? 0;

      const msgIds = sorted.map(m => m.id);
      const { data: reactData } = await supabase
        .from("message_reactions")
        .select("message_id, emoji, user_id")
        .in("message_id", msgIds.length ? msgIds : ["00000000-0000-0000-0000-000000000000"]);

      setMessages(prev => {
        const prevMap = new Map(prev.map(m => [m.id, m]));
        return sorted.map(msg => ({
          ...msg,
          _reactions: buildReactions(reactData || [], msg.id, currentUserId!),
          // Keep _isNew only for genuinely new messages (not in previous state)
          _isNew: !prevMap.has(msg.id),
        }));
      });
    }

    setLoading(false);
  }, [currentUserId, partnerId]);

  // Keep a ref to fetchMessages so realtime/polling callbacks always call the
  // latest version without needing to recreate the subscription.
  const fetchMessagesRef = useRef(fetchMessages);
  useEffect(() => {
    fetchMessagesRef.current = fetchMessages;
  }, [fetchMessages]);

  // Initial load
  useEffect(() => {
    setLoading(true);
    setMessages([]);
    lastKnownCount.current = 0;
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
  // Strategy: subscribe WITHOUT a filter (broad channel). Filter client-side.
  // Filtered subscriptions require specific Supabase Realtime config to work
  // reliably. Broad subscriptions always work.
  useEffect(() => {
    if (!currentUserId || !partnerId) return;
    const supabase = createClient();

    const channelName = `chat:${currentUserId}:${partnerId}`;

    const channel = supabase
      .channel(channelName)
      .on(
        "postgres_changes",
        // No filter — receive ALL message events, filter client-side below
        { event: "*", schema: "public", table: "messages" },
        payload => {
          const row = (payload.new ?? payload.old) as Partial<RawMessage>;
          const sid = row?.sender_id;
          const rid = row?.receiver_id;

          // Client-side filter: only process events for THIS conversation
          const isRelevant =
            (sid === currentUserId && rid === partnerId) ||
            (sid === partnerId && rid === currentUserId);

          if (!isRelevant) return;

          if (payload.eventType === "INSERT") {
            console.log("[Realtime] INSERT — refetching");
            fetchMessagesRef.current();
          } else if (payload.eventType === "UPDATE") {
            const updated = payload.new as RawMessage;
            setMessages(prev =>
              prev.map(m => (m.id === updated.id ? { ...m, ...updated } : m))
            );
          } else if (payload.eventType === "DELETE") {
            const deleted = payload.old as { id: string };
            setMessages(prev => prev.filter(m => m.id !== deleted.id));
          }
        }
      )
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
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          console.warn("[Realtime] Connection issue — polling will cover");
        }
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentUserId, partnerId]);

  // ─── Polling fallback ─────────────────────────────────────────────────────
  // Realtime can be unreliable in some Supabase tiers / network conditions.
  // This poll runs every 3s and refetches only if the tab is visible.
  // The decryption cache in ChatWindow ensures only new messages are re-decrypted.
  useEffect(() => {
    if (!currentUserId || !partnerId) return;

    const interval = setInterval(() => {
      if (document.visibilityState === "visible") {
        fetchMessagesRef.current();
      }
    }, POLL_INTERVAL_MS);

    // Also refetch immediately when the user switches back to the tab
    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        fetchMessagesRef.current();
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [currentUserId, partnerId]);

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

    const now = new Date().toISOString();
    supabase
      .from("messages")
      .update({ read_at: now, delivered_at: now })
      .in("id", ids)
      .then(() => {});
  }, [messages, currentUserId, partnerId]);

  // ─── Helpers ──────────────────────────────────────────────────────────────
  const addOptimisticMessage = useCallback((msg: RawMessage) => {
    setMessages(prev => {
      if (prev.some(m => m.id === msg.id)) return prev;
      return [...prev, { ...msg, _reactions: [], _isNew: true }];
    });
  }, []);

  const clearMessages = useCallback(() => {
    setMessages([]);
    lastKnownCount.current = 0;
  }, []);

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
