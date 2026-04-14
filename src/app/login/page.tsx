import Link from "next/link";
import AuthForm from "@/components/AuthForm";

export const metadata = {
  title: "Login — PVT",
  description: "Sign in to your PVT encrypted messaging account.",
};

export default function LoginPage() {
  return (
    <div className="auth-layout">
      <div className="auth-card">
        <div className="card">
          <div className="auth-header">
            <div className="auth-logo">🔐</div>
            <h1>Welcome Back</h1>
            <p>Sign in to your encrypted conversations</p>
          </div>
          <AuthForm mode="login" />
          <div className="auth-footer">
            Don&apos;t have an account?{" "}
            <Link href="/signup">Sign up →</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
