"use client";

import { useState, useRef, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { encryptMessage } from "@/lib/crypto/encrypt";
import { encryptImageForUpload } from "@/lib/crypto/imageEncrypt";
import { RawMessage } from "@/hooks/useRealtimeMessages";
import { DecryptedMessage } from "@/components/ChatWindow";
import { storage } from "@/lib/firebase/client";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";

const INPUT_EMOJIS = [
  "😀","😂","❤️","😍","🔥","👍","😢","😮","🎉","💯",
  "😎","🤔","😴","🙏","💪","✅","🚀","👏","🥰","😜",
];

interface MessageInputProps {
  receiverId: string;
  currentUserId: string;
  onMessageSent: (msg: RawMessage) => void;
  onTyping: (isTyping: boolean) => void;
  replyTo: RawMessage | null;
  onCancelReply: () => void;
  editingMsg: DecryptedMessage | null;
  onCancelEdit: () => void;
  onEditSent: (id: string, newPlaintext: string, ciphertext: string, senderCiphertext: string) => void;
}

export default function MessageInput({
  receiverId,
  currentUserId,
  onMessageSent,
  onTyping,
  replyTo,
  onCancelReply,
  editingMsg,
  onCancelEdit,
  onEditSent,
}: MessageInputProps) {
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [imagePreview, setImagePreview] = useState<{ file: File; previewUrl: string } | null>(null);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const typingRef = useRef(false);
  const emojiRef = useRef<HTMLDivElement>(null);

  // Pre-fill input when entering edit mode
  useEffect(() => {
    if (editingMsg) {
      setText(editingMsg.plaintext);
      inputRef.current?.focus();
    } else {
      setText("");
    }
  }, [editingMsg]);

  // Close emoji picker on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (emojiRef.current && !emojiRef.current.contains(e.target as Node)) {
        setShowEmojiPicker(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

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

  const insertEmoji = (emoji: string) => {
    setText(prev => prev + emoji);
    setShowEmojiPicker(false);
    inputRef.current?.focus();
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

      // ---- EDIT MODE ----
      if (editingMsg) {
        const plaintext = text.trim();
        const { data: receiverData } = await supabase.from("users").select("public_key").eq("id", receiverId).single();
        const { data: senderData } = await supabase.from("users").select("public_key").eq("id", currentUserId).single();

        if (!receiverData?.public_key) throw new Error("Could not fetch receiver's key");
        const receiverPublicKey = JSON.parse(receiverData.public_key) as JsonWebKey;
        const senderPublicKey = senderData?.public_key ? JSON.parse(senderData.public_key) as JsonWebKey : null;

        const newCiphertext = await encryptMessage(receiverPublicKey, plaintext);
        const newSenderCiphertext = senderPublicKey ? await encryptMessage(senderPublicKey, plaintext) : newCiphertext;

        const res = await fetch(`/api/messages/${editingMsg.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ciphertext: newCiphertext, sender_ciphertext: newSenderCiphertext }),
        });

        if (!res.ok) throw new Error("Failed to edit message");
        onEditSent(editingMsg.id, plaintext, newCiphertext, newSenderCiphertext);
        onCancelEdit();
        setText("");
        return;
      }

      const { data: receiverData } = await supabase.from("users").select("public_key").eq("id", receiverId).single();
      const { data: senderData } = await supabase.from("users").select("public_key").eq("id", currentUserId).single();

      if (!receiverData?.public_key) throw new Error("Could not fetch receiver's key");
      const receiverPublicKey = JSON.parse(receiverData.public_key) as JsonWebKey;
      const senderPublicKey = senderData?.public_key ? JSON.parse(senderData.public_key) as JsonWebKey : null;

      // Reply preview — use decrypted plaintext
      const replyPreview = replyTo
        ? (replyTo._plaintext ?? "Message").slice(0, 80)
        : null;

      if (imagePreview) {
        // ---- IMAGE SEND ----
        if (!senderPublicKey) throw new Error("No sender public key");
        const { encryptedBlob, ivBase64, aesKeyForReceiver, aesKeyForSender, mimeType } =
          await encryptImageForUpload(imagePreview.file, receiverPublicKey, senderPublicKey);

        const fileName = `${currentUserId}/${Date.now()}.enc`;
        const storageRef = ref(storage, `chat-media/${fileName}`);
        await uploadBytes(storageRef, encryptedBlob, { contentType: "application/octet-stream" });
        const downloadUrl = await getDownloadURL(storageRef);

        const { data: msgData, error: insertError } = await supabase
          .from("messages")
          .insert({
            sender_id: currentUserId,
            receiver_id: receiverId,
            ciphertext: "__IMAGE__",
            sender_ciphertext: "__IMAGE__",
            message_type: "image",
            image_url: downloadUrl,
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
    if (e.key === "Escape") { onCancelEdit(); onCancelReply(); }
  };

  return (
    <div className="message-input-area">
      {error && <div className="auth-error" style={{ marginBottom: 8, fontSize: "0.82rem" }}>{error}</div>}

      {/* Edit bar */}
      {editingMsg && (
        <div className="reply-bar reply-bar--edit">
          <div className="reply-bar-content">
            <span className="reply-bar-icon">✏️</span>
            <span className="reply-bar-text">Editing: {editingMsg.plaintext.slice(0, 60)}</span>
          </div>
          <button className="reply-bar-close" onClick={() => { onCancelEdit(); setText(""); }}>✕</button>
        </div>
      )}

      {/* Reply bar */}
      {replyTo && !editingMsg && (
        <div className="reply-bar">
          <div className="reply-bar-content">
            <span className="reply-bar-icon">↩</span>
            <span className="reply-bar-text">
              {replyTo._plaintext ?? "Message"}
            </span>
          </div>
          <button className="reply-bar-close" onClick={onCancelReply}>✕</button>
        </div>
      )}

      {/* Image preview */}
      {imagePreview && (
        <div className="image-preview-bar" style={{ display: "flex", alignItems: "center", gap: "10px", padding: "8px 12px", background: "var(--bg-chat)", borderTop: "1px solid var(--border-color)" }}>
          <img src={imagePreview.previewUrl} alt="Preview" className="image-preview-thumb" style={{ width: "60px", height: "60px", objectFit: "cover", borderRadius: "6px", flexShrink: 0 }} />
          <span style={{ flex: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", fontSize: "0.85rem", color: "var(--text-muted)" }}>{imagePreview.file.name}</span>
          <button className="reply-bar-close" onClick={cancelImage} style={{ flexShrink: 0, background: "rgba(255,0,0,0.1)", color: "red", border: "none", width: "24px", height: "24px", borderRadius: "50%", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.8rem" }}>✕</button>
        </div>
      )}

      <div className="message-input-wrapper" style={{ position: "relative" }}>
        {/* Emoji picker button */}
        <div ref={emojiRef} style={{ position: "relative" }}>
          <button
            className="attach-btn"
            onClick={() => setShowEmojiPicker(prev => !prev)}
            title="Emoji"
            disabled={sending}
            type="button"
          >
            😊
          </button>
          {showEmojiPicker && (
            <div className="input-emoji-picker">
              {INPUT_EMOJIS.map(emoji => (
                <button key={emoji} className="emoji-picker-btn" onClick={() => insertEmoji(emoji)}>
                  {emoji}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Image attach button (only when not editing) */}
        {!editingMsg && (
          <>
            <button className="attach-btn" onClick={() => fileInputRef.current?.click()} title="Send an image" disabled={sending}>
              📎
            </button>
            <input ref={fileInputRef} type="file" accept="image/*" style={{ display: "none" }} onChange={handleImageSelect} />
          </>
        )}

        <input
          ref={inputRef}
          className="input"
          type="text"
          placeholder={editingMsg ? "Edit message..." : imagePreview ? "Add a caption..." : "Type an encrypted message..."}
          value={text}
          onChange={handleTextChange}
          onKeyDown={handleKeyDown}
          onBlur={handleBlur}
          disabled={sending}
        />
        <button
          className={`send-btn ${editingMsg ? "send-btn--edit" : ""}`}
          onClick={handleSend}
          disabled={(!text.trim() && !imagePreview) || sending}
          title={editingMsg ? "Save edit" : "Send encrypted message"}
        >
          {sending ? "⏳" : editingMsg ? "✓" : "→"}
        </button>
      </div>
    </div>
  );
}
