"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

interface Conversation {
  user_id: string;
  username: string;
  avatar_url?: string;
  last_message_at: string;
  unread: number; // now a count, not a boolean
}

export function useConversations(currentUserId: string | undefined) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!currentUserId) return;

    const supabase = createClient();

    async function fetchConversations() {
      // Get all messages involving the current user
      const { data: messages, error } = await supabase
        .from("messages")
        .select("sender_id, receiver_id, created_at, read_at")
        .or(`sender_id.eq.${currentUserId},receiver_id.eq.${currentUserId}`)
        .order("created_at", { ascending: false });

      if (error || !messages) {
        setLoading(false);
        return;
      }

      // Group by conversation partner — track last message time and unread count
      const partnerMap = new Map<
        string,
        { last_message_at: string; unread: number }
      >();

      for (const msg of messages) {
        const partnerId =
          msg.sender_id === currentUserId ? msg.receiver_id : msg.sender_id;

        if (!partnerMap.has(partnerId)) {
          partnerMap.set(partnerId, {
            last_message_at: msg.created_at,
            unread: 0,
          });
        }

        // Count unread: messages sent TO me that I haven't read yet
        if (msg.receiver_id === currentUserId && !msg.read_at) {
          const entry = partnerMap.get(partnerId)!;
          entry.unread++;
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

      const convos: Conversation[] = (users || []).map(u => ({
        user_id: u.id,
        username: u.username,
        avatar_url: u.avatar_url,
        last_message_at: partnerMap.get(u.id)?.last_message_at || "",
        unread: partnerMap.get(u.id)?.unread || 0,
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

    // Subscribe to messages involving the current user for real-time sidebar updates
    const channel = supabase
      .channel(`sidebar:${currentUserId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "messages",
          filter: `sender_id=eq.${currentUserId}`,
        },
        (_payload: any) => {
          fetchConversations();
        }
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "messages",
          filter: `receiver_id=eq.${currentUserId}`,
        },
        (_payload: any) => {
          fetchConversations();
        }
      )
      .subscribe((status) => {
        console.log(`[Realtime] Sidebar subscription status:`, status);
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentUserId]);

  return { conversations, loading, setConversations };
}
