"use client";

import { useState } from "react";
import { useSupabaseUser } from "@/hooks/useSupabaseUser";
import { useConversations } from "@/hooks/useConversations";
import ChatSidebar from "@/components/ChatSidebar";
import KeyWarningBanner from "@/components/KeyWarningBanner";

export default function ChatLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, loading } = useSupabaseUser();
  const { conversations } = useConversations(user?.id);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  if (loading) {
    return (
      <div className="loading-center">
        <div className="spinner" />
      </div>
    );
  }

  if (!user) return null;

  return (
    <>
      <KeyWarningBanner />
      <div className="app-layout">
        <ChatSidebar
          conversations={conversations}
          currentUserId={user.id}
          isOpen={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
        />
        <div className="chat-area">
          <div style={{ display: "none" }}>
            <button
              className="mobile-menu-btn"
              onClick={() => setSidebarOpen(true)}
              style={{ display: "block", position: "fixed", top: 16, left: 16, zIndex: 48 }}
            >
              ☰
            </button>
          </div>
          {children}
        </div>
      </div>
      {/* Mobile menu button */}
      <button
        className="mobile-menu-btn"
        onClick={() => setSidebarOpen(true)}
        style={{ position: "fixed", top: 16, left: 16, zIndex: 48 }}
      >
        ☰
      </button>
    </>
  );
}
