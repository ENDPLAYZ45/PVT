"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);
  const [sessionReady, setSessionReady] = useState(false);

  useEffect(() => {
    // Supabase sends the token either as ?code= (PKCE) or #access_token= (implicit)
    // The client SDK handles this automatically via onAuthStateChange
    const supabase = createClient();

    // Handle the code exchange from the URL
    const code = searchParams.get("code");
    if (code) {
      supabase.auth.exchangeCodeForSession(code).then(({ error }) => {
        if (error) {
          setError("Reset link is invalid or expired. Please request a new one.");
        } else {
          setSessionReady(true);
        }
      });
    } else {
      // Check if already in recovery session (implicit flow via hash)
      supabase.auth.onAuthStateChange((event) => {
        if (event === "PASSWORD_RECOVERY") {
          setSessionReady(true);
        }
      });
    }
  }, [searchParams]);

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords don't match.");
      return;
    }

    setLoading(true);
    const supabase = createClient();
    const { error: updateError } = await supabase.auth.updateUser({ password });
    setLoading(false);

    if (updateError) {
      setError(updateError.message);
      return;
    }

    setSuccess("✅ Password updated! Redirecting to login...");
    setTimeout(() => router.push("/login"), 2000);
  };

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="card">
          <div className="auth-header">
            <div className="auth-logo">🔑</div>
            <h1>Reset Password</h1>
            <p>Choose a new password for your account</p>
          </div>

          {error && <div className="auth-error">⚠ {error}</div>}
          {success && <div className="auth-success">{success}</div>}

          {!success && (
            <form className="auth-form" onSubmit={handleReset}>
              <div className="input-group">
                <label htmlFor="new-password">New Password</label>
                <input
                  id="new-password"
                  className="input"
                  type="password"
                  placeholder="Min 6 characters"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={6}
                  autoFocus
                />
              </div>

              <div className="input-group">
                <label htmlFor="confirm-password">Confirm Password</label>
                <input
                  id="confirm-password"
                  className="input"
                  type="password"
                  placeholder="Repeat your new password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  required
                  minLength={6}
                />
              </div>

              <button
                type="submit"
                className="btn btn--primary btn--full"
                disabled={loading || !sessionReady}
              >
                {loading
                  ? "Updating..."
                  : !sessionReady
                  ? "Verifying link..."
                  : "🔐 Set New Password"}
              </button>

              {!sessionReady && !error && (
                <p style={{ fontSize: "0.78rem", color: "var(--text-muted)", textAlign: "center" }}>
                  ⏳ Verifying your reset link...
                </p>
              )}
            </form>
          )}

          <div className="auth-footer">
            <a href="/login">← Back to Sign In</a>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={
      <div className="loading-center"><div className="spinner" /></div>
    }>
      <ResetPasswordForm />
    </Suspense>
  );
}
