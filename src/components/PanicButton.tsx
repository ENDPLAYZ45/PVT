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

    // 1. Replace URL and redirect instantly to the notes decoy
    //    replaceState first so browser history doesn't show /chat
    window.history.replaceState(null, "", "/notes");
    router.replace("/notes");

    // 2. Notify partner silently in background
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
        // Silent
      }
    })();
  };

  return (
    <button
      id="panic-button"
      className="panic-btn"
      onClick={handlePanic}
      title="Someone nearby? Tap to hide instantly"
    >
      <span className="panic-btn-dot" />
      SOS
    </button>
  );
}
