import type { Metadata } from "next";
import { currentUser } from "@/lib/access";
import { PageHeader } from "@/components/shared";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "Account & password | Quick Pass" };

const errors: Record<string, string> = {
  validation: "Use 12–128 characters for each password and make sure the new passwords match.",
  current: "Your current password was not accepted. Your password has not changed.",
  rate_limit: "Too many attempts. Wait a minute before trying again.",
  security: "This request was blocked. Reload the page and sign in again if needed.",
  unavailable:
    "The change could not be completed. Try signing in with your new password before retrying; contact your manager if you cannot sign in.",
};

export default async function PasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; changed?: string }>;
}) {
  await currentUser();
  const params = await searchParams;
  return (
    <>
      <PageHeader
        title="Account & password"
        description="Change your own password using your current password."
      />
      <section className="card card-body" style={{ maxWidth: 600 }}>
        <form
          method="post"
          action="/api/auth/change-own-password"
          className="form-grid"
          style={{ gridTemplateColumns: "minmax(0, 1fr)" }}
        >
          <p className="muted">
            Use a unique password of 12–128 characters. After a successful change, this session is
            replaced and all other sessions are signed out.
          </p>
          {params.changed === "1" && !params.error && (
            <p role="status">Password changed. All other sessions have been signed out.</p>
          )}
          {params.error && (
            <p role="alert" className="error-text">
              {errors[params.error] ?? "The password change was not accepted."}
            </p>
          )}
          <label className="field">
            <span>Current password</span>
            <input
              type="password"
              name="currentPassword"
              autoComplete="current-password"
              minLength={12}
              maxLength={128}
              required
            />
          </label>
          <label className="field">
            <span>New password</span>
            <input
              type="password"
              name="newPassword"
              autoComplete="new-password"
              minLength={12}
              maxLength={128}
              required
            />
          </label>
          <label className="field">
            <span>Confirm new password</span>
            <input
              type="password"
              name="confirmPassword"
              autoComplete="new-password"
              minLength={12}
              maxLength={128}
              required
            />
          </label>
          <Button type="submit">Change password</Button>
          <p className="muted">
            Forgot your current password? Contact your manager for verified account recovery.
          </p>
        </form>
      </section>
    </>
  );
}
