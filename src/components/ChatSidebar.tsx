"use client";

import { useState } from "react";
import { useRouter, useParams } from "next/navigation";
import UserSearch from "./UserSearch";
import { createClient } from "@/lib/supabase/client";
import ThemeToggle from "./ThemeToggle";


const AVATAR_COLORS = [
  "conversation-avatar--yellow",
  "conversation-avatar--pink",
  "conversation-avatar--blue",
  "conversation-avatar--lime",
];

function getAvatarColor(id: string) {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = id.charCodeAt(i) + ((hash << 5) - hash);
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

function formatTime(dateStr: string) {
  const d = new Date(dateStr);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  const hours = diff / (1000 * 60 * 60);

  if (hours < 1) return `${Math.floor(diff / (1000 * 60))}m`;
  if (hours < 24) return `${Math.floor(hours)}h`;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

interface Conversation {
  user_id: string;
  username: string;
  avatar_url?: string;
  last_message_at: string;
  unread: boolean;
}

interface ChatSidebarProps {
  conversations: Conversation[];
  currentUserId: string;
  isOpen: boolean;
  onClose: () => void;
}

export default function ChatSidebar({
  conversations,
  currentUserId,
  isOpen,
  onClose,
}: ChatSidebarProps) {
  const [showSearch, setShowSearch] = useState(false);
  const router = useRouter();
  const params = useParams();
  const activeUserId = params?.userId as string | undefined;

  const handleLogout = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
  };

  return (
    <>
      <div
        className={`sidebar-overlay ${isOpen ? "sidebar-overlay--visible" : ""}`}
        onClick={onClose}
      />
      <aside className={`sidebar ${isOpen ? "sidebar--open" : ""}`}>
        <div className="sidebar-header">
          <h2>
            <span>🔐</span> PVT
          </h2>
          <div style={{ display: "flex", gap: 6 }}>
            <ThemeToggle />
            <button
              className="btn btn--small btn--secondary"
              onClick={() => setShowSearch(true)}
              title="Search users"
            >
              🔍
            </button>
            <button
              className="btn btn--small btn--secondary"
              onClick={() => router.push("/settings")}
              title="Settings"
            >
              ⚙️
            </button>
            <button
              className="btn btn--small btn--danger"
              onClick={handleLogout}
              title="Logout"
            >
              ↗
            </button>
          </div>

        </div>

        <div className="sidebar-conversations">
          {conversations.length === 0 && (
            <div style={{ padding: 24, textAlign: "center", color: "var(--text-muted)" }}>
              <p style={{ fontSize: "1.5rem", marginBottom: 8 }}>💬</p>
              <p style={{ fontWeight: 600 }}>No conversations yet</p>
              <p style={{ fontSize: "0.82rem", marginTop: 4 }}>
                Search for users to start chatting
              </p>
            </div>
          )}
          {conversations.map((convo) => (
            <div
              key={convo.user_id}
              className={`conversation-item ${
                activeUserId === convo.user_id ? "conversation-item--active" : ""
              }`}
              onClick={() => {
                router.push(`/chat/${convo.user_id}`);
                onClose();
              }}
            >
              <div
                className={`conversation-avatar ${convo.avatar_url ? "" : getAvatarColor(convo.user_id)}`}
                style={{ width: "45px", height: "45px", borderRadius: "50%", flexShrink: 0, overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1.2rem", fontWeight: "bold" }}
              >
                {convo.avatar_url ? (
                  <img src={convo.avatar_url} alt="Avatar" style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: "50%" }} />
                ) : (
                  convo.username.slice(0, 2).toUpperCase()
                )}
              </div>
              <div className="conversation-info">
                <div className="conversation-name">{convo.username}</div>
                <div className="conversation-preview">🔒 Encrypted message</div>
              </div>
              <div className="conversation-meta">
                <span className="conversation-time">
                  {formatTime(convo.last_message_at)}
                </span>
                {convo.unread && <div className="conversation-unread" />}
              </div>
            </div>
          ))}
        </div>
      </aside>

      {showSearch && (
        <UserSearch
          onClose={() => setShowSearch(false)}
          currentUserId={currentUserId}
        />
      )}
    </>
  );
}
