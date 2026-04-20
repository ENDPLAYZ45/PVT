"use client";

import { useEffect, useRef, useState } from "react";
import { decryptMessage } from "@/lib/crypto/decrypt";
import { decryptImageBlob } from "@/lib/crypto/imageEncrypt";
import { RawMessage } from "@/hooks/useRealtimeMessages";
import { PartnerPresence } from "@/hooks/usePresence";

const PANIC_MARKER = "__SYSTEM__PANIC__";

const QUICK_EMOJIS = ["❤️", "😂", "😮", "😢", "👍", "👎"];
const EMOJI_PICKER_LIST = [
  "😀","😂","😍","😮","😢","😡","👍","👎","❤️","🔥",
  "🎉","😎","🤔","😴","🙏","💪","✅","❌","💯","🚀",
  "👏","🤣","😅","😭","🥰","😜","🤯","😤","🥳","😇",
];

interface DecryptedMessage extends RawMessage {
  plaintext: string;
  decryptFailed: boolean;
  isPanic: boolean;
  imageObjectUrl?: string;
}

interface ChatWindowProps {
  messages: RawMessage[];
  currentUserId: string;
  privateKey: CryptoKey | null;
  hasKey: boolean;
  partnerPresence: PartnerPresence;
  partnerName: string;
  onReply: (msg: RawMessage) => void;
  onDelete: (id: string) => void;
  onEdit: (msg: DecryptedMessage) => void;
}

