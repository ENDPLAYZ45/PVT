"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { useSupabaseUser } from "@/hooks/useSupabaseUser";
import { useConversations } from "@/hooks/useConversations";
import ChatSidebar from "@/components/ChatSidebar";
import KeyWarningBanner from "@/components/KeyWarningBanner";
import { CallProvider, useCallContext } from "@/components/CallProvider";
import CallInterface from "@/components/CallInterface";
import { usePushNotifications } from "@/hooks/usePushNotifications";

/** Renders the global call overlay — must be inside CallProvider */
function GlobalCallInterface() {
  const {
    callState, localStream, remoteStream, incomingCallInfo,
    callPartnerName, callPartnerAvatar,
    isVideoEnabled, isAudioEnabled, isAccepting,
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
      isAccepting={isAccepting}
      onAccept={acceptCall}
      onDecline={declineCall}
      onEndCall={endCall}
      onToggleVideo={toggleVideo}
      onToggleAudio={toggleAudio}
    />
  );
}

import { motion, AnimatePresence } from "framer-motion";

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
        <AnimatePresence mode="wait">
          {!hasActiveChat ? (
            <motion.div
              key="sidebar"
              initial={{ x: -20, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: -20, opacity: 0 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
              className={`sidebar-panel ${sidebarOpen ? "sidebar-panel--open" : ""}`}
            >
              <ChatSidebar
                conversations={conversations}
                currentUserId={user.id}
                isOpen={sidebarOpen}
                onClose={() => setSidebarOpen(false)}
              />
            </motion.div>
          ) : (
            <div className="sidebar-panel sidebar-panel--hidden-mobile">
              <ChatSidebar
                conversations={conversations}
                currentUserId={user.id}
                isOpen={sidebarOpen}
                onClose={() => setSidebarOpen(false)}
              />
            </div>
          )}
        </AnimatePresence>

        <motion.div 
          layout
          className="chat-area"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
        >
          {children}
        </motion.div>
      </div>
    </CallProvider>
  );
}
