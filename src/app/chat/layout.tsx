"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useSupabaseUser } from "@/hooks/useSupabaseUser";
import { useConversations } from "@/hooks/useConversations";
import ChatSidebar from "@/components/ChatSidebar";
import KeyWarningBanner from "@/components/KeyWarningBanner";

export default function ChatLayout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useSupabaseUser();
  const { conversations } = useConversations(user?.id);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [wallpaper, setWallpaper] = useState("");
  const params = useParams();
  const hasActiveChat = !!params?.userId; // true when a conversation is open

  useEffect(() => {
    if (!user) return;
    const fetchWallpaper = async () => {
      const supabase = createClient();
      const { data } = await supabase.from("users").select("wallpaper").eq("id", user.id).single();
      if (data?.wallpaper) setWallpaper(data.wallpaper);
    };
    fetchWallpaper();
  }, [user]);

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
        {/* Sidebar — hidden on mobile when a chat is open */}
        <div className={`sidebar-panel ${hasActiveChat ? "sidebar-panel--hidden-mobile" : ""} ${sidebarOpen ? "sidebar-panel--open" : ""}`}>
          <ChatSidebar
            conversations={conversations}
            currentUserId={user.id}
            isOpen={sidebarOpen}
            onClose={() => setSidebarOpen(false)}
          />
        </div>

        {/* Chat area — hidden on mobile when NO chat is open */}
        <div 
          className={`chat-area ${!hasActiveChat ? "chat-area--hidden-mobile" : ""}`} 
          style={{ 
            overflowY: "auto",
            ...(wallpaper ? (
              wallpaper.startsWith("http") 
                ? { backgroundImage: `url(${wallpaper})`, backgroundSize: "cover", backgroundPosition: "center", backgroundAttachment: "fixed" }
                : { background: wallpaper }
            ) : {})
          }}
        >
          {/* Mobile back button — shown inside chat header via CSS class */}
          <div className="mobile-back-bar">
            <button
              className="mobile-back-btn"
              onClick={() => window.history.back()}
            >
              ← Back
            </button>
          </div>
          {children}
        </div>
      </div>
    </>
  );
}