function formatTime(dateStr: string) {
  return new Date(dateStr).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

function formatLastSeen(isoStr: string) {
  const d = new Date(isoStr);
  const diff = Date.now() - d.getTime();
  if (diff < 60000) return "just now";
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return d.toLocaleDateString();
}

export type { DecryptedMessage };

export default function ChatWindow({
  messages,
  currentUserId,
  privateKey,
  hasKey,
  partnerPresence,
  partnerName,
  onReply,
  onDelete,
  onEdit,
}: ChatWindowProps) {
  const [decryptedMessages, setDecryptedMessages] = useState<DecryptedMessage[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);
  const [activeMenu, setActiveMenu] = useState<string | null>(null);
  const [emojiPickerFor, setEmojiPickerFor] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    async function decryptAll() {
      const results: DecryptedMessage[] = [];

      for (const msg of messages) {
        const isSent = msg.sender_id === currentUserId;

        if (msg.ciphertext === PANIC_MARKER) {
          results.push({ ...msg, plaintext: PANIC_MARKER, decryptFailed: false, isPanic: true });
          continue;
        }

        if (msg.is_deleted) {
          results.push({ ...msg, plaintext: "__DELETED__", decryptFailed: false, isPanic: false });
          continue;
        }

        if (msg._plaintext) {
          results.push({ ...msg, plaintext: msg._plaintext, decryptFailed: false, isPanic: false });
          continue;
        }

        // Handle image messages
        if (msg.message_type === "image" && msg.image_url && privateKey) {
          try {
            const encryptedAesKey = isSent ? msg.image_aes_key_sender : msg.image_aes_key;
            if (!encryptedAesKey || !msg.image_iv) throw new Error("No key");

            const aesKeyString = await decryptMessage(privateKey, encryptedAesKey);
            const resp = await fetch(msg.image_url);
            const encryptedData = await resp.arrayBuffer();
            const objectUrl = await decryptImageBlob(encryptedData, aesKeyString, msg.image_iv, msg.image_mime || "image/jpeg");
            results.push({ ...msg, plaintext: "[Image]", decryptFailed: false, isPanic: false, imageObjectUrl: objectUrl });
          } catch {
            // Hide old images that cannot be decrypted
          }
          continue;
        }

        // Text messages
        if (isSent) {
          if (privateKey && msg.sender_ciphertext) {
            try {
              const plaintext = await decryptMessage(privateKey, msg.sender_ciphertext);
              results.push({ ...msg, plaintext, decryptFailed: false, isPanic: false });
            } catch { /* hide */ }
          }
        } else {
          if (privateKey) {
            try {
              const plaintext = await decryptMessage(privateKey, msg.ciphertext);
              results.push({ ...msg, plaintext, decryptFailed: false, isPanic: false });
            } catch { /* hide */ }
          }
        }
      }

      setDecryptedMessages(results);
    }

    decryptAll();
  }, [messages, currentUserId, privateKey]);

  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [decryptedMessages, partnerPresence.isTyping]);

  // Close menu on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setActiveMenu(null);
        setEmojiPickerFor(null);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const toggleReaction = async (messageId: string, emoji: string) => {
    setEmojiPickerFor(null);
    setActiveMenu(null);
    await fetch("/api/reactions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message_id: messageId, emoji }),
    });
  };

  if (!hasKey) {
    return (
      <div className="messages-container" ref={containerRef}>
        <div className="message-encrypted-note" style={{ background: "var(--orange)", border: "var(--border-width) solid var(--border-color)", padding: "16px 20px", borderRadius: "var(--radius)", flexDirection: "column", gap: 8 }}>
          <span style={{ fontSize: "1.5rem" }}>🔑</span>
          <strong>No encryption key</strong>
          <span style={{ fontSize: "0.82rem" }}>Log in again to restore your key and messages.</span>
        </div>
      </div>
    );
  }

  const lastSentMsg = [...decryptedMessages].reverse().find(m => m.sender_id === currentUserId && !m.isPanic);

  return (
    <div className="messages-container" ref={containerRef}>
      {/* Online / Last seen status */}
      <div className="presence-status">
        {partnerPresence.isOnline ? (
          <span><span className="online-dot" /> Online</span>
        ) : partnerPresence.lastSeen ? (
          <span>Last seen {formatLastSeen(partnerPresence.lastSeen)}</span>
        ) : (
          <span>Offline</span>
        )}
      </div>

      <div className="message-encrypted-note">
        <span>🔒</span>
        <span>Messages are end-to-end encrypted</span>
      </div>

      {decryptedMessages.map((msg) => {
        const isSent = msg.sender_id === currentUserId;
        const isLastSent = lastSentMsg?.id === msg.id;
        const isDeleted = msg.plaintext === "__DELETED__" || msg.is_deleted;

        if (msg.isPanic) {
          return (
            <div key={msg.id} className="panic-banner">
              <span className="panic-banner-icon">🚨</span>
              <div className="panic-banner-text">
                <strong>{isSent ? "You sent an SOS" : "They can't talk right now"}</strong>
                <span>{isSent ? "You pressed SOS — your partner was notified" : "Someone is nearby. Wait for them 💙"}</span>
              </div>
              <span className="panic-banner-time">{formatTime(msg.created_at)}</span>
            </div>
          );
        }

        return (
          <div key={msg.id} className={`message-row ${isSent ? "message-row--sent" : "message-row--received"}`}>
            <div style={{ width: "100%", minWidth: 0 }}>
              {/* Reply quote */}
              {msg.reply_preview && (
                <div className={`reply-quote ${isSent ? "reply-quote--sent" : "reply-quote--received"}`}>
                  <span>↩ {msg.reply_preview}</span>
                </div>
              )}

              <div
                className="msg-bubble-row"
                style={{ display: "flex", gap: 6, alignItems: "flex-end", justifyContent: isSent ? "flex-end" : "flex-start", minWidth: 0, position: "relative" }}
              >
                {/* Reply button left (received) */}
                {!isSent && !isDeleted && (
                  <button className="reply-btn" onClick={() => onReply({ ...msg, _plaintext: msg.plaintext })} title="Reply">↩</button>
                )}

                {/* Message Bubble */}
                <div style={{ position: "relative", maxWidth: "100%" }}>
                  <div
                    className={`message-bubble ${isSent ? "message-bubble--sent" : "message-bubble--received"} ${isDeleted ? "message-bubble--deleted" : ""}`}
                    style={{ minWidth: 0, wordBreak: "break-word" }}
                    onContextMenu={(e) => { e.preventDefault(); setActiveMenu(msg.id); setEmojiPickerFor(null); }}
                  >
                    {isDeleted ? (
                      <span style={{ fontStyle: "italic", opacity: 0.6 }}>🗑 Message deleted</span>
                    ) : msg.imageObjectUrl ? (
                      <img
                        src={msg.imageObjectUrl}
                        alt="Encrypted image"
                        className="chat-image"
                        style={{ maxWidth: "100%", maxHeight: "350px", objectFit: "scale-down", borderRadius: "6px", display: "block", margin: "5px 0" }}
                      />
                    ) : (
                      msg.plaintext
                    )}
                  </div>

                  {/* Message actions popover */}
                  {activeMenu === msg.id && (
                    <div
                      ref={menuRef}
                      className={`msg-actions-menu ${isSent ? "msg-actions-menu--sent" : "msg-actions-menu--received"}`}
                    >
                      {/* Quick emoji reactions row */}
                      <div className="msg-actions-reactions">
                        {QUICK_EMOJIS.map(emoji => (
                          <button key={emoji} className="quick-react-btn" onClick={() => toggleReaction(msg.id, emoji)}>
                            {emoji}
                          </button>
                        ))}
                        <button className="quick-react-btn" onClick={() => { setEmojiPickerFor(msg.id); setActiveMenu(null); }} title="More">
                          ➕
                        </button>
                      </div>
                      <div className="msg-actions-divider" />
                      {/* Action buttons */}
                      {!isDeleted && (
                        <button className="msg-action-btn" onClick={() => { onReply({ ...msg, _plaintext: msg.plaintext }); setActiveMenu(null); }}>
                          ↩ Reply
                        </button>
                      )}
                      {isSent && !isDeleted && (
                        <button className="msg-action-btn" onClick={() => { onEdit(msg); setActiveMenu(null); }}>
                          ✏️ Edit
                        </button>
                      )}
                      {isSent && !isDeleted && (
                        <button className="msg-action-btn msg-action-btn--danger" onClick={() => { onDelete(msg.id); setActiveMenu(null); }}>
                          🗑️ Delete
                        </button>
                      )}
                    </div>
                  )}

                  {/* Full emoji picker popover */}
                  {emojiPickerFor === msg.id && (
                    <div ref={menuRef} className={`emoji-picker-popover ${isSent ? "emoji-picker-popover--sent" : ""}`}>
                      <div className="emoji-picker-grid">
                        {EMOJI_PICKER_LIST.map(emoji => (
                          <button key={emoji} className="emoji-picker-btn" onClick={() => toggleReaction(msg.id, emoji)}>
                            {emoji}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Reply button right (sent) */}
                {isSent && !isDeleted && (
                  <button className="reply-btn" onClick={() => onReply({ ...msg, _plaintext: msg.plaintext })} title="Reply">↩</button>
                )}
              </div>

              {/* Emoji reactions display */}
              {msg._reactions && msg._reactions.length > 0 && (
                <div className={`reactions-row ${isSent ? "reactions-row--sent" : ""}`}>
                  {msg._reactions.map(r => (
                    <button
                      key={r.emoji}
                      className={`reaction-bubble ${r.hasReacted ? "reaction-bubble--active" : ""}`}
                      onClick={() => toggleReaction(msg.id, r.emoji)}
                    >
                      {r.emoji} <span>{r.count}</span>
                    </button>
                  ))}
                </div>
              )}

              <div className="message-time" style={{ justifyContent: isSent ? "flex-end" : "flex-start" }}>
                <span>{formatTime(msg.created_at)}</span>
                {msg.edited_at && !isDeleted && <span style={{ opacity: 0.5, fontSize: "0.65rem" }}>(edited)</span>}
                {isSent && msg.read_at && isLastSent && (
                  <span className="seen-receipt">Seen {formatTime(msg.read_at)}</span>
                )}
                {isSent && msg.delivered_at && !msg.read_at && (
                  <span className="message-delivered">✓✓</span>
                )}
                {isSent && !msg.delivered_at && <span style={{ color: "var(--text-muted)" }}>✓</span>}
              </div>
            </div>
          </div>
        );
      })}

      {/* Typing indicator */}
      {partnerPresence.isTyping && (
        <div className="typing-indicator">
          <div className="typing-bubble">
            <span /><span /><span />
          </div>
          <span className="typing-label">{partnerName} is typing...</span>
        </div>
      )}
    </div>
  );
}
