"use client";

import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { useSupabaseUser } from "@/hooks/useSupabaseUser";
import { usePrivateKey } from "@/hooks/usePrivateKey";
import { useRealtimeMessages, RawMessage } from "@/hooks/useRealtimeMessages";
import { usePresence } from "@/hooks/usePresence";
import { createClient } from "@/lib/supabase/client";
import ChatWindow, { DecryptedMessage } from "@/components/ChatWindow";
import MessageInput from "@/components/MessageInput";
import EncryptionBadge from "@/components/EncryptionBadge";
import BlockButton from "@/components/BlockButton";
import PanicButton from "@/components/PanicButton";
import { useCallContext } from "@/components/CallProvider";

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
  const { messages, loading, addOptimisticMessage, clearMessages, updateMessage } = useRealtimeMessages(user?.id, partnerId);
  const { partnerPresence, sendTyping } = usePresence(user?.id ?? "", partnerId);
  const [partnerName, setPartnerName] = useState("");
  const [partnerAvatar, setPartnerAvatar] = useState("");
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [replyTo, setReplyTo] = useState<RawMessage | null>(null);
  const [editingMsg, setEditingMsg] = useState<DecryptedMessage | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const { startCall } = useCallContext();

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

  const handleDelete = async (id: string) => {
    updateMessage(id, { is_deleted: true });
    fetch(`/api/messages/${id}`, { method: "DELETE" }).catch(console.error);
  };

  const handleEditSent = (id: string, newPlaintext: string, ciphertext: string, senderCiphertext: string) => {
    updateMessage(id, {
      _plaintext: newPlaintext,
      ciphertext,
      sender_ciphertext: senderCiphertext,
      edited_at: new Date().toISOString(),
    });
  };

  if (!user) return null;

  return (
    <div className="conversation-layout">
      {/* ── Chat Header ── */}
      <div className="chat-header">
        <div className="chat-header-user">
          <div style={{ position: "relative" }}>
            <div className={`conversation-avatar ${partnerAvatar ? "" : getAvatarColor(partnerId)}`} style={{ width: "40px", height: "40px", borderRadius: "50%", flexShrink: 0, overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1.2rem", fontWeight: "bold" }}>
              {partnerAvatar ? (
                <img src={partnerAvatar} alt="Avatar" style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: "50%" }} />
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
          <button className="header-menu-btn" onClick={() => startCall(partnerId, partnerName, partnerAvatar, false)} title="Audio Call">📞</button>
          <button className="header-menu-btn" onClick={() => startCall(partnerId, partnerName, partnerAvatar, true)} title="Video Call">🎥</button>
          <PanicButton currentUserId={user.id} partnerId={partnerId} />

          <div className="header-menu-wrap" ref={menuRef}>
            <button className="header-menu-btn" onClick={() => setMenuOpen((o) => !o)} title="More options" aria-label="More options">⋮</button>
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

      {/* ── Messages ── */}
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
            onDelete={handleDelete}
            onEdit={setEditingMsg}
          />
        )}
      </div>

      {/* ── Input ── */}
      <div className="conversation-input">
        <MessageInput
          receiverId={partnerId}
          currentUserId={user.id}
          onMessageSent={addOptimisticMessage}
          onTyping={sendTyping}
          replyTo={replyTo}
          onCancelReply={() => setReplyTo(null)}
          editingMsg={editingMsg}
          onCancelEdit={() => setEditingMsg(null)}
          onEditSent={handleEditSent}
        />
      </div>
    </div>
  );
}
