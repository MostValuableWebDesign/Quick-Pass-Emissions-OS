import { ArrowRight, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LoginBrand } from "@/components/login-brand";
import "./login.css";
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
    <div className="login-page login-redesign">
      <LoginBrand />
      <section className="login-panel">
        <form className="login-form" method="post" action="/api/sign-in">
          <span className="login-symbol">
            <ShieldCheck size={27} />
          </span>
          <h2>Welcome back.</h2>
          <p className="muted">Owner and management sign-in.</p>
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
            Restricted to owners and management. Staff records do not provide login access.
          </p>
        </form>
      </section>
    </div>
  );
}
