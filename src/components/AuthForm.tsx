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
  const [loading, setLoading] = useState(false);
  const [loadingMsg, setLoadingMsg] = useState("");
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
        <p style={{ fontSize: "0.75rem", color: "var(--text-muted)", textAlign: "center" }}>
          🔑 Your encryption key is restored from your password — messages are accessible on all devices.
        </p>
      )}
    </form>
  );
}
