"use client";

import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { useSupabaseUser } from "@/hooks/useSupabaseUser";
import { usePrivateKey } from "@/hooks/usePrivateKey";
import { useRealtimeMessages, RawMessage } from "@/hooks/useRealtimeMessages";
import { usePresence } from "@/hooks/usePresence";
import { createClient } from "@/lib/supabase/client";
import ChatWindow from "@/components/ChatWindow";
import MessageInput from "@/components/MessageInput";
import EncryptionBadge from "@/components/EncryptionBadge";
import BlockButton from "@/components/BlockButton";
import PanicButton from "@/components/PanicButton";
import CallInterface from "@/components/CallInterface";
import { useWebRTC } from "@/hooks/useWebRTC";

const AVATAR_COLORS = [
  "conversation-avatar--yellow",
  "conversation-avatar--pink",
  "conversation-avatar--blue",
  "conversation-avatar--lime",
];

function getAvatarColor(id: string) {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = id.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

export default function ConversationPage() {
  const params = useParams();
  const partnerId = params?.userId as string;
  const { user } = useSupabaseUser();
  const { privateKey, hasKey } = usePrivateKey(user?.id);
  const { messages, loading, addOptimisticMessage, clearMessages } = useRealtimeMessages(user?.id, partnerId);
  const { partnerPresence, sendTyping } = usePresence(user?.id ?? "", partnerId);
  const [partnerName, setPartnerName] = useState("");
  const [partnerAvatar, setPartnerAvatar] = useState("");
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [replyTo, setReplyTo] = useState<RawMessage | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const {
    callState,
    localStream,
    remoteStream,
    incomingCallInfo,
    startCall,
    acceptCall,
    declineCall,
    endCall,
    isVideoEnabled,
    isAudioEnabled,
    toggleVideo,
    toggleAudio,
  } = useWebRTC(user?.id, partnerId);

  useEffect(() => {
    if (!partnerId) return;
    async function fetchPartner() {
      const supabase = createClient();
      const { data } = await supabase.from("users").select("username, avatar_url").eq("id", partnerId).single();
      if (data) {
        setPartnerName(data.username);
        if (data.avatar_url) setPartnerAvatar(data.avatar_url);
      }
    }
    fetchPartner();
  }, [partnerId]);

  // Close menu on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const handleClearChat = async () => {
    if (!user?.id || clearing) return;
    setClearing(true);
    const supabase = createClient();
    await supabase.from("messages").delete().eq("sender_id", user.id).eq("receiver_id", partnerId);
    await supabase.from("messages").delete().eq("sender_id", partnerId).eq("receiver_id", user.id);
    clearMessages();
    setClearing(false);
    setShowClearConfirm(false);
    setMenuOpen(false);
  };

  if (!user) return null;

  return (
    /* Fixed flex column — header + messages (scroll) + input (fixed bottom) */
    <div className="conversation-layout">
      {/* ── Chat Header ── */}
      <div className="chat-header">
        <div className="chat-header-user">
          <div style={{ position: "relative" }}>
            <div className={`conversation-avatar ${partnerAvatar ? "" : getAvatarColor(partnerId)}`}>
              {partnerAvatar ? (
                <img src={partnerAvatar} alt="Avatar" />
              ) : partnerName ? (
                partnerName.slice(0, 2).toUpperCase()
              ) : (
                ".."
              )}
            </div>
            {partnerPresence.isOnline && <span className="avatar-online-dot" />}
          </div>
          <div className="chat-header-info">
            <h3>{partnerName || "Loading..."}</h3>
            <div className="chat-header-status">
              {partnerPresence.isTyping
                ? <span className="typing-status">✍️ typing...</span>
                : <EncryptionBadge />}
            </div>
          </div>
        </div>

        <div className="chat-header-actions" style={{ display: "flex", gap: "8px", alignItems: "center" }}>
          <button className="header-menu-btn" onClick={() => startCall(false)} title="Audio Call">📞</button>
          <button className="header-menu-btn" onClick={() => startCall(true)} title="Video Call">🎥</button>

          {/* SOS always visible */}
          <PanicButton currentUserId={user.id} partnerId={partnerId} />

          {/* 3-dots menu */}
          <div className="header-menu-wrap" ref={menuRef}>
            <button
              className="header-menu-btn"
              onClick={() => setMenuOpen((o) => !o)}
              title="More options"
              aria-label="More options"
            >
              ⋮
            </button>

            {menuOpen && (
              <div className="header-dropdown">
                <div className="header-dropdown-item" onClick={() => { setShowClearConfirm(true); setMenuOpen(false); }}>
                  <span>🗑️</span> Clear Chat
                </div>
                <div className="header-dropdown-divider" />
                <div className="header-dropdown-item--block">
                  <BlockButton targetUserId={partnerId} currentUserId={user.id} inMenu />
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <CallInterface
        callState={callState}
        localStream={localStream}
        remoteStream={remoteStream}
        incomingCallInfo={incomingCallInfo}
        partnerName={partnerName}
        partnerAvatar={partnerAvatar}
        isVideoEnabled={isVideoEnabled}
        isAudioEnabled={isAudioEnabled}
        onAccept={acceptCall}
        onDecline={declineCall}
        onEndCall={endCall}
        onToggleVideo={toggleVideo}
        onToggleAudio={toggleAudio}
      />

      {/* ── Clear Chat Confirm ── */}
      {showClearConfirm && (
        <div className="confirm-overlay" onClick={() => setShowClearConfirm(false)}>
          <div className="confirm-dialog" onClick={(e) => e.stopPropagation()}>
            <div className="confirm-icon">🗑️</div>
            <h3>Clear Chat?</h3>
            <p>Permanently deletes all messages for <strong>both sides</strong>. Cannot be undone.</p>
            <div className="confirm-actions">
              <button className="btn btn--secondary" onClick={() => setShowClearConfirm(false)} disabled={clearing}>Cancel</button>
              <button className="btn btn--danger" onClick={handleClearChat} disabled={clearing}>
                {clearing ? "Clearing..." : "Yes, Clear"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Messages (scrollable middle) ── */}
      <div className="conversation-messages">
        {loading ? (
          <div className="loading-center"><div className="spinner" /></div>
        ) : (
          <ChatWindow
            messages={messages}
            currentUserId={user.id}
            privateKey={privateKey}
            hasKey={hasKey}
            partnerPresence={partnerPresence}
            partnerName={partnerName}
            onReply={setReplyTo}
          />
        )}
      </div>

      {/* ── Input (fixed bottom) ── */}
      <div className="conversation-input">
        <MessageInput
          receiverId={partnerId}
          currentUserId={user.id}
          onMessageSent={addOptimisticMessage}
          onTyping={sendTyping}
          replyTo={replyTo}
          onCancelReply={() => setReplyTo(null)}
        />
      </div>
    </div>
  );
}
