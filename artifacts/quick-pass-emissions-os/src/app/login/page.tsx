"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { createAuthClient } from "better-auth/react";
import { CheckCheck, ArrowRight, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
const auth = createAuthClient();
export default function Login() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
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
        <form
          className="login-form"
          method="post"
          onSubmit={async (e) => {
            e.preventDefault();
            setPending(true);
            setError("");
            const data = new FormData(e.currentTarget);
            try {
              const result = await auth.signIn.email({
                email: String(data.get("email")),
                password: String(data.get("password")),
              });
              if (result.error)
                setError("Unable to sign in. Check your credentials or try again later.");
              else {
                router.push("/dashboard");
                router.refresh();
              }
            } catch {
              setError("Cannot connect. Please try again.");
            } finally {
              setPending(false);
            }
          }}
        >
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
            <input name="password" type="password" autoComplete="current-password" required />
          </label>
          {error && (
            <p role="alert" className="error-text">
              {error}
            </p>
          )}
          <Button disabled={pending}>
            {pending ? "Signing in…" : "Sign in"}
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
