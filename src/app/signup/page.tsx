import Link from "next/link";
import AuthForm from "@/components/AuthForm";

export const metadata = {
  title: "Sign Up — PVT",
  description:
    "Create your PVT account with end-to-end encryption key generation.",
};

export default function SignupPage() {
  return (
    <div className="auth-layout">
      <div className="auth-card">
        <div className="card">
          <div className="auth-header">
            <div className="auth-logo">🔐</div>
            <h1>Create Account</h1>
            <p>
              Your encryption keys are generated locally and never leave your
              device.
            </p>
          </div>
          <AuthForm mode="signup" />
          <div className="auth-footer">
            Already have an account?{" "}
            <Link href="/login">Sign in →</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
