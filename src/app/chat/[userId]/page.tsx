"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useSupabaseUser } from "@/hooks/useSupabaseUser";
import { usePrivateKey } from "@/hooks/usePrivateKey";
import { useRealtimeMessages } from "@/hooks/useRealtimeMessages";
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
  for (let i = 0; i < id.length; i++) {
    hash = id.charCodeAt(i) + ((hash << 5) - hash);
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

export default function ConversationPage() {
  const params = useParams();
  const partnerId = params?.userId as string;
  const { user } = useSupabaseUser();
  const { privateKey, hasKey } = usePrivateKey(user?.id);
  const { messages, loading, addOptimisticMessage, clearMessages } =
    useRealtimeMessages(user?.id, partnerId);
  const [partnerName, setPartnerName] = useState("");
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [clearing, setClearing] = useState(false);

  useEffect(() => {
    if (!partnerId) return;

    async function fetchPartner() {
      const supabase = createClient();
      const { data } = await supabase
        .from("users")
        .select("username")
        .eq("id", partnerId)
        .single();

      if (data) setPartnerName(data.username);
    }

    fetchPartner();
  }, [partnerId]);

  // Mark received messages as delivered
  useEffect(() => {
    if (!user?.id || !messages.length) return;

    async function markDelivered() {
      const supabase = createClient();
      const undelivered = messages.filter(
        (m) => m.receiver_id === user!.id && !m.delivered_at
      );

      for (const msg of undelivered) {
        await supabase
          .from("messages")
          .update({ delivered_at: new Date().toISOString() })
          .eq("id", msg.id);
      }
    }

    markDelivered();
  }, [messages, user?.id]);

  const handleClearChat = async () => {
    if (!user?.id || clearing) return;
    setClearing(true);

    const supabase = createClient();

    // Delete all messages in this conversation where the current user is sender or receiver
    await supabase
      .from("messages")
      .delete()
      .or(
        `and(sender_id.eq.${user.id},receiver_id.eq.${partnerId}),and(sender_id.eq.${partnerId},receiver_id.eq.${user.id})`
      );

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
          <div className={`conversation-avatar ${getAvatarColor(partnerId)}`}>
            {partnerName ? partnerName.slice(0, 2) : ".."}
          </div>
          <div className="chat-header-info">
            <h3>{partnerName || "Loading..."}</h3>
            <div className="chat-header-status">
              <EncryptionBadge />
            </div>
          </div>
        </div>
        <div className="chat-header-actions">
          {/* Panic Button */}
          <PanicButton currentUserId={user.id} partnerId={partnerId} />
          {/* Clear Chat Button */}
          <button
            className="btn btn--small btn--danger"
            onClick={() => setShowClearConfirm(true)}
            title="Clear all messages in this chat"
          >
            🗑️ Clear
          </button>
          <BlockButton targetUserId={partnerId} currentUserId={user.id} />
        </div>
      </div>

      {/* Clear Chat Confirmation Dialog */}
      {showClearConfirm && (
        <div className="confirm-overlay" onClick={() => setShowClearConfirm(false)}>
          <div className="confirm-dialog" onClick={(e) => e.stopPropagation()}>
            <div className="confirm-icon">🗑️</div>
            <h3>Clear Chat?</h3>
            <p>
              This will permanently delete all messages in this conversation for
              <strong> both sides</strong>. This cannot be undone.
            </p>
            <div className="confirm-actions">
              <button
                className="btn btn--secondary"
                onClick={() => setShowClearConfirm(false)}
                disabled={clearing}
              >
                Cancel
              </button>
              <button
                className="btn btn--danger"
                onClick={handleClearChat}
                disabled={clearing}
              >
                {clearing ? "Clearing..." : "Yes, Clear Chat"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Messages */}
      {loading ? (
        <div className="loading-center">
          <div className="spinner" />
        </div>
      ) : (
        <ChatWindow
          messages={messages}
          currentUserId={user.id}
          privateKey={privateKey}
          hasKey={hasKey}
        />
      )}

      {/* Input */}
      <MessageInput
        receiverId={partnerId}
        currentUserId={user.id}
        onMessageSent={addOptimisticMessage}
      />
    </>
  );
}
