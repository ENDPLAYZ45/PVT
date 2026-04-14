"use client";

import { useEffect, useRef, useState } from "react";
import { decryptMessage } from "@/lib/crypto/decrypt";

const PANIC_MARKER = "__SYSTEM__PANIC__";

interface RawMessage {
  id: string;
  sender_id: string;
  receiver_id: string;
  ciphertext: string;
  sender_ciphertext: string | null;
  delivered_at: string | null;
  created_at: string;
  _plaintext?: string;
}

interface DecryptedMessage extends RawMessage {
  plaintext: string;
  decryptFailed: boolean;
  isPanic: boolean;
}

interface ChatWindowProps {
  messages: RawMessage[];
  currentUserId: string;
  privateKey: CryptoKey | null;
  hasKey: boolean;
}

function formatTime(dateStr: string) {
  return new Date(dateStr).toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function ChatWindow({
  messages,
  currentUserId,
  privateKey,
  hasKey,
}: ChatWindowProps) {
  const [decryptedMessages, setDecryptedMessages] = useState<DecryptedMessage[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    async function decryptAll() {
      const results: DecryptedMessage[] = [];

      for (const msg of messages) {
        const isSent = msg.sender_id === currentUserId;

        // Handle panic system messages
        if (msg.ciphertext === PANIC_MARKER) {
          results.push({ ...msg, plaintext: PANIC_MARKER, decryptFailed: false, isPanic: true });
          continue;
        }

        // Optimistic local plaintext (just sent)
        if (msg._plaintext) {
          results.push({ ...msg, plaintext: msg._plaintext, decryptFailed: false, isPanic: false });
          continue;
        }

        if (isSent) {
          if (privateKey && msg.sender_ciphertext) {
            try {
              const plaintext = await decryptMessage(privateKey, msg.sender_ciphertext);
              results.push({ ...msg, plaintext, decryptFailed: false, isPanic: false });
            } catch {
              results.push({ ...msg, plaintext: "🔒 Sent (encrypted)", decryptFailed: false, isPanic: false });
            }
          } else if (!msg.sender_ciphertext) {
            results.push({ ...msg, plaintext: "🔒 Sent (encrypted)", decryptFailed: false, isPanic: false });
          } else {
            results.push({ ...msg, plaintext: "🔑 No key to decrypt", decryptFailed: true, isPanic: false });
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
            results.push({ ...msg, plaintext: "🔑 No private key — cannot decrypt", decryptFailed: true, isPanic: false });
          }
        }
      }

      setDecryptedMessages(results);
    }

    decryptAll();
  }, [messages, currentUserId, privateKey]);

  // Auto-scroll to bottom
  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [decryptedMessages]);

  if (!hasKey) {
    return (
      <div className="messages-container" ref={containerRef}>
        <div className="message-encrypted-note" style={{
          background: "var(--orange)",
          border: "var(--border-width) solid var(--border-color)",
          padding: "16px 20px", borderRadius: "var(--radius)",
          boxShadow: "var(--shadow-sm)", flexDirection: "column", gap: 8,
        }}>
          <span style={{ fontSize: "1.5rem" }}>🔑</span>
          <strong>No encryption key on this device</strong>
          <span style={{ fontSize: "0.82rem" }}>
            You logged in on a new device or cleared browser data. Prior messages cannot be decrypted.
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="messages-container" ref={containerRef}>
      <div className="message-encrypted-note">
        <span>🔒</span>
        <span>Messages are end-to-end encrypted</span>
      </div>

      {decryptedMessages.map((msg) => {
        const isSent = msg.sender_id === currentUserId;

        // Panic banner
        if (msg.isPanic) {
          return (
            <div key={msg.id} className="panic-banner">
              <span className="panic-banner-icon">🚨</span>
              <div className="panic-banner-text">
                <strong>{isSent ? "You sent an SOS" : "They can't talk right now"}</strong>
                <span>
                  {isSent
                    ? "You pressed SOS — your partner was notified"
                    : "Someone is nearby. Wait for them to message you back 💙"}
                </span>
              </div>
              <span className="panic-banner-time">{formatTime(msg.created_at)}</span>
            </div>
          );
        }

        return (
          <div
            key={msg.id}
            className={`message-row ${isSent ? "message-row--sent" : "message-row--received"}`}
          >
            <div>
              <div
                className={`message-bubble ${isSent ? "message-bubble--sent" : "message-bubble--received"}`}
                style={msg.decryptFailed ? { opacity: 0.6 } : undefined}
              >
                {msg.plaintext}
              </div>
              <div className="message-time" style={{ justifyContent: isSent ? "flex-end" : "flex-start" }}>
                <span>{formatTime(msg.created_at)}</span>
                {isSent && msg.delivered_at && <span className="message-delivered">✓✓</span>}
                {isSent && !msg.delivered_at && <span>✓</span>}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
