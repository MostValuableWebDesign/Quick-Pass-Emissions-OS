import { CheckCheck, ArrowRight, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
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
    <div className="login-page">
      <section className="login-brand">
        <div className="brand">
          <span className="brand-icon">
            <CheckCheck />
          </span>
          <span>
            QUICK PASS<small>BUSINESS OS</small>
          </span>
        </div>
        <div>
          <p className="eyebrow">LESS GUESSWORK. MORE OVERSIGHT.</p>
          <h1>
            A better day
            <br />
            starts with
            <br />
            <em>a clear plan.</em>
          </h1>
          <p>
            Your team, daily responsibilities, and operations.
            <br />
            Together in one workspace.
          </p>
        </div>
        <p>EMISSIONS · TAG RENEWAL · CARWASH</p>
      </section>
      <section className="login-panel">
        <form className="login-form" method="post" action="/api/sign-in">
          <span className="login-symbol">
            <ShieldCheck size={27} />
          </span>
          <h2>Welcome back.</h2>
          <p className="muted">Sign in to your Quick Pass workspace.</p>
          <label className="field">
            <span>Email address</span>
            <input name="email" type="email" autoComplete="username" required />
          </label>
          <label className="field">
            <span>Password</span>
            <input
              name="password"
              type="password"
              autoComplete="current-password"
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
            <ArrowRight size={17} />
          </Button>
          <p className="login-help">
            Invite-only access. Contact your manager for an account or help signing in.
          </p>
        </form>
      </section>
    </div>
  );
}
