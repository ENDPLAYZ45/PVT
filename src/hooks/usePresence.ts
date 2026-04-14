"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";

export interface PartnerPresence {
  isOnline: boolean;
  isTyping: boolean;
  lastSeen: string | null;
}

export function usePresence(currentUserId: string, partnerId: string) {
  const [partnerPresence, setPartnerPresence] = useState<PartnerPresence>({
    isOnline: false,
    isTyping: false,
    lastSeen: null,
  });

  const channelRef = useRef<ReturnType<ReturnType<typeof createClient>["channel"]> | null>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const conversationId = [currentUserId, partnerId].sort().join("_");

  useEffect(() => {
    const supabase = createClient();

    const channel = supabase.channel(`presence:${conversationId}`, {
      config: { presence: { key: currentUserId } },
    });

    channel
      .on("presence", { event: "sync" }, () => {
        const state = channel.presenceState<{ typing: boolean; lastSeen: string }>();
        const partnerStates = state[partnerId];
        if (partnerStates && partnerStates.length > 0) {
          setPartnerPresence({
            isOnline: true,
            isTyping: partnerStates[0].typing ?? false,
            lastSeen: null,
          });
        } else {
          setPartnerPresence((prev) => ({ ...prev, isOnline: false }));
        }
      })
      .on("presence", { event: "join" }, ({ key, newPresences }) => {
        if (key === partnerId) {
          setPartnerPresence((prev) => ({
            ...prev,
            isOnline: true,
            isTyping: (newPresences as Array<{ typing?: boolean }>)[0]?.typing ?? false,
          }));
        }
      })
      .on("presence", { event: "leave" }, ({ key }) => {
        if (key === partnerId) {
          setPartnerPresence({
            isOnline: false,
            isTyping: false,
            lastSeen: new Date().toISOString(),
          });
        }
      })
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          await channel.track({ typing: false, lastSeen: new Date().toISOString() });
        }
      });

    channelRef.current = channel;

    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentUserId, partnerId, conversationId]);

  const sendTyping = useCallback(async (isTyping: boolean) => {
    if (!channelRef.current) return;
    await channelRef.current.track({ typing: isTyping, lastSeen: new Date().toISOString() });

    if (isTyping) {
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = setTimeout(() => {
        sendTyping(false);
      }, 3000);
    }
  }, []);

  return { partnerPresence, sendTyping };
}
