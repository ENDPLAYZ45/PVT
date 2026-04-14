"use client";

import { useRouter } from "next/navigation";
import { useRef } from "react";
import { createClient } from "@/lib/supabase/client";

interface PanicButtonProps {
  currentUserId: string;
  partnerId: string;
}

export default function PanicButton({ currentUserId, partnerId }: PanicButtonProps) {
  const router = useRouter();
  const triggered = useRef(false);

  const handlePanic = () => {
    if (triggered.current) return;
    triggered.current = true;

    // 1. Redirect IMMEDIATELY — don't wait for anything
    router.push("/safe");

    // 2. Notify partner silently in the background (fire & forget)
    void (async () => {
      try {
        const supabase = createClient();
        await supabase.from("messages").insert({
          sender_id: currentUserId,
          receiver_id: partnerId,
          ciphertext: "__SYSTEM__PANIC__",
          sender_ciphertext: "__SYSTEM__PANIC__",
        });
      } catch {
        // Silent — don't block the redirect
      }
    })();
  };

  return (
    <button
      id="panic-button"
      className="panic-btn"
      onClick={handlePanic}
      title="Someone nearby? Tap to hide the app instantly"
    >
      <span className="panic-btn-dot" />
      SOS
    </button>
  );
}
