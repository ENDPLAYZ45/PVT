"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { encryptMessage } from "@/lib/crypto/encrypt";

interface MessageInputProps {
  receiverId: string;
  currentUserId: string;
  onMessageSent: (msg: {
    id: string;
    sender_id: string;
    receiver_id: string;
    ciphertext: string;
    sender_ciphertext: string | null;
    delivered_at: null;
    created_at: string;
    _plaintext?: string; // local-only plaintext for optimistic display
  }) => void;
}

export default function MessageInput({
  receiverId,
  currentUserId,
  onMessageSent,
}: MessageInputProps) {
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");

  const handleSend = async () => {
    if (!text.trim() || sending) return;

    const plaintext = text.trim();
    setSending(true);
    setError("");

    try {
      const supabase = createClient();

      // 1. Fetch receiver's public key
      const { data: receiverData, error: fetchError } = await supabase
        .from("users")
        .select("public_key")
        .eq("id", receiverId)
        .single();

      if (fetchError || !receiverData) {
        throw new Error("Could not fetch receiver's public key");
      }

      // 2. Fetch sender's own public key (for self-decryption)
      const { data: senderData } = await supabase
        .from("users")
        .select("public_key")
        .eq("id", currentUserId)
        .single();

      const receiverPublicKey = JSON.parse(receiverData.public_key);

      // 3. Encrypt with receiver's key (so they can read it)
      const ciphertext = await encryptMessage(receiverPublicKey, plaintext);

      // 4. Encrypt with sender's own key (so sender can read their own messages)
      let sender_ciphertext: string | null = null;
      if (senderData?.public_key) {
        const senderPublicKey = JSON.parse(senderData.public_key);
        sender_ciphertext = await encryptMessage(senderPublicKey, plaintext);
      }

      // 5. Insert into messages table
      const { data: msgData, error: insertError } = await supabase
        .from("messages")
        .insert({
          sender_id: currentUserId,
          receiver_id: receiverId,
          ciphertext,
          sender_ciphertext,
        })
        .select()
        .single();

      if (insertError) throw insertError;

      // 6. Optimistic update — include plaintext so sender sees it immediately
      if (msgData) {
        onMessageSent({ ...msgData, _plaintext: plaintext });
      }

      setText("");
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Failed to send message";
      setError(message);
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="message-input-area">
      {error && (
        <div
          className="auth-error"
          style={{ marginBottom: 8, fontSize: "0.82rem" }}
        >
          {error}
        </div>
      )}
      <div className="message-input-wrapper">
        <input
          className="input"
          type="text"
          placeholder="Type an encrypted message..."
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={sending}
        />
        <button
          className="send-btn"
          onClick={handleSend}
          disabled={!text.trim() || sending}
          title="Send encrypted message"
        >
          {sending ? "⏳" : "→"}
        </button>
      </div>
    </div>
  );
}
