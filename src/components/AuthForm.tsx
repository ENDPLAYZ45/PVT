"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { generateKeyPair } from "@/lib/crypto/keygen";
import { storePrivateKey } from "@/lib/crypto/indexeddb";
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
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    const supabase = createClient();

    try {
      if (mode === "signup") {
        // 1. Sign up with Supabase Auth
        const { data: authData, error: authError } =
          await supabase.auth.signUp({
            email,
            password,
          });

        if (authError) throw authError;
        if (!authData.user) throw new Error("Signup failed");

        // 2. Generate RSA-OAEP key pair
        const { publicKeyJwk, privateKey } = await generateKeyPair();

        // 3. Store private key in IndexedDB (non-extractable)
        await storePrivateKey(authData.user.id, privateKey);

        // 4. Store public key + username in users table
        const { error: profileError } = await supabase.from("users").insert({
          id: authData.user.id,
          username: username.toLowerCase().trim(),
          email,
          public_key: JSON.stringify(publicKeyJwk),
          discoverable: false,
        });

        if (profileError) throw profileError;

        // Mark first login for key warning
        localStorage.setItem("pvt_first_login", "true");

        router.push("/chat");
      } else {
        // Login
        const { data, error: loginError } =
          await supabase.auth.signInWithPassword({
            email,
            password,
          });

        if (loginError) throw loginError;

        router.push("/chat");
      }
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Something went wrong";
      setError(message);
    } finally {
      setLoading(false);
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
          ? mode === "signup"
            ? "🔐 Generating keys..."
            : "Signing in..."
          : mode === "signup"
          ? "🔐 Sign Up & Generate Keys"
          : "→ Sign In"}
      </button>
    </form>
  );
}
