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

import { motion, AnimatePresence } from "framer-motion";
import { Smile, Paperclip, Send, X, Edit3, Reply, Loader2, Check } from "lucide-react";

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
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const typingRef = useRef(false);
  const emojiRef = useRef<HTMLDivElement>(null);

  // Auto-expand textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "0px";
      const scrollHeight = textareaRef.current.scrollHeight;
      textareaRef.current.style.height = Math.min(Math.max(scrollHeight, 48), 150) + "px";
    }
  }, [text]);

  // Pre-fill input when entering edit mode
  useEffect(() => {
    if (editingMsg) {
      setText(editingMsg.plaintext);
      textareaRef.current?.focus();
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

  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
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
    textareaRef.current?.focus();
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
      <AnimatePresence>
        {error && (
          <motion.div 
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="auth-error mb-2 text-sm"
          >
            {error}
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {editingMsg && (
          <motion.div 
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="reply-bar reply-bar--edit"
          >
            <div className="reply-bar-content">
              <Edit3 size={16} className="text-blue" />
              <span className="reply-bar-text">Editing: {editingMsg.plaintext.slice(0, 60)}</span>
            </div>
            <button className="reply-bar-close" onClick={() => { onCancelEdit(); setText(""); }}>
              <X size={16} />
            </button>
          </motion.div>
        )}

        {replyTo && !editingMsg && (
          <motion.div 
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="reply-bar"
          >
            <div className="reply-bar-content">
              <Reply size={16} className="text-brand" />
              <span className="reply-bar-text">{replyTo._plaintext ?? "Message"}</span>
            </div>
            <button className="reply-bar-close" onClick={onCancelReply}>
              <X size={16} />
            </button>
          </motion.div>
        )}

        {imagePreview && (
          <motion.div 
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="image-preview-bar"
          >
            <div className="flex items-center gap-3 p-2 bg-secondary/50 rounded-xl border border-border mt-1">
              <img src={imagePreview.previewUrl} alt="Preview" className="w-14 h-14 object-cover rounded-lg" />
              <span className="flex-1 truncate text-xs text-muted-foreground">{imagePreview.file.name}</span>
              <button className="w-8 h-8 flex items-center justify-center bg-red-100 text-red-500 rounded-full hover:bg-red-200 transition-colors" onClick={cancelImage}>
                <X size={16} />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="message-input-wrapper mt-2">
        <div ref={emojiRef} className="relative flex items-end">
          <motion.button
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
            className="attach-btn"
            onClick={() => setShowEmojiPicker(prev => !prev)}
            disabled={sending}
            type="button"
          >
            <Smile size={24} />
          </motion.button>
          <AnimatePresence>
            {showEmojiPicker && (
              <motion.div 
                initial={{ opacity: 0, scale: 0.9, y: 10 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9, y: 10 }}
                className="input-emoji-picker"
              >
                {INPUT_EMOJIS.map(emoji => (
                  <button key={emoji} className="emoji-picker-btn" onClick={() => insertEmoji(emoji)}>
                    {emoji}
                  </button>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {!editingMsg && (
          <div className="flex items-end">
            <motion.button 
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
              className="attach-btn" 
              onClick={() => fileInputRef.current?.click()} 
              disabled={sending}
            >
              <Paperclip size={22} />
            </motion.button>
            <input ref={fileInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleImageSelect} />
          </div>
        )}

        <textarea
          ref={textareaRef}
          className="input"
          placeholder={editingMsg ? "Edit message..." : imagePreview ? "Add a caption..." : "Type an encrypted message..."}
          value={text}
          onChange={handleTextChange}
          onKeyDown={handleKeyDown}
          onBlur={handleBlur}
          disabled={sending}
          rows={1}
          style={{ resize: "none", overflow: "hidden" }}
        />

        <motion.button
          whileHover={{ scale: (text.trim() || imagePreview) ? 1.1 : 1 }}
          whileTap={{ scale: (text.trim() || imagePreview) ? 0.9 : 1 }}
          className={`send-btn ${editingMsg ? "send-btn--edit" : ""}`}
          onClick={handleSend}
          disabled={(!text.trim() && !imagePreview) || sending}
        >
          {sending ? (
            <Loader2 size={20} className="animate-spin" />
          ) : editingMsg ? (
            <Check size={20} />
          ) : (
            <Send size={20} />
          )}
        </motion.button>
      </div>
    </div>
  );
}
