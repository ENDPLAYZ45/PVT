"use client";

import { useState, useEffect } from "react";
import { useSupabaseUser } from "@/hooks/useSupabaseUser";
import { usePrivateKey } from "@/hooks/usePrivateKey";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";

export default function SettingsPage() {
  const { user, loading: userLoading } = useSupabaseUser();
  const { hasKey } = usePrivateKey(user?.id);
  const [discoverable, setDiscoverable] = useState(false);
  const [username, setUsername] = useState("");
  const [saving, setSaving] = useState(false);
  const [loadingProfile, setLoadingProfile] = useState(true);
  const router = useRouter();

  useEffect(() => {
    if (!user) return;

    async function loadProfile() {
      const supabase = createClient();
      const { data } = await supabase
        .from("users")
        .select("username, discoverable")
        .eq("id", user!.id)
        .single();

      if (data) {
        setUsername(data.username);
        setDiscoverable(data.discoverable);
      }
      setLoadingProfile(false);
    }

    loadProfile();
  }, [user]);

  const toggleDiscoverable = async () => {
    if (!user) return;
    setSaving(true);

    const supabase = createClient();
    const newVal = !discoverable;

    await supabase
      .from("users")
      .update({ discoverable: newVal })
      .eq("id", user.id);

    setDiscoverable(newVal);
    setSaving(false);
  };

  if (userLoading || loadingProfile) {
    return (
      <div className="loading-center">
        <div className="spinner" />
      </div>
    );
  }

  return (
    <div className="settings-page">
      <div style={{ marginBottom: 24 }}>
        <button
          className="btn btn--small btn--secondary"
          onClick={() => router.push("/chat")}
        >
          ← Back to Chat
        </button>
      </div>

      <h2 style={{ marginBottom: 32 }}>⚙️ Settings</h2>

      <div className="settings-section">
        <h3>Profile</h3>
        <div className="settings-row">
          <div className="settings-row-label">
            <h4>Username</h4>
            <p>{username}</p>
          </div>
          <div className="chip chip--blue">{username}</div>
        </div>
        <div className="settings-row">
          <div className="settings-row-label">
            <h4>Email</h4>
            <p>{user?.email}</p>
          </div>
        </div>
      </div>

      <div className="settings-section">
        <h3>Privacy</h3>
        <div className="settings-row">
          <div className="settings-row-label">
            <h4>Discoverable</h4>
            <p>Allow other users to find you by username search</p>
          </div>
          <label className="toggle">
            <input
              type="checkbox"
              checked={discoverable}
              onChange={toggleDiscoverable}
              disabled={saving}
            />
            <span className="toggle-slider" />
          </label>
        </div>
      </div>

      <div className="settings-section">
        <h3>Encryption</h3>
        <div className="settings-row">
          <div className="settings-row-label">
            <h4>Private Key</h4>
            <p>
              {hasKey
                ? "Stored securely in this browser's IndexedDB"
                : "⚠️ No private key found on this device"}
            </p>
          </div>
          <div className={`chip ${hasKey ? "chip--green" : "chip--pink"}`}>
            {hasKey ? "✓ Active" : "✗ Missing"}
          </div>
        </div>
        <div
          style={{
            marginTop: 12,
            padding: 16,
            background: "var(--yellow-light)",
            border: "2px solid var(--border-color)",
            borderRadius: "var(--radius)",
            fontSize: "0.85rem",
            lineHeight: 1.6,
          }}
        >
          <strong>⚠️ Important:</strong> Your private key is stored only in this
          browser. If you clear browser data or switch devices, you will lose
          access to your message history. This is by design for maximum
          security.
        </div>
      </div>
    </div>
  );
}
