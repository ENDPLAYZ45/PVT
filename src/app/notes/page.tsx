"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

const DEFAULT_NOTES = [
  { id: 1, title: "Grocery List", body: "• Milk\n• Eggs\n• Bread\n• Butter\n• Coffee\n• Fruits", time: "10:30 AM", pinned: true },
  { id: 2, title: "Weekend Plans", body: "Call mom on Sunday\nPay electricity bill\nGym — skip leg day?\nMovie with friends maybe", time: "Yesterday", pinned: false },
  { id: 3, title: "Work Notes", body: "Meeting at 3pm — ask about project timeline\nSend report to Rahul\nDeadline: Friday EOD", time: "Mon", pinned: false },
  { id: 4, title: "Passwords reminder", body: "Use password manager\nDon't reuse passwords\nUpdate old accounts", time: "Last week", pinned: false },
  { id: 5, title: "Book recommendations", body: "Atomic Habits — James Clear\nThe Alchemist\nSapiens\nLet's Talk Money", time: "2 weeks ago", pinned: false },
];

export default function NotesPage() {
  const router = useRouter();
  const [selected, setSelected] = useState<typeof DEFAULT_NOTES[0] | null>(null);
  const [search, setSearch] = useState("");
  const [logoTaps, setLogoTaps] = useState(0);
  const [tapTimer, setTapTimer] = useState<ReturnType<typeof setTimeout> | null>(null);

  // Secret: tap the "N" logo 3 times to return to chat
  const handleLogoTap = () => {
    const newCount = logoTaps + 1;
    setLogoTaps(newCount);

    if (tapTimer) clearTimeout(tapTimer);
    const t = setTimeout(() => setLogoTaps(0), 2000);
    setTapTimer(t);

    if (newCount >= 3) {
      setLogoTaps(0);
      router.push("/chat");
    }
  };

  const filtered = DEFAULT_NOTES.filter(
    (n) =>
      n.title.toLowerCase().includes(search.toLowerCase()) ||
      n.body.toLowerCase().includes(search.toLowerCase())
  );

  const pinned = filtered.filter((n) => n.pinned);
  const others = filtered.filter((n) => !n.pinned);

  return (
    <div className="notes-layout">
      {/* Sidebar */}
      <div className="notes-sidebar">
        <div className="notes-header">
          <div className="notes-logo" onClick={handleLogoTap} title="">
            📝
          </div>
          <h1 className="notes-title">Notes</h1>
          <button className="notes-compose" title="New note">✏️</button>
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

        {pinned.length > 0 && (
          <>
            <div className="notes-section-label">PINNED</div>
            {pinned.map((note) => (
              <div
                key={note.id}
                className={`notes-item ${selected?.id === note.id ? "notes-item--active" : ""}`}
                onClick={() => setSelected(note)}
              >
                <div className="notes-item-title">{note.title}</div>
                <div className="notes-item-preview">
                  <span className="notes-item-time">{note.time}</span>
                  <span className="notes-item-body">{note.body.split("\n")[0]}</span>
                </div>
              </div>
            ))}
          </>
        )}

        {others.length > 0 && (
          <>
            {pinned.length > 0 && <div className="notes-section-label">OTHER NOTES</div>}
            {others.map((note) => (
              <div
                key={note.id}
                className={`notes-item ${selected?.id === note.id ? "notes-item--active" : ""}`}
                onClick={() => setSelected(note)}
              >
                <div className="notes-item-title">{note.title}</div>
                <div className="notes-item-preview">
                  <span className="notes-item-time">{note.time}</span>
                  <span className="notes-item-body">{note.body.split("\n")[0]}</span>
                </div>
              </div>
            ))}
          </>
        )}

        <div className="notes-footer">
          <span>{DEFAULT_NOTES.length} Notes</span>
        </div>
      </div>

      {/* Note detail */}
      <div className="notes-detail">
        {selected ? (
          <>
            <div className="notes-detail-header">
              <div className="notes-detail-time">Edited {selected.time}</div>
              <div className="notes-detail-actions">
                <button className="notes-action-btn">⋯</button>
              </div>
            </div>
            <div className="notes-detail-body">
              <h2 className="notes-detail-title">{selected.title}</h2>
              <div className="notes-detail-text">
                {selected.body.split("\n").map((line, i) => (
                  <p key={i}>{line || <br />}</p>
                ))}
              </div>
            </div>
          </>
        ) : (
          <div className="notes-empty">
            <div className="notes-empty-icon">📝</div>
            <p>Select a note to read it</p>
          </div>
        )}
      </div>
    </div>
  );
}
