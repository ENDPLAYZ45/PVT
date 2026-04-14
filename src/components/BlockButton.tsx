"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";

interface BlockButtonProps {
  targetUserId: string;
  currentUserId: string;
}

export default function BlockButton({ targetUserId, currentUserId }: BlockButtonProps) {
  const [blocked, setBlocked] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showConfirm, setShowConfirm] = useState(false);

  // Check if already blocked on mount
  useEffect(() => {
    async function checkBlocked() {
      const supabase = createClient();
      const { data } = await supabase
        .from("blocked_users")
        .select("id")
        .eq("blocker_id", currentUserId)
        .eq("blocked_id", targetUserId)
        .maybeSingle();
      setBlocked(!!data);
      setLoading(false);
    }
    checkBlocked();
  }, [currentUserId, targetUserId]);

  const handleBlock = async () => {
    setLoading(true);
    const supabase = createClient();

    if (blocked) {
      // Unblock
      await supabase
        .from("blocked_users")
        .delete()
        .eq("blocker_id", currentUserId)
        .eq("blocked_id", targetUserId);
      setBlocked(false);
    } else {
      // Block
      const { error } = await supabase.from("blocked_users").insert({
        blocker_id: currentUserId,
        blocked_id: targetUserId,
      });
      if (!error) setBlocked(true);
      else console.error("Block failed:", error.message);
    }

    setLoading(false);
    setShowConfirm(false);
  };

  if (loading) return <button className="btn btn--small btn--secondary" disabled>...</button>;

  return (
    <>
      <button
        className={`btn btn--small ${blocked ? "btn--secondary" : "btn--danger"}`}
        onClick={() => setShowConfirm(true)}
        title={blocked ? "Unblock this user" : "Block this user"}
      >
        {blocked ? "🔓 Unblock" : "🚫 Block"}
      </button>

      {showConfirm && (
        <div className="confirm-overlay" onClick={() => setShowConfirm(false)}>
          <div className="confirm-dialog" onClick={(e) => e.stopPropagation()}>
            <div className="confirm-icon">{blocked ? "🔓" : "🚫"}</div>
            <h3>{blocked ? "Unblock User?" : "Block User?"}</h3>
            <p>
              {blocked
                ? "They will be able to send you messages again."
                : "They won't be able to send you messages. You can unblock them anytime."}
            </p>
            <div className="confirm-actions">
              <button className="btn btn--secondary" onClick={() => setShowConfirm(false)}>
                Cancel
              </button>
              <button
                className={`btn ${blocked ? "btn--primary" : "btn--danger"}`}
                onClick={handleBlock}
              >
                {blocked ? "Yes, Unblock" : "Yes, Block"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
