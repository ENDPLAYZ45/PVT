"use client";

import { useState } from "react";
import { useRouter, useParams } from "next/navigation";
import UserSearch from "./UserSearch";
import { createClient } from "@/lib/supabase/client";
import ThemeToggle from "./ThemeToggle";
import { usePushNotifications } from "@/hooks/usePushNotifications";

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

import { motion, AnimatePresence } from "framer-motion";
import { Search, Settings, LogOut, MessageSquare, Bell, ShieldCheck, Lock } from "lucide-react";

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

  const { isSupported, permission, isSubscribed, subscribe, loading } = usePushNotifications(currentUserId);

  const handleLogout = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
  };

  return (
    <>
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="sidebar-overlay sidebar-overlay--visible"
            onClick={onClose}
          />
        )}
      </AnimatePresence>

      <aside className={`sidebar ${isOpen ? "sidebar--open" : ""}`}>
        <div className="sidebar-header">
          <h2>
            <ShieldCheck size={24} className="text-brand" /> PVT
          </h2>
          <div style={{ display: "flex", gap: 8 }}>
            <ThemeToggle />
            <button
              className="btn btn--icon btn--secondary"
              onClick={() => setShowSearch(true)}
              title="Search users"
            >
              <Search size={18} />
            </button>
            <button
              className="btn btn--icon btn--secondary"
              onClick={() => router.push("/settings")}
              title="Settings"
            >
              <Settings size={18} />
            </button>
            <button
              className="btn btn--icon btn--danger"
              onClick={handleLogout}
              title="Logout"
            >
              <LogOut size={18} />
            </button>
          </div>
        </div>

        <div className="sidebar-conversations">
          {conversations.length === 0 && (
            <motion.div 
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="empty-state-container"
              style={{ padding: 40, textAlign: "center" }}
            >
              <div className="empty-state-icon" style={{ margin: "0 auto 20px" }}>
                <MessageSquare size={40} />
              </div>
              <h2>No chats yet</h2>
              <p>Search for users to start an encrypted conversation</p>
            </motion.div>
          )}
          
          <motion.div
            initial="hidden"
            animate="show"
            variants={{
              show: {
                transition: {
                  staggerChildren: 0.05
                }
              }
            }}
          >
            {conversations.map((convo) => (
              <motion.div
                key={convo.user_id}
                variants={{
                  hidden: { opacity: 0, x: -10 },
                  show: { opacity: 1, x: 0 }
                }}
                className={`conversation-item ${
                  activeUserId === convo.user_id ? "conversation-item--active" : ""
                }`}
                onClick={() => {
                  router.push(`/chat/${convo.user_id}`);
                  onClose();
                }}
              >
                <div className={`conversation-avatar ${convo.avatar_url ? "" : "conversation-avatar--brand"}`}>
                  {convo.avatar_url ? (
                    <img src={convo.avatar_url} alt="Avatar" />
                  ) : (
                    convo.username.slice(0, 2).toUpperCase()
                  )}
                </div>
                <div className="conversation-info">
                  <div className="conversation-name">{convo.username}</div>
                  <div className="conversation-preview">
                    <Lock size={12} style={{ display: 'inline', marginRight: 4, opacity: 0.6 }} />
                    Encrypted message
                  </div>
                </div>
                <div className="conversation-meta">
                  <span className="conversation-time">
                    {formatTime(convo.last_message_at)}
                  </span>
                  {convo.unread && <div className="conversation-unread" />}
                </div>
              </motion.div>
            ))}
          </motion.div>
        </div>

        {/* Push Notification Controls */}
        {isSupported && (
          <div className="sidebar-footer">
            <button 
              className={`btn btn--full ${isSubscribed ? 'btn--secondary' : 'btn--primary'}`}
              onClick={() => !isSubscribed && subscribe()}
              disabled={loading || (isSubscribed && permission === 'granted')}
              style={{ padding: '12px' }}
            >
              {loading ? 'Processing...' : (
                <span style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'center' }}>
                  <Bell size={16} />
                  {permission === 'denied' ? 'Notifications Blocked' :
                   isSubscribed ? 'Notifications Active' : 
                   'Enable Notifications'}
                </span>
              )}
            </button>
            {permission === 'denied' && (
              <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '8px', textAlign: 'center' }}>
                Please reset permissions in your browser.
              </p>
            )}
          </div>
        )}
      </aside>

      <AnimatePresence>
        {showSearch && (
          <UserSearch
            onClose={() => setShowSearch(false)}
            currentUserId={currentUserId}
          />
        )}
      </AnimatePresence>
    </>
  );
}
