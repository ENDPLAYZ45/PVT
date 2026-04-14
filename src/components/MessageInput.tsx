"use client";

import { useState, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { encryptMessage } from "@/lib/crypto/encrypt";
import { encryptImageForUpload } from "@/lib/crypto/imageEncrypt";
import { RawMessage } from "@/hooks/useRealtimeMessages";

interface MessageInputProps {
  receiverId: string;
  currentUserId: string;
  onMessageSent: (msg: RawMessage) => void;
  onTyping: (isTyping: boolean) => void;
  replyTo: RawMessage | null;
  onCancelReply: () => void;
}

export default function MessageInput({
  receiverId,
  currentUserId,
  onMessageSent,
  onTyping,
  replyTo,
  onCancelReply,
}: MessageInputProps) {
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [imagePreview, setImagePreview] = useState<{ file: File; previewUrl: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const typingRef = useRef(false);

  const handleTextChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setText(e.target.value);
    if (!typingRef.current) {
      typingRef.current = true;
      onTyping(true);
    }
  };

  const handleBlur = () => {
    typingRef.current = false;
    onTyping(false);
  };

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) { setError("Only image files are supported"); return; }
    if (file.size > 5 * 1024 * 1024) { setError("Image must be under 5MB"); return; }
    const previewUrl = URL.createObjectURL(file);
    setImagePreview({ file, previewUrl });
    setError("");
  };

  const cancelImage = () => {
    if (imagePreview) URL.revokeObjectURL(imagePreview.previewUrl);
    setImagePreview(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleSend = async () => {
    if ((!text.trim() && !imagePreview) || sending) return;
    setSending(true);
    setError("");
    typingRef.current = false;
    onTyping(false);

    try {
      const supabase = createClient();

      const { data: receiverData } = await supabase.from("users").select("public_key").eq("id", receiverId).single();
      const { data: senderData } = await supabase.from("users").select("public_key").eq("id", currentUserId).single();

      if (!receiverData?.public_key) throw new Error("Could not fetch receiver's key");

      const receiverPublicKey = JSON.parse(receiverData.public_key) as JsonWebKey;
      const senderPublicKey = senderData?.public_key ? JSON.parse(senderData.public_key) as JsonWebKey : null;

      // Reply preview
      const replyPreview = replyTo
        ? (replyTo._plaintext ?? "🔒 Encrypted message").slice(0, 80)
        : null;

      if (imagePreview) {
        // ---- IMAGE SEND ----
        if (!senderPublicKey) throw new Error("No sender public key");

        const { encryptedBlob, ivBase64, aesKeyForReceiver, aesKeyForSender, mimeType } =
          await encryptImageForUpload(imagePreview.file, receiverPublicKey, senderPublicKey);

        // Upload encrypted blob to Supabase Storage
        const fileName = `${currentUserId}/${Date.now()}.enc`;
        const { error: uploadError } = await supabase.storage
          .from("chat-media")
          .upload(fileName, encryptedBlob, { contentType: "application/octet-stream" });

        if (uploadError) throw new Error("Upload failed: " + uploadError.message);

        // Generate a long-lived signed URL (1 year) — bucket is private, only auth users can access
        const { data: signedData, error: signErr } = await supabase.storage
          .from("chat-media")
          .createSignedUrl(fileName, 60 * 60 * 24 * 365); // 1 year

        if (signErr || !signedData?.signedUrl) throw new Error("Could not generate signed URL");

        const { data: msgData, error: insertError } = await supabase
          .from("messages")
          .insert({
            sender_id: currentUserId,
            receiver_id: receiverId,
            ciphertext: "__IMAGE__",
            sender_ciphertext: "__IMAGE__",
            message_type: "image",
            image_url: signedData.signedUrl,

            image_aes_key: aesKeyForReceiver,
            image_aes_key_sender: aesKeyForSender,
            image_iv: ivBase64,
            image_mime: mimeType,
            reply_to_id: replyTo?.id ?? null,
            reply_preview: replyPreview,
          })
          .select().single();

        if (insertError) throw insertError;
        if (msgData) onMessageSent({ ...msgData as RawMessage, _plaintext: "[Image]" });
        cancelImage();
      } else {
        // ---- TEXT SEND ----
        const plaintext = text.trim();
        const ciphertext = await encryptMessage(receiverPublicKey, plaintext);
        let sender_ciphertext: string | null = null;
        if (senderPublicKey) sender_ciphertext = await encryptMessage(senderPublicKey, plaintext);

        const { data: msgData, error: insertError } = await supabase
          .from("messages")
          .insert({
            sender_id: currentUserId,
            receiver_id: receiverId,
            ciphertext,
            sender_ciphertext,
            message_type: "text",
            reply_to_id: replyTo?.id ?? null,
            reply_preview: replyPreview,
          })
          .select().single();

        if (insertError) throw insertError;
        if (msgData) onMessageSent({ ...msgData as RawMessage, _plaintext: plaintext });
        setText("");
      }

      if (replyTo) onCancelReply();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send");
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  return (
    <div className="message-input-area">
      {error && <div className="auth-error" style={{ marginBottom: 8, fontSize: "0.82rem" }}>{error}</div>}

      {/* Reply bar */}
      {replyTo && (
        <div className="reply-bar">
          <div className="reply-bar-content">
            <span className="reply-bar-icon">↩</span>
            <span className="reply-bar-text">
              {replyTo._plaintext ?? "🔒 Encrypted message"}
            </span>
          </div>
          <button className="reply-bar-close" onClick={onCancelReply}>✕</button>
        </div>
      )}

      {/* Image preview */}
      {imagePreview && (
        <div className="image-preview-bar">
          <img src={imagePreview.previewUrl} alt="Preview" className="image-preview-thumb" />
          <span className="image-preview-name">{imagePreview.file.name}</span>
          <button className="reply-bar-close" onClick={cancelImage}>✕</button>
        </div>
      )}

      <div className="message-input-wrapper">
        {/* Image attach button */}
        <button
          className="attach-btn"
          onClick={() => fileInputRef.current?.click()}
          title="Send an image"
          disabled={sending}
        >
          📎
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          style={{ display: "none" }}
          onChange={handleImageSelect}
        />

        <input
          className="input"
          type="text"
          placeholder={imagePreview ? "Add a caption..." : "Type an encrypted message..."}
          value={text}
          onChange={handleTextChange}
          onKeyDown={handleKeyDown}
          onBlur={handleBlur}
          disabled={sending}
        />
        <button
          className="send-btn"
          onClick={handleSend}
          disabled={(!text.trim() && !imagePreview) || sending}
          title="Send encrypted message"
        >
          {sending ? "⏳" : "→"}
        </button>
      </div>
    </div>
  );
}
