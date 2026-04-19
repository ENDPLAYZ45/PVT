"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { useSupabaseUser } from "@/hooks/useSupabaseUser";
import { useConversations } from "@/hooks/useConversations";
import ChatSidebar from "@/components/ChatSidebar";
import KeyWarningBanner from "@/components/KeyWarningBanner";
import { CallProvider, useCallContext } from "@/components/CallProvider";
import CallInterface from "@/components/CallInterface";

/** Renders the global call overlay — must be inside CallProvider */
function GlobalCallInterface() {
  const {
    callState, localStream, remoteStream, incomingCallInfo,
    callPartnerName, callPartnerAvatar,
    isVideoEnabled, isAudioEnabled,
    acceptCall, declineCall, endCall, toggleVideo, toggleAudio,
  } = useCallContext();

  return (
    <CallInterface
      callState={callState}
      localStream={localStream}
      remoteStream={remoteStream}
      incomingCallInfo={incomingCallInfo ? { isVideo: incomingCallInfo.isVideo } : null}
      partnerName={callPartnerName}
      partnerAvatar={callPartnerAvatar}
      isVideoEnabled={isVideoEnabled}
      isAudioEnabled={isAudioEnabled}
      onAccept={acceptCall}
      onDecline={declineCall}
      onEndCall={endCall}
      onToggleVideo={toggleVideo}
      onToggleAudio={toggleAudio}
    />
  );
}

export default function ChatLayout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useSupabaseUser();
  const { conversations } = useConversations(user?.id);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const params = useParams();
  const hasActiveChat = !!params?.userId;

  if (loading) {
    return (
      <div className="loading-center">
        <div className="spinner" />
      </div>
    );
  }

  if (!user) return null;

  return (
    <CallProvider currentUserId={user.id}>
      <KeyWarningBanner />
      {/* Global call overlay — receives calls on ANY page inside /chat */}
      <GlobalCallInterface />

      <div className="app-layout">
        <div className={`sidebar-panel ${hasActiveChat ? "sidebar-panel--hidden-mobile" : ""} ${sidebarOpen ? "sidebar-panel--open" : ""}`}>
          <ChatSidebar
            conversations={conversations}
            currentUserId={user.id}
            isOpen={sidebarOpen}
            onClose={() => setSidebarOpen(false)}
          />
        </div>

        <div className={`chat-area ${!hasActiveChat ? "chat-area--hidden-mobile" : ""}`} style={{ overflowY: "auto" }}>
          <div className="mobile-back-bar">
            <button className="mobile-back-btn" onClick={() => window.history.back()}>
              ← Back
            </button>
          </div>
          {children}
        </div>
      </div>
    </CallProvider>
  );
}
