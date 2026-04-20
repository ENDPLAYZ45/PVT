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
  avatar_url?: string;
}

interface UserSearchProps {
  onClose: () => void;
  currentUserId: string;
}

import { motion, AnimatePresence } from "framer-motion";
import { Search, UserPlus, Users, Loader2, X } from "lucide-react";

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
        .select("id, username, avatar_url")
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
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="search-overlay" 
      onClick={onClose}
    >
      <motion.div 
        initial={{ scale: 0.9, opacity: 0, y: -20 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.9, opacity: 0, y: -20 }}
        transition={{ type: "spring", damping: 25, stiffness: 300 }}
        className="search-modal" 
        onClick={(e) => e.stopPropagation()}
      >
        <div className="search-modal-header">
          <Search size={22} className="text-muted" />
          <input
            ref={inputRef}
            className="input"
            type="text"
            placeholder="Search users..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <div className="search-results">
          {searching && (
            <div className="search-no-results">
              <Loader2 size={32} className="animate-spin text-brand mx-auto mb-4" />
              <p>Searching for users...</p>
            </div>
          )}
          
          <AnimatePresence mode="popLayout">
            {!searching && query && results.length === 0 && (
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="search-no-results"
              >
                <Users size={48} className="mx-auto mb-4 opacity-20" />
                <p className="font-semibold">No discoverable users found</p>
                <p className="text-xs text-muted-foreground mt-2">
                  Users must enable discoverability in their security settings.
                </p>
              </motion.div>
            )}

            {!searching && results.length > 0 && (
              <motion.div
                initial="hidden"
                animate="show"
                variants={{
                  show: {
                    transition: {
                      staggerChildren: 0.05
                    }
                  }
                }}
              >
                {results.map((user) => (
                  <motion.div
                    key={user.id}
                    variants={{
                      hidden: { opacity: 0, x: -10 },
                      show: { opacity: 1, x: 0 }
                    }}
                    className="search-result-item"
                    onClick={() => handleSelect(user.id)}
                  >
                    <div className={`conversation-avatar ${user.avatar_url ? "" : "conversation-avatar--brand"}`}>
                      {user.avatar_url ? (
                        <img src={user.avatar_url} alt="Avatar" />
                      ) : (
                        user.username.slice(0, 2).toUpperCase()
                      )}
                    </div>
                    <div className="flex-1">
                      <div className="conversation-name">{user.username}</div>
                      <div className="text-xs text-muted-foreground">Start a secure conversation</div>
                    </div>
                    <UserPlus size={18} className="text-brand opacity-0 group-hover:opacity-100 transition-opacity" />
                  </motion.div>
                ))}
              </motion.div>
            )}

            {!query && !searching && (
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="search-no-results"
              >
                <Search size={48} className="mx-auto mb-4 opacity-20" />
                <p>Type a username to find people</p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    </motion.div>
  );
}
