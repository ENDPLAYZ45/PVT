"use client";

import { useEffect, useRef, useState } from "react";
import { decryptMessage } from "@/lib/crypto/decrypt";
import { decryptImageBlob } from "@/lib/crypto/imageEncrypt";
import { RawMessage } from "@/hooks/useRealtimeMessages";
import { PartnerPresence } from "@/hooks/usePresence";

const PANIC_MARKER = "__SYSTEM__PANIC__";

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

export default function ChatWindow({
  messages,
  currentUserId,
  privateKey,
  hasKey,
  partnerPresence,
  partnerName,
  onReply,
}: ChatWindowProps) {
  const [decryptedMessages, setDecryptedMessages] = useState<DecryptedMessage[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    async function decryptAll() {
      const results: DecryptedMessage[] = [];

      for (const msg of messages) {
        const isSent = msg.sender_id === currentUserId;

        if (msg.ciphertext === PANIC_MARKER) {
          results.push({ ...msg, plaintext: PANIC_MARKER, decryptFailed: false, isPanic: true });
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
            results.push({ ...msg, plaintext: "🖼️ Image (failed to decrypt)", decryptFailed: true, isPanic: false });
          }
          continue;
        }

        // Text messages
        if (isSent) {
          if (privateKey && msg.sender_ciphertext) {
            try {
              const plaintext = await decryptMessage(privateKey, msg.sender_ciphertext);
              results.push({ ...msg, plaintext, decryptFailed: false, isPanic: false });
            } catch {
              results.push({ ...msg, plaintext: "🔒 Sent (encrypted)", decryptFailed: false, isPanic: false });
            }
          } else {
            results.push({ ...msg, plaintext: "🔒 Sent (encrypted)", decryptFailed: false, isPanic: false });
          }
        } else {
          if (privateKey) {
            try {
              const plaintext = await decryptMessage(privateKey, msg.ciphertext);
              results.push({ ...msg, plaintext, decryptFailed: false, isPanic: false });
            } catch {
              results.push({ ...msg, plaintext: "⚠️ Unable to decrypt", decryptFailed: true, isPanic: false });
            }
          } else {
            results.push({ ...msg, plaintext: "🔑 No private key", decryptFailed: true, isPanic: false });
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

  // Find the last sent message for seen receipt
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
            <div style={{ width: "100%" }}>
              {/* Reply quote */}
              {msg.reply_preview && (
                <div className={`reply-quote ${isSent ? "reply-quote--sent" : "reply-quote--received"}`}>
                  <span>↩ {msg.reply_preview}</span>
                </div>
              )}

              <div className="msg-bubble-row" style={{ display: "flex", gap: 6, alignItems: "flex-end", justifyContent: isSent ? "flex-end" : "flex-start" }}>
                {/* Reply button (only on hover) */}
                {!isSent && (
                  <button className="reply-btn" onClick={() => onReply(msg)} title="Reply">↩</button>
                )}
                <div
                  className={`message-bubble ${isSent ? "message-bubble--sent" : "message-bubble--received"}`}
                  style={msg.decryptFailed ? { opacity: 0.6 } : undefined}
                >
                  {msg.imageObjectUrl ? (
                    <img
                      src={msg.imageObjectUrl}
                      alt="Encrypted image"
                      className="chat-image"
                      onLoad={() => {}}
                    />
                  ) : (
                    msg.plaintext
                  )}
                </div>
                {isSent && (
                  <button className="reply-btn" onClick={() => onReply(msg)} title="Reply">↩</button>
                )}
              </div>

              <div className="message-time" style={{ justifyContent: isSent ? "flex-end" : "flex-start" }}>
                <span>{formatTime(msg.created_at)}</span>
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
