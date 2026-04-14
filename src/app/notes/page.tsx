"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

interface Note {
  id: string;
  title: string;
  body: string;
  updatedAt: string;
  createdAt: string;
  pinned: boolean;
}

function formatTime(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  if (diff < 60000) return "Just now";
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  if (diff < 604800000) return d.toLocaleDateString([], { weekday: "short" });
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}

const STORAGE_KEY = "pvt_notes_data";

function loadNotes(): Note[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function saveNotes(notes: Note[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(notes));
}

export default function NotesPage() {
  const router = useRouter();
  const [notes, setNotes] = useState<Note[]>([]);
  const [selected, setSelected] = useState<Note | null>(null);
  const [search, setSearch] = useState("");
  const [editTitle, setEditTitle] = useState("");
  const [editBody, setEditBody] = useState("");
  const [logoTaps, setLogoTaps] = useState(0);
  const tapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoSaveRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  // Load notes on mount
  useEffect(() => {
    const loaded = loadNotes();
    setNotes(loaded);
  }, []);

  // Auto-save on edit with 600ms debounce
  useEffect(() => {
    if (!selected) return;
    if (autoSaveRef.current) clearTimeout(autoSaveRef.current);
    autoSaveRef.current = setTimeout(() => {
      const updatedNote: Note = {
        ...selected,
        title: editTitle.trim() || "Untitled",
        body: editBody,
        updatedAt: new Date().toISOString(),
      };
      const updated = notes.map((n) => (n.id === selected.id ? updatedNote : n));
      setNotes(updated);
      setSelected(updatedNote);
      saveNotes(updated);
    }, 600);
  }, [editTitle, editBody]);

  const createNote = () => {
    const newNote: Note = {
      id: crypto.randomUUID(),
      title: "",
      body: "",
      updatedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      pinned: false,
    };
    const updated = [newNote, ...notes];
    setNotes(updated);
    saveNotes(updated);
    selectNote(newNote);
    setTimeout(() => {
      // Focus title if empty
      const titleEl = document.getElementById("note-title-input") as HTMLInputElement;
      if (titleEl) titleEl.focus();
    }, 50);
  };

  const selectNote = (note: Note) => {
    setSelected(note);
    setEditTitle(note.title);
    setEditBody(note.body);
  };

  const deleteNote = (id: string) => {
    const updated = notes.filter((n) => n.id !== id);
    setNotes(updated);
    saveNotes(updated);
    if (selected?.id === id) {
      setSelected(null);
      setEditTitle("");
      setEditBody("");
    }
  };

  const togglePin = (id: string) => {
    const updated = notes.map((n) => (n.id === id ? { ...n, pinned: !n.pinned } : n));
    setNotes(updated);
    saveNotes(updated);
    if (selected?.id === id) setSelected((prev) => prev ? { ...prev, pinned: !prev.pinned } : null);
  };

  // Secret exit: tap 📝 logo 3 times within 2s
  const handleLogoTap = () => {
    const count = logoTaps + 1;
    setLogoTaps(count);
    if (tapTimerRef.current) clearTimeout(tapTimerRef.current);
    tapTimerRef.current = setTimeout(() => setLogoTaps(0), 2000);
    if (count >= 3) {
      setLogoTaps(0);
      router.push("/chat");
    }
  };

  const filtered = notes.filter(
    (n) =>
      n.title.toLowerCase().includes(search.toLowerCase()) ||
      n.body.toLowerCase().includes(search.toLowerCase())
  );
  const pinned = filtered.filter((n) => n.pinned);
  const others = filtered.filter((n) => !n.pinned);
  const sorted = [...pinned, ...others].sort((a, b) =>
    a.pinned === b.pinned ? new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime() : a.pinned ? -1 : 1
  );

  return (
    <div className="notes-layout">
      {/* ── Sidebar ── */}
      <div className="notes-sidebar">
        <div className="notes-header">
          <div className="notes-logo" onClick={handleLogoTap}>📝</div>
          <h1 className="notes-title">Notes</h1>
          <button className="notes-compose" onClick={createNote} title="New note">
            ✏️
          </button>
        </div>

        <div className="notes-search-wrap">
          <input
            className="notes-search"
            type="text"
            placeholder="🔍  Search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {/* Notes list */}
        <div className="notes-list">
          {sorted.length === 0 && (
            <div className="notes-list-empty">
              <p>No notes yet.</p>
              <button className="notes-create-btn" onClick={createNote}>+ New Note</button>
            </div>
          )}

          {pinned.length > 0 && <div className="notes-section-label">PINNED</div>}
          {sorted.map((note) => (
            <div
              key={note.id}
              className={`notes-item ${selected?.id === note.id ? "notes-item--active" : ""}`}
              onClick={() => selectNote(note)}
            >
              <div className="notes-item-row">
                <div className="notes-item-title">
                  {note.title || <span style={{ opacity: 0.4 }}>Untitled</span>}
                </div>
                {note.pinned && <span className="notes-pin-icon">📌</span>}
              </div>
              <div className="notes-item-preview">
                <span className="notes-item-time">{formatTime(note.updatedAt)}</span>
                <span className="notes-item-body">
                  {note.body.split("\n")[0] || "No additional text"}
                </span>
              </div>
            </div>
          ))}
        </div>

        <div className="notes-footer">
          {notes.length === 0 ? "No notes" : `${notes.length} ${notes.length === 1 ? "note" : "notes"}`}
        </div>
      </div>

      {/* ── Detail / Editor ── */}
      <div className="notes-detail">
        {selected ? (
          <>
            <div className="notes-detail-header">
              <div className="notes-detail-time">
                {selected.updatedAt !== selected.createdAt
                  ? `Edited ${formatTime(selected.updatedAt)}`
                  : `Created ${formatTime(selected.createdAt)}`}
              </div>
              <div className="notes-detail-actions">
                <button
                  className="notes-action-btn"
                  onClick={() => togglePin(selected.id)}
                  title={selected.pinned ? "Unpin" : "Pin"}
                >
                  {selected.pinned ? "📌" : "📍"}
                </button>
                <button
                  className="notes-action-btn notes-delete-btn"
                  onClick={() => deleteNote(selected.id)}
                  title="Delete note"
                >
                  🗑️
                </button>
              </div>
            </div>
            <div className="notes-editor">
              <input
                id="note-title-input"
                className="notes-editor-title"
                type="text"
                placeholder="Title"
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
              />
              <textarea
                ref={bodyRef}
                className="notes-editor-body"
                placeholder="Start writing..."
                value={editBody}
                onChange={(e) => setEditBody(e.target.value)}
              />
            </div>
          </>
        ) : (
          <div className="notes-empty">
            <div className="notes-empty-icon">📝</div>
            <p>Select a note or create a new one</p>
            <button className="notes-create-btn" onClick={createNote}>
              + New Note
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
