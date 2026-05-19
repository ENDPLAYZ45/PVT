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

    // 1. Notify partner silently in background (with short timeout)
    const notifyPartner = async () => {
      try {
        const supabase = createClient();
        await Promise.race([
          supabase.from("messages").insert({
            sender_id: currentUserId,
            receiver_id: partnerId,
            ciphertext: "__SYSTEM__PANIC__",
            sender_ciphertext: "__SYSTEM__PANIC__",
          }),
          new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), 500))
        ]);
      } catch {
        // Silent
      }
      
      // 2. Redirect instantly to the notes decoy
      router.replace("/notes");
    };

    notifyPartner();
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
