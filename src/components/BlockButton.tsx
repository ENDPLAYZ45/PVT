"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";

interface BlockButtonProps {
  targetUserId: string;
  currentUserId: string;
  inMenu?: boolean; // renders as a dropdown item row instead of a button
}

export default function BlockButton({ targetUserId, currentUserId, inMenu }: BlockButtonProps) {
  const [blocked, setBlocked] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showConfirm, setShowConfirm] = useState(false);

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
      await supabase.from("blocked_users").delete()
        .eq("blocker_id", currentUserId).eq("blocked_id", targetUserId);
      setBlocked(false);
    } else {
      const { error } = await supabase.from("blocked_users").insert({
        blocker_id: currentUserId, blocked_id: targetUserId,
      });
      if (!error) setBlocked(true);
    }
    setLoading(false);
    setShowConfirm(false);
  };

  if (loading) {
    return inMenu
      ? <div className="header-dropdown-item" style={{ opacity: 0.4 }}>⏳ Loading...</div>
      : <button className="btn btn--small btn--secondary" disabled>...</button>;
  }

  // In-menu style: plain row
  if (inMenu) {
    return (
      <>
        <div
          className={`header-dropdown-item ${blocked ? "" : "header-dropdown-item--danger"}`}
          onClick={() => setShowConfirm(true)}
        >
          <span>{blocked ? "🔓" : "🚫"}</span>
          {blocked ? "Unblock User" : "Block User"}
        </div>

        {showConfirm && (
          <div className="confirm-overlay" onClick={() => setShowConfirm(false)}>
            <div className="confirm-dialog" onClick={(e) => e.stopPropagation()}>
              <div className="confirm-icon">{blocked ? "🔓" : "🚫"}</div>
              <h3>{blocked ? "Unblock User?" : "Block User?"}</h3>
              <p>
                {blocked
                  ? "They will be able to send you messages again."
                  : "They won't be able to message you. You can unblock anytime."}
              </p>
              <div className="confirm-actions">
                <button className="btn btn--secondary" onClick={() => setShowConfirm(false)}>Cancel</button>
                <button className={`btn ${blocked ? "btn--primary" : "btn--danger"}`} onClick={handleBlock}>
                  {blocked ? "Yes, Unblock" : "Yes, Block"}
                </button>
              </div>
            </div>
          </div>
        )}
      </>
    );
  }

  // Standalone button style
  return (
    <>
      <button
        className={`btn btn--small ${blocked ? "btn--secondary" : "btn--danger"}`}
        onClick={() => setShowConfirm(true)}
      >
        {blocked ? "🔓 Unblock" : "🚫 Block"}
      </button>
      {showConfirm && (
        <div className="confirm-overlay" onClick={() => setShowConfirm(false)}>
          <div className="confirm-dialog" onClick={(e) => e.stopPropagation()}>
            <div className="confirm-icon">{blocked ? "🔓" : "🚫"}</div>
            <h3>{blocked ? "Unblock?" : "Block User?"}</h3>
            <p>{blocked ? "They can message you again." : "They won't be able to message you."}</p>
            <div className="confirm-actions">
              <button className="btn btn--secondary" onClick={() => setShowConfirm(false)}>Cancel</button>
              <button className={`btn ${blocked ? "btn--primary" : "btn--danger"}`} onClick={handleBlock}>
                {blocked ? "Unblock" : "Block"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
