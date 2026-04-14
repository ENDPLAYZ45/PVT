"use client";

import { useEffect, useState } from "react";
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
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [replyTo, setReplyTo] = useState<RawMessage | null>(null);

  useEffect(() => {
    if (!partnerId) return;
    async function fetchPartner() {
      const supabase = createClient();
      const { data } = await supabase.from("users").select("username").eq("id", partnerId).single();
      if (data) setPartnerName(data.username);
    }
    fetchPartner();
  }, [partnerId]);

  const handleClearChat = async () => {
    if (!user?.id || clearing) return;
    setClearing(true);
    const supabase = createClient();
    await supabase.from("messages").delete().eq("sender_id", user.id).eq("receiver_id", partnerId);
    await supabase.from("messages").delete().eq("sender_id", partnerId).eq("receiver_id", user.id);
    clearMessages();
    setClearing(false);
    setShowClearConfirm(false);
  };

  if (!user) return null;

  return (
    <>
      {/* Chat Header */}
      <div className="chat-header">
        <div className="chat-header-user">
          <div style={{ position: "relative" }}>
            <div className={`conversation-avatar ${getAvatarColor(partnerId)}`}>
              {partnerName ? partnerName.slice(0, 2) : ".."}
            </div>
            {partnerPresence.isOnline && <span className="avatar-online-dot" />}
          </div>
          <div className="chat-header-info">
            <h3>{partnerName || "Loading..."}</h3>
            <div className="chat-header-status">
              {partnerPresence.isTyping
                ? <span className="typing-status">typing...</span>
                : <EncryptionBadge />}
            </div>
          </div>
        </div>
        <div className="chat-header-actions">
          <PanicButton currentUserId={user.id} partnerId={partnerId} />
          <button className="btn btn--small btn--danger" onClick={() => setShowClearConfirm(true)} title="Clear chat">
            🗑️
          </button>
          <BlockButton targetUserId={partnerId} currentUserId={user.id} />
        </div>
      </div>

      {/* Clear Chat Confirm */}
      {showClearConfirm && (
        <div className="confirm-overlay" onClick={() => setShowClearConfirm(false)}>
          <div className="confirm-dialog" onClick={(e) => e.stopPropagation()}>
            <div className="confirm-icon">🗑️</div>
            <h3>Clear Chat?</h3>
            <p>Permanently deletes all messages for <strong>both sides</strong>. Cannot be undone.</p>
            <div className="confirm-actions">
              <button className="btn btn--secondary" onClick={() => setShowClearConfirm(false)} disabled={clearing}>Cancel</button>
              <button className="btn btn--danger" onClick={handleClearChat} disabled={clearing}>
                {clearing ? "Clearing..." : "Yes, Clear Chat"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Messages */}
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

      {/* Input */}
      <MessageInput
        receiverId={partnerId}
        currentUserId={user.id}
        onMessageSent={addOptimisticMessage}
        onTyping={sendTyping}
        replyTo={replyTo}
        onCancelReply={() => setReplyTo(null)}
      />
    </>
  );
}
