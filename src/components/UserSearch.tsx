"use client";

import { useState, useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";

const AVATAR_COLORS = [
  "conversation-avatar--yellow",
  "conversation-avatar--pink",
  "conversation-avatar--blue",
  "conversation-avatar--lime",
];

function getAvatarColor(id: string) {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = id.charCodeAt(i) + ((hash << 5) - hash);
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

interface SearchResult {
  id: string;
  username: string;
}

interface UserSearchProps {
  onClose: () => void;
  currentUserId: string;
}

export default function UserSearch({ onClose, currentUserId }: UserSearchProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (!query.trim()) {
      setResults([]);
      return;
    }

    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      const supabase = createClient();

      const { data, error } = await supabase
        .from("users")
        .select("id, username")
        .eq("discoverable", true)
        .ilike("username", `%${query.trim()}%`)
        .neq("id", currentUserId)
        .limit(10);

      if (!error && data) {
        setResults(data);
      }
      setSearching(false);
    }, 300);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, currentUserId]);

  const handleSelect = (userId: string) => {
    onClose();
    router.push(`/chat/${userId}`);
  };

  return (
    <div className="search-overlay" onClick={onClose}>
      <div className="search-modal" onClick={(e) => e.stopPropagation()}>
        <div className="search-modal-header">
          <span style={{ fontSize: "1.2rem" }}>🔍</span>
          <input
            ref={inputRef}
            className="input"
            type="text"
            placeholder="Search users by username..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <div className="search-results">
          {searching && (
            <div className="search-no-results">
              <div className="spinner" style={{ margin: "0 auto" }}></div>
            </div>
          )}
          {!searching && query && results.length === 0 && (
            <div className="search-no-results">
              <p>No discoverable users found</p>
              <p style={{ fontSize: "0.78rem", marginTop: 4 }}>
                Users must enable discoverability in settings
              </p>
            </div>
          )}
          {results.map((user) => (
            <div
              key={user.id}
              className="search-result-item"
              onClick={() => handleSelect(user.id)}
            >
              <div className={`conversation-avatar ${getAvatarColor(user.id)}`}>
                {user.username.slice(0, 2)}
              </div>
              <div>
                <div className="conversation-name">{user.username}</div>
                <div style={{ fontSize: "0.78rem", color: "var(--text-muted)" }}>
                  Click to start a conversation
                </div>
              </div>
            </div>
          ))}
          {!query && (
            <div className="search-no-results">
              <p>Type a username to search</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
