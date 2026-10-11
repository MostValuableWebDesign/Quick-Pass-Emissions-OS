import type { Metadata } from "next";
import { ArrowRight, LockKeyhole } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LoginBrand } from "@/components/login-brand";
import "./login.css";
import "./login-brand.css";
// Native form POSTs need their real same-origin identity. Keep external referrers
// private and leave the global no-referrer policy on authenticated pages.
export const metadata: Metadata = { referrer: "same-origin" };
export default async function Login({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error: errorCode } = await searchParams;
  const error =
    errorCode === "rate_limit"
      ? "Too many sign-in attempts. Wait a minute before trying again."
      : errorCode === "security"
        ? "Sign-in was blocked by browser security validation. Reload the preview and try again."
        : errorCode === "unavailable"
          ? "Cannot connect. Please try again."
          : errorCode
            ? "Unable to sign in. Check your credentials or try again later."
            : "";
  return (
    <div className="login-page login-professional">
      <LoginBrand />
      <section className="login-panel" aria-labelledby="sign-in-heading">
        <form className="login-form" method="post" action="/api/sign-in">
          <p className="login-access-label">
            <LockKeyhole size={14} aria-hidden="true" /> MANAGEMENT WORKSPACE
          </p>
          <h2 id="sign-in-heading">Sign in.</h2>
          <p className="muted">Welcome back to Quick Pass Emissions.</p>
          <label className="field">
            <span>Email address</span>
            <input
              name="email"
              type="email"
              autoComplete="username"
              placeholder="name@company.com"
              spellCheck={false}
              autoCapitalize="none"
              required
            />
          </label>
          <label className="field">
            <span>Password</span>
            <input
              name="password"
              type="password"
              autoComplete="current-password"
              placeholder="Enter your password"
              minLength={12}
              maxLength={128}
              required
            />
          </label>
          {error && (
            <p role="alert" className="error-text">
              {error}
            </p>
          )}
          <Button type="submit">
            Sign in
            <ArrowRight size={17} aria-hidden="true" />
          </Button>
          <p className="login-help">
            For owners and management only.
            <br />
            Need access? Contact your account owner.
          </p>
        </form>
      </section>
    </div>
  );
}
