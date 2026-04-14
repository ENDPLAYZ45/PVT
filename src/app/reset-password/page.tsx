"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function ResetPasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);

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

    setSuccess("✅ Password updated! Redirecting...");
    setTimeout(() => router.push("/login"), 2000);
  };

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="card">
          <div className="auth-header">
            <div className="auth-logo">🔑</div>
            <h1>New Password</h1>
            <p>Choose a strong password for your account</p>
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
                disabled={loading}
              >
                {loading ? "Updating..." : "🔐 Set New Password"}
              </button>
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
