"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

interface Conversation {
  user_id: string;
  username: string;
  avatar_url?: string;
  last_message_at: string;
  unread: boolean;
}

export function useConversations(currentUserId: string | undefined) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!currentUserId) return;

    async function fetchConversations() {
      const supabase = createClient();

      // Get all messages involving the current user
      const { data: messages, error } = await supabase
        .from("messages")
        .select("sender_id, receiver_id, created_at, delivered_at")
        .or(`sender_id.eq.${currentUserId},receiver_id.eq.${currentUserId}`)
        .order("created_at", { ascending: false });

      if (error || !messages) {
        setLoading(false);
        return;
      }

      // Group by conversation partner
      const partnerMap = new Map<
        string,
        { last_message_at: string; unread: boolean }
      >();

      for (const msg of messages) {
        const partnerId =
          msg.sender_id === currentUserId ? msg.receiver_id : msg.sender_id;

        if (!partnerMap.has(partnerId)) {
          const isUnread =
            msg.receiver_id === currentUserId && !msg.delivered_at;
          partnerMap.set(partnerId, {
            last_message_at: msg.created_at,
            unread: isUnread,
          });
        }
      }

      // Fetch usernames for all partners
      const partnerIds = Array.from(partnerMap.keys());
      if (partnerIds.length === 0) {
        setConversations([]);
        setLoading(false);
        return;
      }

      const { data: users } = await supabase
        .from("users")
        .select("id, username, avatar_url")
        .in("id", partnerIds);

      const convos: Conversation[] = (users || []).map((u) => ({
        user_id: u.id,
        username: u.username,
        avatar_url: u.avatar_url,
        last_message_at: partnerMap.get(u.id)?.last_message_at || "",
        unread: partnerMap.get(u.id)?.unread || false,
      }));

      // Sort by most recent
      convos.sort(
        (a, b) =>
          new Date(b.last_message_at).getTime() -
          new Date(a.last_message_at).getTime()
      );

      setConversations(convos);
      setLoading(false);
    }

    fetchConversations();
  }, [currentUserId]);

  return { conversations, loading, setConversations };
}
