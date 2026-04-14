"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

interface BlockButtonProps {
  targetUserId: string;
  currentUserId: string;
}

export default function BlockButton({
  targetUserId,
  currentUserId,
}: BlockButtonProps) {
  const [blocked, setBlocked] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleBlock = async () => {
    if (blocked) return;
    const confirmed = window.confirm(
      "Block this user? They won't be able to send you messages."
    );
    if (!confirmed) return;

    setLoading(true);
    const supabase = createClient();

    const { error } = await supabase.from("blocked_users").insert({
      blocker_id: currentUserId,
      blocked_id: targetUserId,
    });

    if (!error) {
      setBlocked(true);
    }
    setLoading(false);
  };

  return (
    <button
      className={`btn btn--small ${blocked ? "btn--secondary" : "btn--danger"}`}
      onClick={handleBlock}
      disabled={loading || blocked}
    >
      {blocked ? "Blocked" : loading ? "..." : "🚫 Block"}
    </button>
  );
}
