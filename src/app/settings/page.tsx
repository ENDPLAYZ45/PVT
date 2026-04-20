"use client";

import { useState, useEffect } from "react";
import { useSupabaseUser } from "@/hooks/useSupabaseUser";
import { usePrivateKey } from "@/hooks/usePrivateKey";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { storage } from "@/lib/firebase/client";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";

import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, Settings, User, Mail, Shield, Trash2, Camera, Lock, CheckCircle, XCircle, AlertTriangle } from "lucide-react";

export default function SettingsPage() {
  const { user, loading: userLoading } = useSupabaseUser();
  const { hasKey } = usePrivateKey(user?.id);
  const [discoverable, setDiscoverable] = useState(false);
  const [username, setUsername] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
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
        .select("username, discoverable, avatar_url")
        .eq("id", user!.id)
        .single();

      if (data) {
        setUsername(data.username);
        setDiscoverable(data.discoverable);
        setAvatarUrl(data.avatar_url || "");
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

  const handleMediaUpload = async (e: React.ChangeEvent<HTMLInputElement>, type: "avatar") => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    
    setSaving(true);
    const supabase = createClient();
    const fileExt = file.name.split('.').pop() || 'png';
    const filePath = `${user.id}/${type}-${Date.now()}.${fileExt}`;
    const storageRef = ref(storage, filePath);
    
    try {
      await uploadBytes(storageRef, file);
      const publicUrl = await getDownloadURL(storageRef);
      await supabase.from("users").update({ avatar_url: publicUrl }).eq("id", user.id);
      setAvatarUrl(publicUrl);
    } catch (error) {
      console.error("Upload failed", error);
    } finally {
      setSaving(false);
    }
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
      await supabase.from("messages").delete().or(`sender_id.eq.${user.id},receiver_id.eq.${user.id}`);
      await supabase.from("users").delete().eq("id", user.id);
      await supabase.auth.signOut();
      localStorage.clear();
      router.push("/signup");
    } catch (err) {
      setDeleteError("Failed to delete account");
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
    <motion.div 
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      className="settings-page"
    >
      <div className="mb-8">
        <motion.button 
          whileHover={{ x: -4 }}
          className="btn btn--secondary flex items-center gap-2" 
          onClick={() => router.push("/chat")}
        >
          <ArrowLeft size={18} /> Back to Chat
        </motion.button>
      </div>

      <header className="flex items-center gap-4 mb-10">
        <div className="p-3 bg-brand-light text-brand rounded-2xl">
          <Settings size={32} />
        </div>
        <h1 className="text-3xl font-bold">Settings</h1>
      </header>

      <motion.div
        initial="hidden"
        animate="show"
        variants={{
          show: {
            transition: { staggerChildren: 0.1 }
          }
        }}
        className="space-y-12"
      >
        {/* Profile */}
        <motion.section variants={{ hidden: { opacity: 0, y: 20 }, show: { opacity: 1, y: 0 } }} className="settings-section">
          <h3>Profile & Identity</h3>
          
          <div className="settings-row" style={{ alignItems: 'center' }}>
            <div className="settings-row-label">
              <div className="flex items-center gap-2 mb-2">
                <Camera size={16} className="text-brand" />
                <h4 className="m-0">Profile Picture</h4>
              </div>
              <p>Customize how others see you in encrypted chats</p>
            </div>
            <div className="flex items-center gap-4">
              <div className={`conversation-avatar ${avatarUrl ? '' : 'conversation-avatar--brand'}`} style={{ width: 64, height: 64 }}>
                {avatarUrl ? (
                  <img src={avatarUrl} alt="Avatar" />
                ) : (
                  username?.slice(0, 2).toUpperCase()
                )}
              </div>
              <label className="btn btn--secondary flex items-center gap-2 cursor-pointer">
                {saving ? "..." : <><Camera size={16} /> Edit</>}
                <input type="file" accept="image/*" hidden disabled={saving} onChange={(e) => handleMediaUpload(e, "avatar")} />
              </label>
            </div>
          </div>

          <div className="settings-row">
            <div className="settings-row-label">
              <div className="flex items-center gap-2 mb-2">
                <User size={16} className="text-brand" />
                <h4 className="m-0">Display Name</h4>
              </div>
              <p>Your unique identifier on PVT</p>
            </div>
            <div className="chip chip--brand">{username}</div>
          </div>

          <div className="settings-row">
            <div className="settings-row-label">
              <div className="flex items-center gap-2 mb-2">
                <Mail size={16} className="text-brand" />
                <h4 className="m-0">Email Address</h4>
              </div>
              <p>Used only for secure account recovery</p>
            </div>
            <span className="text-muted-foreground">{user?.email}</span>
          </div>
        </motion.section>

        {/* Privacy & Security */}
        <motion.section variants={{ hidden: { opacity: 0, y: 20 }, show: { opacity: 1, y: 0 } }} className="settings-section">
          <h3>Security & Privacy</h3>
          <div className="settings-row">
            <div className="settings-row-label">
              <div className="flex items-center gap-2 mb-2">
                <Shield size={16} className="text-brand" />
                <h4 className="m-0">Discoverable</h4>
              </div>
              <p>Let others find you via username search</p>
            </div>
            <label className="toggle">
              <input type="checkbox" checked={discoverable} onChange={toggleDiscoverable} disabled={saving} />
              <span className="toggle-slider" />
            </label>
          </div>

          <div className="settings-row">
            <div className="settings-row-label">
              <div className="flex items-center gap-2 mb-2">
                <Lock size={16} className="text-brand" />
                <h4 className="m-0">E2E Protection</h4>
              </div>
              <p>{hasKey ? "Device key is active and secure." : "Warning: No private key found."}</p>
            </div>
            <div className={`chip ${hasKey ? "chip--brand" : "chip--error"} flex items-center gap-2`}>
              {hasKey ? <CheckCircle size={14} /> : <XCircle size={14} />}
              {hasKey ? "Encrypted" : "Insecure"}
            </div>
          </div>
          
          <div className="mt-4 p-4 glass-panel border-brand/20 flex gap-4 items-start">
            <Lock size={20} className="text-brand mt-1" />
            <p className="text-sm opacity-80 leading-relaxed">
              Your messages are protected by post-quantum resistant encryption. 
              The private key nunca leaves your device, keeping your secrets truly private.
            </p>
          </div>
        </motion.section>

        {/* Danger Zone */}
        <motion.section variants={{ hidden: { opacity: 0, y: 20 }, show: { opacity: 1, y: 0 } }} className="settings-section pt-4">
          <div className="flex items-center gap-2 mb-6">
            <AlertTriangle size={20} className="text-error" />
            <h3 className="m-0 text-error">Critical Actions</h3>
          </div>
          <div className="p-6 border border-error/20 bg-error/5 rounded-3xl flex flex-col gap-6">
            <div className="settings-row-label">
              <h4 className="text-error bold">Delete Account</h4>
              <p className="opacity-80">Wipe your entire digital footprint including all messages and keys. This is irreversible.</p>
            </div>
            <button
              className="btn btn--danger w-fit px-6"
              onClick={() => { setShowDeleteConfirm(true); setDeleteInput(""); setDeleteError(""); }}
            >
              <Trash2 size={18} className="mr-2" /> Deactivate and Delete
            </button>
          </div>
        </motion.section>
      </motion.div>

      {/* Delete Confirmation Modal */}
      <AnimatePresence>
        {showDeleteConfirm && (
          <div className="confirm-overlay" onClick={() => !deleting && setShowDeleteConfirm(false)}>
            <motion.div 
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="confirm-dialog" 
              onClick={(e) => e.stopPropagation()}
            >
              <div className="w-16 h-16 bg-error/10 text-error rounded-full flex items-center justify-center mx-auto mb-6">
                <AlertTriangle size={32} />
              </div>
              <h3 className="mb-2">Are you absolutely sure?</h3>
              <p className="text-sm text-muted-foreground mb-8">
                This will purge all your data. Type <strong className="text-primary">{username}</strong> to confirm.
              </p>
              
              <input
                className="input text-center mb-6 py-4 text-lg font-bold"
                type="text"
                placeholder={username}
                value={deleteInput}
                onChange={(e) => { setDeleteInput(e.target.value); setDeleteError(""); }}
                disabled={deleting}
                autoFocus
              />
              
              {deleteError && (
                <div className="text-error text-sm font-bold mb-6 flex items-center justify-center gap-2">
                  <XCircle size={14} /> {deleteError}
                </div>
              )}

              <div className="flex gap-3">
                <button
                  className="btn btn--secondary flex-1"
                  onClick={() => setShowDeleteConfirm(false)}
                  disabled={deleting}
                >
                  Cancel
                </button>
                <button
                  className="btn btn--danger flex-1"
                  onClick={handleDeleteAccount}
                  disabled={deleting || deleteInput !== username}
                >
                  {deleting ? "Deleting..." : "Delete Forever"}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
