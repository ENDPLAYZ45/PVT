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
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    const supabase = createClient();
    const code = searchParams.get("code");

    if (code) {
      // PKCE flow — exchange code for session client-side
      supabase.auth.exchangeCodeForSession(code).then(({ error: exchErr }) => {
        setChecking(false);
        if (exchErr) {
          setError("This reset link is expired or already used. Please request a new one.");
        } else {
          setSessionReady(true);
        }
      });
    } else {
      // Implicit / hash flow — Supabase SDK auto-handles #access_token in URL
      supabase.auth.onAuthStateChange((event, session) => {
        if (event === "PASSWORD_RECOVERY" || (event === "SIGNED_IN" && session)) {
          setSessionReady(true);
          setChecking(false);
        }
      });

      // Also check if session already exists
      supabase.auth.getSession().then(({ data }) => {
        if (data.session) {
          setSessionReady(true);
        }
        setChecking(false);
      });
    }
  }, [searchParams]);

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (password.length < 6) { setError("Password must be at least 6 characters."); return; }
    if (password !== confirm) { setError("Passwords don't match."); return; }

    setLoading(true);
    const supabase = createClient();
    const { error: updateError } = await supabase.auth.updateUser({ password });
    setLoading(false);

    if (updateError) { setError(updateError.message); return; }

    setSuccess("✅ Password updated successfully!");
    setTimeout(() => router.push("/login"), 2500);
  };

  return (
    <div className="auth-layout">
      <div className="auth-card">
        <div className="card">
          <div className="auth-header">
            <div className="auth-logo">🔑</div>
            <h1>Reset Password</h1>
            <p>Choose a strong new password</p>
          </div>

          {error && <div className="auth-error">⚠ {error}</div>}
          {success && <div className="auth-success">{success}</div>}

          {checking && !error && (
            <div style={{ textAlign: "center", padding: "20px 0" }}>
              <div className="spinner" style={{ margin: "0 auto 12px" }} />
              <p style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>Verifying link...</p>
            </div>
          )}

          {!checking && sessionReady && !success && (
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
              <button type="submit" className="btn btn--primary btn--full" disabled={loading}>
                {loading ? "Updating..." : "🔐 Set New Password"}
              </button>
            </form>
          )}

          {!checking && !sessionReady && !error && (
            <div style={{ textAlign: "center", padding: "20px 0", color: "var(--text-muted)" }}>
              <p>No valid session found.</p>
              <a href="/login" className="btn btn--secondary" style={{ display: "inline-block", marginTop: 12 }}>
                ← Back to Login
              </a>
            </div>
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
