"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { generateKeyPair } from "@/lib/crypto/keygen";
import { storePrivateKey } from "@/lib/crypto/indexeddb";
import {
  encryptPrivateKeyWithPassword,
  decryptPrivateKeyWithPassword,
} from "@/lib/crypto/keyWrap";
import { useRouter } from "next/navigation";

interface AuthFormProps {
  mode: "login" | "signup";
}

export default function AuthForm({ mode }: AuthFormProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingMsg, setLoadingMsg] = useState("");
  const [forgotMode, setForgotMode] = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    const supabase = createClient();

    try {
      if (mode === "signup") {
        setLoadingMsg("Creating account...");

        // 1. Sign up with Supabase Auth
        const { data: authData, error: authError } = await supabase.auth.signUp({ email, password });
        if (authError) throw authError;
        if (!authData.user) throw new Error("Signup failed");

        setLoadingMsg("🔐 Generating encryption keys...");

        // 2. Generate RSA-OAEP key pair
        const { publicKeyJwk, privateKey, extractablePrivateKey } = await generateKeyPair();

        setLoadingMsg("🔒 Backing up key securely...");

        // 3. Encrypt private key with password (for cloud backup / cross-device)
        const encryptedPrivateKey = await encryptPrivateKeyWithPassword(
          extractablePrivateKey,
          password
        );

        // 4. Store non-extractable private key in IndexedDB (fast local access)
        await storePrivateKey(authData.user.id, privateKey);

        // 5. Store public key + encrypted private key in users table
        const { error: profileError } = await supabase.from("users").insert({
          id: authData.user.id,
          username: username.toLowerCase().trim(),
          email,
          public_key: JSON.stringify(publicKeyJwk),
          encrypted_private_key: encryptedPrivateKey,
          discoverable: false,
        });

        if (profileError) throw profileError;

        router.push("/chat");
      } else {
        // LOGIN
        setLoadingMsg("Signing in...");

        const { data, error: loginError } = await supabase.auth.signInWithPassword({ email, password });
        if (loginError) throw loginError;
        if (!data.user) throw new Error("Login failed");

        // Check if key already exists in IndexedDB
        const { hasPrivateKey } = await import("@/lib/crypto/indexeddb");
        const hasKey = await hasPrivateKey(data.user.id);

        if (!hasKey) {
          setLoadingMsg("🔑 Restoring encryption key...");

          // Fetch encrypted private key from Supabase
          const { data: userData, error: fetchErr } = await supabase
            .from("users")
            .select("encrypted_private_key")
            .eq("id", data.user.id)
            .single();

          if (fetchErr || !userData?.encrypted_private_key) {
            throw new Error("Could not restore encryption key. Please contact support.");
          }

          // Decrypt the private key using the password
          const restoredKey = await decryptPrivateKeyWithPassword(
            userData.encrypted_private_key,
            password
          );

          // Store restored key in IndexedDB
          await storePrivateKey(data.user.id, restoredKey);
        }

        router.push("/chat");
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Something went wrong";
      setError(message);
    } finally {
      setLoading(false);
      setLoadingMsg("");
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");
    setLoading(true);
    const supabase = createClient();
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(forgotEmail, {
      redirectTo: `${window.location.origin}/auth/callback?next=/reset-password`,
    });
    setLoading(false);
    if (resetError) { setError(resetError.message); return; }
    setSuccess("✅ Reset link sent! Check your email inbox.");
  };

  // ── Forgot Password View ──
  if (forgotMode) {
    return (
      <form className="auth-form" onSubmit={handleForgotPassword}>
        <h2 style={{ marginBottom: 4 }}>Reset Password</h2>
        <p style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginBottom: 16 }}>
          Enter your email and we'll send a reset link.
        </p>
        {error && <div className="auth-error">⚠ {error}</div>}
        {success && <div className="auth-success">✅ {success}</div>}
        <div className="input-group">
          <label htmlFor="forgot-email">Email</label>
          <input
            id="forgot-email"
            className="input"
            type="email"
            placeholder="you@example.com"
            value={forgotEmail}
            onChange={(e) => setForgotEmail(e.target.value)}
            required
          />
        </div>
        <button type="submit" className="btn btn--primary btn--full" disabled={loading}>
          {loading ? "Sending..." : "Send Reset Link"}
        </button>
        <button
          type="button"
          className="btn btn--ghost btn--full"
          style={{ marginTop: 8 }}
          onClick={() => { setForgotMode(false); setError(""); setSuccess(""); }}
        >
          ← Back to Sign In
        </button>
      </form>
    );
  }

  return (
    <form className="auth-form" onSubmit={handleSubmit}>
      {error && <div className="auth-error">⚠ {error}</div>}

      {mode === "signup" && (
        <div className="input-group">
          <label htmlFor="username">Username</label>
          <input
            id="username"
            className="input"
            type="text"
            placeholder="Choose a unique username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
            minLength={3}
            maxLength={24}
            pattern="^[a-zA-Z0-9_]+$"
            title="Letters, numbers, and underscores only"
          />
        </div>
      )}

      <div className="input-group">
        <label htmlFor="email">Email</label>
        <input
          id="email"
          className="input"
          type="email"
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
      </div>

      <div className="input-group">
        <label htmlFor="password">Password</label>
        <input
          id="password"
          className="input"
          type="password"
          placeholder="Min 6 characters"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          minLength={6}
        />
      </div>

      <button
        type="submit"
        className="btn btn--primary btn--full"
        disabled={loading}
      >
        {loading
          ? loadingMsg || "Loading..."
          : mode === "signup"
          ? "🔐 Sign Up & Generate Keys"
          : "→ Sign In"}
      </button>

      {mode === "login" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10, alignItems: "center" }}>
          <button
            type="button"
            className="forgot-link"
            onClick={() => { setForgotMode(true); setForgotEmail(email); setError(""); }}
          >
            Forgot password?
          </button>
          <p style={{ fontSize: "0.72rem", color: "var(--text-muted)", textAlign: "center" }}>
            🔑 Key restored from password — messages accessible on all devices.
          </p>
        </div>
      )}
    </form>
  );
}
