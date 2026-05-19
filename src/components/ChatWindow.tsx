"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { decryptMessage } from "@/lib/crypto/decrypt";
import { decryptImageBlob } from "@/lib/crypto/imageEncrypt";
import { RawMessage, Reaction } from "@/hooks/useRealtimeMessages";
import { PartnerPresence } from "@/hooks/usePresence";
import { motion, AnimatePresence } from "framer-motion";
import { Lock, AlertCircle, Key, Trash2, Reply, Edit3, Plus, Check, CheckCheck, X, ChevronUp } from "lucide-react";

const PANIC_MARKER = "__SYSTEM__PANIC__";

const QUICK_EMOJIS = ["❤️", "😂", "😮", "😢", "👍", "👎"];
const EMOJI_PICKER_LIST = [
  "😀","😂","😍","😮","😢","😡","👍","👎","❤️","🔥",
  "🎉","😎","🤔","😴","🙏","💪","✅","❌","💯","🚀",
  "👏","🤣","😅","😭","🥰","😜","🤯","😤","🥳","😇",
];

/** 2 minutes in milliseconds — messages within this window are visually grouped */
const GROUP_GAP_MS = 2 * 60 * 1000;

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
  hasMore?: boolean;
  onLoadMore?: () => void;
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
  hasMore,
  onLoadMore,
}: ChatWindowProps) {
  const [decryptedMessages, setDecryptedMessages] = useState<DecryptedMessage[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);
  const [activeMenu, setActiveMenu] = useState<string | null>(null);
  const [emojiPickerFor, setEmojiPickerFor] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);

  // Swipe-to-reply touch tracking
  const swipeRef = useRef<Record<string, { startX: number; startY: number; active: boolean }>>({});
  const [swipeActive, setSwipeActive] = useState<string | null>(null);

  // Cache of already-decrypted messages keyed by ID — prevents re-decrypting
  // the same message on every re-render and eliminates the race condition where
  // a stale async run overwrites state without the latest message.
  const decryptedCache = useRef<Map<string, DecryptedMessage>>(new Map());
  const objectUrlCache = useRef<Map<string, string>>(new Map()); // msgId → objectUrl

  // ── Decrypt new messages incrementally (never re-decrypts already-cached ones) ──
  useEffect(() => {
    if (!privateKey && messages.some(m => !m._plaintext && m.ciphertext !== PANIC_MARKER && !m.is_deleted)) {
      // Key not ready yet — wait for next render when privateKey loads
      return;
    }

    let cancelled = false;

    async function decryptIncremental() {
      const cache = decryptedCache.current;

      // Remove cache entries for messages that are no longer in the list
      const currentIds = new Set(messages.map(m => m.id));
      for (const id of cache.keys()) {
        if (!currentIds.has(id)) {
          const old = cache.get(id);
          if (old?.imageObjectUrl) {
            URL.revokeObjectURL(old.imageObjectUrl);
            objectUrlCache.current.delete(id);
          }
          cache.delete(id);
        }
      }

      // Find messages not yet cached (or whose metadata changed: edit/delete/reactions)
      const toDecrypt = messages.filter(m => {
        const cached = cache.get(m.id);
        if (!cached) return true;
        // Re-process if metadata that doesn't require crypto changed
        if (m.is_deleted !== cached.is_deleted) return true;
        if (m.edited_at !== cached.edited_at) return true;
        if (m._plaintext && m._plaintext !== cached.plaintext) return true;
        if (JSON.stringify(m._reactions) !== JSON.stringify(cached._reactions)) return true;
        if (m.read_at !== cached.read_at) return true;
        if (m.delivered_at !== cached.delivered_at) return true;
        return false;
      });

      for (const msg of toDecrypt) {
        if (cancelled) return;
        const isSent = msg.sender_id === currentUserId;

        if (msg.ciphertext === PANIC_MARKER) {
          cache.set(msg.id, { ...msg, plaintext: PANIC_MARKER, decryptFailed: false, isPanic: true });
          continue;
        }

        if (msg.is_deleted) {
          cache.set(msg.id, { ...msg, plaintext: "__DELETED__", decryptFailed: false, isPanic: false });
          continue;
        }

        // Optimistic message — already has plaintext
        if (msg._plaintext) {
          cache.set(msg.id, { ...msg, plaintext: msg._plaintext, decryptFailed: false, isPanic: false });
          continue;
        }

        // Metadata-only update on already-cached message (read_at, reactions, etc.)
        const existing = cache.get(msg.id);
        if (existing) {
          cache.set(msg.id, { ...existing, ...msg, plaintext: existing.plaintext, imageObjectUrl: existing.imageObjectUrl });
          continue;
        }

        // ── Image messages ──────────────────────────────────────────────────
        if (msg.message_type === "image" && msg.image_url && privateKey) {
          try {
            const encryptedAesKey = isSent ? msg.image_aes_key_sender : msg.image_aes_key;
            if (!encryptedAesKey || !msg.image_iv) throw new Error("No key");
            const aesKeyString = await decryptMessage(privateKey, encryptedAesKey);
            if (cancelled) return;
            const resp = await fetch(msg.image_url);
            const encryptedData = await resp.arrayBuffer();
            if (cancelled) return;
            const objectUrl = await decryptImageBlob(encryptedData, aesKeyString, msg.image_iv, msg.image_mime || "image/jpeg");
            if (cancelled) { URL.revokeObjectURL(objectUrl); return; }
            objectUrlCache.current.set(msg.id, objectUrl);
            cache.set(msg.id, { ...msg, plaintext: "[Image]", decryptFailed: false, isPanic: false, imageObjectUrl: objectUrl });
          } catch {
            // failed image — don't add to cache so it retries next render
          }
          continue;
        }

        // ── Text messages ───────────────────────────────────────────────────
        if (!privateKey) continue;

        if (isSent) {
          if (msg.sender_ciphertext) {
            try {
              const plaintext = await decryptMessage(privateKey, msg.sender_ciphertext);
              if (cancelled) return;
              cache.set(msg.id, { ...msg, plaintext, decryptFailed: false, isPanic: false });
            } catch {
              console.warn("[ChatWindow] Decrypt failed for sent message", msg.id);
            }
          }
        } else {
          try {
            const plaintext = await decryptMessage(privateKey, msg.ciphertext);
            if (cancelled) return;
            cache.set(msg.id, { ...msg, plaintext, decryptFailed: false, isPanic: false });
          } catch {
            console.warn("[ChatWindow] Decrypt failed for received message", msg.id);
          }
        }
      }

      if (cancelled) return;

      // Build the final ordered list from the cache
      const result: DecryptedMessage[] = [];
      for (const msg of messages) {
        const d = cache.get(msg.id);
        if (d) result.push(d);
      }
      setDecryptedMessages(result);
    }

    decryptIncremental();

    return () => {
      cancelled = true;
    };
  }, [messages, currentUserId, privateKey]);

  // Ref for smooth-scroll anchor at bottom of message list
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const prevDecryptedCount = useRef(0);

  // Smooth-scroll to bottom ONLY when genuinely new messages arrive
  // (not on polling refreshes that returned the same data)
  useEffect(() => {
    const hasNewMsg = decryptedMessages.some(m => m._isNew);
    const countGrew = decryptedMessages.length > prevDecryptedCount.current;
    prevDecryptedCount.current = decryptedMessages.length;

    if (hasNewMsg || countGrew) {
      // Small delay so the DOM has painted the new bubble
      requestAnimationFrame(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
      });
    }
  }, [decryptedMessages]);

  // Scroll to bottom when typing indicator appears
  useEffect(() => {
    if (partnerPresence.isTyping) {
      requestAnimationFrame(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
      });
    }
  }, [partnerPresence.isTyping]);

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

  // Close lightbox on Escape
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setLightboxUrl(null);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // ── Optimistic reactions: update local state first, then sync to server ──
  const toggleReaction = useCallback(async (messageId: string, emoji: string) => {
    setEmojiPickerFor(null);
    setActiveMenu(null);

    // Optimistic update
    setDecryptedMessages(prev =>
      prev.map(m => {
        if (m.id !== messageId) return m;
        const reactions = m._reactions ? [...m._reactions] : [];
        const existing = reactions.find(r => r.emoji === emoji);
        if (existing) {
          if (existing.hasReacted) {
            // Toggle off
            const newCount = existing.count - 1;
            if (newCount === 0) return { ...m, _reactions: reactions.filter(r => r.emoji !== emoji) };
            return { ...m, _reactions: reactions.map(r => r.emoji === emoji ? { ...r, count: newCount, hasReacted: false } : r) };
          } else {
            return { ...m, _reactions: reactions.map(r => r.emoji === emoji ? { ...r, count: r.count + 1, hasReacted: true } : r) };
          }
        } else {
          return { ...m, _reactions: [...reactions, { emoji, count: 1, hasReacted: true }] };
        }
      })
    );

    // Server sync (reconciliation happens via realtime update)
    await fetch("/api/reactions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message_id: messageId, emoji }),
    });
  }, []);

  // ── Swipe-to-reply handlers ──
  const handleTouchStart = useCallback((e: React.TouchEvent, msgId: string) => {
    swipeRef.current[msgId] = {
      startX: e.touches[0].clientX,
      startY: e.touches[0].clientY,
      active: true,
    };
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent, msgId: string, isSent: boolean) => {
    const s = swipeRef.current[msgId];
    if (!s?.active) return;
    const dx = e.touches[0].clientX - s.startX;
    const dy = Math.abs(e.touches[0].clientY - s.startY);
    // Ignore vertical scrolls
    if (dy > 20) { s.active = false; return; }
    // Received: swipe right (dx > 0); Sent: swipe left (dx < 0)
    const threshold = isSent ? dx < -60 : dx > 60;
    setSwipeActive(threshold ? msgId : null);
  }, []);

  const handleTouchEnd = useCallback((e: React.TouchEvent, msgId: string, msg: RawMessage) => {
    if (swipeActive === msgId) {
      onReply({ ...msg, _plaintext: (decryptedMessages.find(m => m.id === msgId) as DecryptedMessage | undefined)?.plaintext });
    }
    swipeRef.current[msgId] = { startX: 0, startY: 0, active: false };
    setSwipeActive(null);
  }, [swipeActive, onReply, decryptedMessages]);

  if (!hasKey) {
    return (
      <div className="messages-container" ref={containerRef}>
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="empty-state-container"
          style={{ padding: 40, textAlign: "center" }}
        >
          <div className="empty-state-icon" style={{ background: "var(--warning)", color: "white", margin: "0 auto 24px" }}>
            <Key size={40} />
          </div>
          <h2>Encryption Key Missing</h2>
          <p>Sign in again to restore your secure session and view your messages.</p>
        </motion.div>
      </div>
    );
  }

  const lastSentMsg = [...decryptedMessages].reverse().find(m => m.sender_id === currentUserId && !m.isPanic);

  return (
    <>
      {/* ── Image Lightbox ── */}
      <AnimatePresence>
        {lightboxUrl && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="lightbox-overlay"
            onClick={() => setLightboxUrl(null)}
          >
            <button className="lightbox-close" onClick={() => setLightboxUrl(null)}><X size={20} /></button>
            <motion.img
              src={lightboxUrl}
              alt="Full size"
              className="lightbox-img"
              initial={{ scale: 0.85, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.85, opacity: 0 }}
              onClick={e => e.stopPropagation()}
            />
          </motion.div>
        )}
      </AnimatePresence>

      <div className="messages-container" ref={containerRef}>
        {/* ── Load More button ── */}
        {hasMore && (
          <div style={{ display: "flex", justifyContent: "center", paddingBottom: 8 }}>
            <button
              className="btn btn--secondary btn--small"
              style={{ display: "flex", alignItems: "center", gap: 6 }}
              onClick={onLoadMore}
            >
              <ChevronUp size={14} /> Load older messages
            </button>
          </div>
        )}

        <div className="presence-status">
          {partnerPresence.isOnline ? (
            <span className="flex items-center gap-2"><span className="status-dot" /> Online</span>
          ) : partnerPresence.lastSeen ? (
            <span>Last seen {formatLastSeen(partnerPresence.lastSeen)}</span>
          ) : (
            <span>Offline</span>
          )}
        </div>

        <div className="message-encrypted-note">
          <Lock size={14} />
          <span>Messages are end-to-end encrypted</span>
        </div>

        {/* AnimatePresence initial={false} means existing messages NEVER
            re-animate — only brand-new messages get the entry animation */}
        <AnimatePresence initial={false}>
          {decryptedMessages.map((msg, idx) => {
            const isSent = msg.sender_id === currentUserId;
            const isLastSent = lastSentMsg?.id === msg.id;
            const isDeleted = msg.plaintext === "__DELETED__" || msg.is_deleted;
            const isNew = msg._isNew === true;

            // Message grouping: same sender within 2 min of previous
            const prev = idx > 0 ? decryptedMessages[idx - 1] : null;
            const isGrouped =
              !!prev &&
              prev.sender_id === msg.sender_id &&
              !prev.isPanic &&
              !msg.isPanic &&
              new Date(msg.created_at).getTime() - new Date(prev.created_at).getTime() < GROUP_GAP_MS;

            const showTimestamp = !isGrouped || isLastSent;

            if (msg.isPanic) {
              return (
                <motion.div
                  key={msg.id}
                  variants={{ hidden: { opacity: 0, scale: 0.95 }, show: { opacity: 1, scale: 1 } }}
                  className="panic-banner"
                >
                  <AlertCircle size={20} />
                  <div className="panic-banner-text">
                    <strong>{isSent ? "Emergency SOS Sent" : "Unsafe Environment"}</strong>
                    <span>{isSent ? "Safety mode activated" : "Conversation shifted to secret mode"}</span>
                  </div>
                  <span className="panic-banner-time">{formatTime(msg.created_at)}</span>
                </motion.div>
              );
            }

            return (
              <motion.div
                key={msg.id}
                layout
                initial={isNew ? { opacity: 0, y: 24, scale: 0.95 } : false}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={
                  isNew
                    ? { type: "spring", stiffness: 420, damping: 32, mass: 0.8 }
                    : { duration: 0 }
                }
                className={`message-row ${isSent ? "message-row--sent" : "message-row--received"} ${isGrouped ? "message-row--grouped" : ""}`}
                style={{ position: "relative" }}
                onTouchStart={e => handleTouchStart(e, msg.id)}
                onTouchMove={e => handleTouchMove(e, msg.id, isSent)}
                onTouchEnd={e => handleTouchEnd(e, msg.id, msg)}
              >
                {/* Swipe-to-reply indicator */}
                <div className={`swipe-reply-indicator ${swipeActive === msg.id ? "swipe-reply-indicator--visible" : ""}`}>
                  <Reply size={14} />
                </div>

                <div style={{ width: "100%", minWidth: 0 }}>
                  {msg.reply_preview && (
                    <div className={`reply-quote ${isSent ? "reply-quote--sent" : "reply-quote--received"}`}>
                      <Reply size={12} style={{ marginRight: 6 }} />
                      <span>{msg.reply_preview}</span>
                    </div>
                  )}

                  <div className="msg-bubble-row">
                    <div style={{ position: "relative", maxWidth: "100%" }}>
                      <motion.div
                        layoutId={`bubble-${msg.id}`}
                        className={[
                          "message-bubble",
                          isSent ? "message-bubble--sent" : "message-bubble--received",
                          isDeleted ? "message-bubble--deleted" : "",
                          isGrouped && isSent ? "message-bubble--grouped-sent" : "",
                          isGrouped && !isSent ? "message-bubble--grouped-received" : "",
                        ].join(" ")}
                        onContextMenu={e => { e.preventDefault(); setActiveMenu(msg.id); setEmojiPickerFor(null); }}
                        whileHover={{ scale: 1.005 }}
                      >
                        {isDeleted ? (
                          <div className="flex items-center gap-2 italic opacity-60">
                            <Trash2 size={14} />
                            <span>Message deleted</span>
                          </div>
                        ) : msg.imageObjectUrl ? (
                          <img
                            src={msg.imageObjectUrl}
                            alt="Encrypted"
                            className="chat-image"
                            onClick={() => setLightboxUrl(msg.imageObjectUrl!)}
                            title="Click to view fullscreen"
                          />
                        ) : (
                          msg.plaintext
                        )}
                      </motion.div>

                      <AnimatePresence>
                        {activeMenu === msg.id && (
                          <motion.div
                            ref={menuRef}
                            initial={{ opacity: 0, scale: 0.9, y: 10 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.9, y: 10 }}
                            className={`msg-actions-menu ${isSent ? "msg-actions-menu--sent" : "msg-actions-menu--received"}`}
                          >
                            <div className="msg-actions-reactions">
                              {QUICK_EMOJIS.map(emoji => (
                                <button key={emoji} className="quick-react-btn" onClick={() => toggleReaction(msg.id, emoji)}>
                                  {emoji}
                                </button>
                              ))}
                              <button className="quick-react-btn" onClick={() => { setEmojiPickerFor(msg.id); setActiveMenu(null); }}>
                                <Plus size={16} />
                              </button>
                            </div>
                            <div className="msg-actions-divider" />
                            {!isDeleted && (
                              <button className="msg-action-btn" onClick={() => { onReply({ ...msg, _plaintext: msg.plaintext }); setActiveMenu(null); }}>
                                <Reply size={16} /> Reply
                              </button>
                            )}
                            {isSent && !isDeleted && (
                              <button className="msg-action-btn" onClick={() => { onEdit(msg); setActiveMenu(null); }}>
                                <Edit3 size={16} /> Edit
                              </button>
                            )}
                            {isSent && !isDeleted && (
                              <button className="msg-action-btn msg-action-btn--danger" onClick={() => { onDelete(msg.id); setActiveMenu(null); }}>
                                <Trash2 size={16} /> Delete
                              </button>
                            )}
                          </motion.div>
                        )}

                        {emojiPickerFor === msg.id && (
                          <motion.div
                            ref={menuRef}
                            initial={{ opacity: 0, scale: 0.9, y: 10 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.9, y: 10 }}
                            className={`emoji-picker-popover ${isSent ? "emoji-picker-popover--sent" : ""}`}
                          >
                            <div className="emoji-picker-grid">
                              {EMOJI_PICKER_LIST.map(emoji => (
                                <button key={emoji} className="emoji-picker-btn" onClick={() => toggleReaction(msg.id, emoji)}>
                                  {emoji}
                                </button>
                              ))}
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  </div>

                  {msg._reactions && msg._reactions.length > 0 && (
                    <div className={`reactions-row ${isSent ? "reactions-row--sent" : ""}`}>
                      {msg._reactions.map((r: Reaction) => (
                        <motion.button
                          key={r.emoji}
                          whileHover={{ scale: 1.1 }}
                          whileTap={{ scale: 0.95 }}
                          className={`reaction-bubble ${r.hasReacted ? "reaction-bubble--active" : ""}`}
                          onClick={() => toggleReaction(msg.id, r.emoji)}
                        >
                          {r.emoji} <span>{r.count}</span>
                        </motion.button>
                      ))}
                    </div>
                  )}

                  {showTimestamp && (
                    <div className={`message-time ${isSent ? "justify-end" : "justify-start"}`}>
                      <span>{formatTime(msg.created_at)}</span>
                      {msg.edited_at && !isDeleted && <span className="opacity-50">(edited)</span>}
                      {isSent && isLastSent && (
                        <span className="flex items-center gap-1">
                          {msg.read_at ? (
                            <span title={`Seen ${formatTime(msg.read_at)}`} className="flex items-center">
                              <CheckCheck size={14} className="text-brand-light" />
                            </span>
                          ) : msg.delivered_at ? (
                            <span title="Delivered" className="flex items-center opacity-60">
                              <CheckCheck size={14} />
                            </span>
                          ) : (
                            <span title="Sent" className="flex items-center opacity-40">
                              <Check size={14} />
                            </span>
                          )}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </motion.div>
            );
          })}
          </AnimatePresence>
          {/* Invisible anchor for smooth scrolling */}
          <div ref={messagesEndRef} />
        {/* Typing indicator */}
        <AnimatePresence>
          {partnerPresence.isTyping && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 10 }}
              className="typing-indicator"
            >
              <div className="typing-bubble">
                <motion.span animate={{ opacity: [0.4, 1, 0.4] }} transition={{ repeat: Infinity, duration: 1, delay: 0 }} />
                <motion.span animate={{ opacity: [0.4, 1, 0.4] }} transition={{ repeat: Infinity, duration: 1, delay: 0.2 }} />
                <motion.span animate={{ opacity: [0.4, 1, 0.4] }} transition={{ repeat: Infinity, duration: 1, delay: 0.4 }} />
              </div>
              <span className="typing-label">{partnerName} is typing...</span>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </>
  );
}
