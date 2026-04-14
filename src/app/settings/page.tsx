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
  const [avatarUrl, setAvatarUrl] = useState("");
  const [wallpaper, setWallpaper] = useState("");
  const [saving, setSaving] = useState(false);
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteInput, setDeleteInput] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const router = useRouter();

  useEffect(() => {
    if (!user) return;

    async function loadProfile() {
      const supabase = createClient();
      const { data } = await supabase
        .from("users")
        .select("username, discoverable, avatar_url, wallpaper")
        .eq("id", user!.id)
        .single();

      if (data) {
        setUsername(data.username);
        setDiscoverable(data.discoverable);
        setAvatarUrl(data.avatar_url || "");
        setWallpaper(data.wallpaper || "");
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
    await supabase.from("users").update({ discoverable: newVal }).eq("id", user.id);
    setDiscoverable(newVal);
    setSaving(false);
  };

  const handleMediaUpload = async (e: React.ChangeEvent<HTMLInputElement>, type: "avatar" | "wallpaper") => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    
    setSaving(true);
    const supabase = createClient();
    const fileExt = file.name.split('.').pop() || 'png';
    const filePath = `${user.id}/${type}-${Date.now()}.${fileExt}`;
    
    // Upload image to user-assets
    const { error: uploadError } = await supabase.storage.from("user-assets").upload(filePath, file);
    if (uploadError) {
      alert(`Error uploading ${type}`);
      setSaving(false);
      return;
    }
    
    // Get public URL
    const { data: { publicUrl } } = supabase.storage.from("user-assets").getPublicUrl(filePath);
    
    // Save URL to users table
    const updateField = type === "avatar" ? { avatar_url: publicUrl } : { wallpaper: publicUrl };
    await supabase.from("users").update(updateField).eq("id", user.id);
    
    if (type === "avatar") setAvatarUrl(publicUrl);
    else setWallpaper(publicUrl);
    
    setSaving(false);
  };

  const handleColorWallpaper = async (color: string) => {
    if (!user) return;
    setSaving(true);
    const supabase = createClient();
    await supabase.from("users").update({ wallpaper: color }).eq("id", user.id);
    setWallpaper(color);
    setSaving(false);
  };

  const handleDeleteAccount = async () => {
    if (!user || deleting) return;
    if (deleteInput !== username) {
      setDeleteError(`Type your username "${username}" to confirm.`);
      return;
    }

    setDeleting(true);
    setDeleteError("");

    try {
      const supabase = createClient();

      // 1. Delete all messages
      await supabase
        .from("messages")
        .delete()
        .or(`sender_id.eq.${user.id},receiver_id.eq.${user.id}`);

      // 2. Delete user profile
      await supabase.from("users").delete().eq("id", user.id);

      // 3. Sign out
      await supabase.auth.signOut();

      // 4. Clear local storage & IndexedDB entry is lost on signout
      localStorage.clear();

      router.push("/signup");
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "Failed to delete account.");
      setDeleting(false);
    }
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
        <button className="btn btn--small btn--secondary" onClick={() => router.push("/chat")}>
          ← Back to Chat
        </button>
      </div>

      <h2 style={{ marginBottom: 32 }}>⚙️ Settings</h2>

      {/* Profile */}
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

      {/* Appearance */}
      <div className="settings-section">
        <h3>Appearance</h3>
        
        {/* Avatar */}
        <div className="settings-row" style={{ alignItems: "center" }}>
          <div className="settings-row-label">
            <h4>Profile Picture</h4>
            <p>Will be visible to other users when searching or chatting</p>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div className="conversation-avatar conversation-avatar--yellow" style={{ width: 48, height: 48, minWidth: 48, fontSize: "1.1rem" }}>
              {avatarUrl ? (
                <img src={avatarUrl} alt="Avatar" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              ) : (
                username?.slice(0, 2).toUpperCase()
              )}
            </div>
            <label className="btn btn--small btn--ghost" style={{ cursor: saving ? "wait" : "pointer" }}>
              {saving ? "Uploading..." : "Upload"}
              <input type="file" accept="image/*" hidden disabled={saving} onChange={(e) => handleMediaUpload(e, "avatar")} />
            </label>
          </div>
        </div>

        {/* Wallpaper */}
        <div className="settings-row" style={{ flexDirection: "column", alignItems: "flex-start", gap: 16 }}>
          <div className="settings-row-label">
            <h4>Chat Wallpaper</h4>
            <p>Customize the background behind your chat conversations</p>
          </div>
          
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
            <button className="wallpaper-btn" style={{ background: "var(--bg-chat)" }} onClick={() => handleColorWallpaper("")}>
              {(!wallpaper || wallpaper === "var(--bg-chat)") && "✓"}
            </button>
            <button className="wallpaper-btn" style={{ background: "#FFD700" }} onClick={() => handleColorWallpaper("#FFD700")}>
              {wallpaper === "#FFD700" && "✓"}
            </button>
            <button className="wallpaper-btn" style={{ background: "#A8E6E0" }} onClick={() => handleColorWallpaper("#A8E6E0")}>
              {wallpaper === "#A8E6E0" && "✓"}
            </button>
            <button className="wallpaper-btn" style={{ background: "#FFB8D0" }} onClick={() => handleColorWallpaper("#FFB8D0")}>
              {wallpaper === "#FFB8D0" && "✓"}
            </button>
            
            <label className="btn btn--small btn--ghost" style={{ cursor: saving ? "wait" : "pointer" }}>
              🖼️ Custom Image
              <input type="file" accept="image/*" hidden disabled={saving} onChange={(e) => handleMediaUpload(e, "wallpaper")} />
            </label>
          </div>
          {wallpaper && wallpaper.startsWith("http") && (
            <div style={{ fontSize: "0.8rem", color: "var(--green)", fontWeight: 600 }}>✓ Custom Image Selected</div>
          )}
        </div>
      </div>

      {/* Privacy */}
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

      {/* Encryption */}
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
            marginTop: 12, padding: 14,
            background: "var(--yellow-light)",
            border: "2px solid var(--border-color)",
            borderRadius: "var(--radius)",
            fontSize: "0.82rem", lineHeight: 1.6,
          }}
        >
          🔑 Your private key is backed up via your password. Log in on any device to restore your messages.
        </div>
      </div>

      {/* Danger Zone */}
      <div className="settings-section">
        <h3 style={{ color: "var(--red)" }}>⚠️ Danger Zone</h3>
        <div className="settings-row" style={{ flexDirection: "column", alignItems: "flex-start", gap: 12 }}>
          <div className="settings-row-label">
            <h4>Delete Account</h4>
            <p>Permanently deletes your account, all messages, and your encryption keys. This cannot be undone.</p>
          </div>
          <button
            className="btn btn--danger btn--small"
            onClick={() => { setShowDeleteConfirm(true); setDeleteInput(""); setDeleteError(""); }}
          >
            🗑️ Delete My Account
          </button>
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="confirm-overlay" onClick={() => !deleting && setShowDeleteConfirm(false)}>
          <div className="confirm-dialog" onClick={(e) => e.stopPropagation()}>
            <div className="confirm-icon">⚠️</div>
            <h3>Delete Account?</h3>
            <p>
              This will permanently delete your account, all messages, and your encryption keys.
              {" "}<strong>This cannot be undone.</strong>
            </p>
            <p style={{ marginBottom: 16, marginTop: -12, color: "var(--text-muted)", fontSize: "0.82rem" }}>
              Type <strong style={{ color: "var(--text-primary)" }}>{username}</strong> to confirm:
            </p>
            <input
              className="input"
              type="text"
              placeholder={username}
              value={deleteInput}
              onChange={(e) => { setDeleteInput(e.target.value); setDeleteError(""); }}
              style={{ marginBottom: 12, textAlign: "center" }}
              disabled={deleting}
              autoFocus
            />
            {deleteError && (
              <div style={{ color: "var(--red)", fontSize: "0.82rem", marginBottom: 12, fontWeight: 600 }}>
                {deleteError}
              </div>
            )}
            <div className="confirm-actions">
              <button
                className="btn btn--secondary"
                onClick={() => setShowDeleteConfirm(false)}
                disabled={deleting}
              >
                Cancel
              </button>
              <button
                className="btn btn--danger"
                onClick={handleDeleteAccount}
                disabled={deleting || deleteInput !== username}
              >
                {deleting ? "Deleting..." : "Delete Forever"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
