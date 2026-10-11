import type { Metadata } from "next";
import { manager } from "@/lib/access";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/shared";
import { ActionForm, Field } from "@/components/action-form";
import { saveOwnAccount } from "@/app/actions";
import { ThemeSetting } from "@/components/theme-setting";
import { ManagementAccounts } from "@/components/management-accounts";

export const metadata: Metadata = { title: "Account | Quick Pass" };

const errors: Record<string, string> = {
  validation: "Use 12–128 characters for each password and make sure the new passwords match.",
  current: "Your current password was not accepted. Your password has not changed.",
  rate_limit: "Too many attempts. Wait a minute before trying again.",
  security: "This request was blocked. Reload the page and sign in again if needed.",
  unavailable:
    "The change could not be completed. Try signing in with your new password before retrying; contact your manager if you cannot sign in.",
};

function accessName(role: string) {
  if (role === "OWNER") return "Owner";
  if (role === "ADMIN") return "Manager";
  if (role === "BOOKKEEPER") return "Bookkeeper · no sign-in";
  return "Employee · no sign-in";
}

export default async function AccountPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; changed?: string }>;
}) {
  const actor = await manager();
  const params = await searchParams;
  const accounts = actor.role === "OWNER"
    ? await db.user.findMany({
        where: { role: { in: ["OWNER", "ADMIN"] } },
        include: {
          employee: { select: { phone: true } },
          accounts: { where: { providerId: "credential" }, select: { id: true } },
        },
        orderBy: { name: "asc" },
      })
    : [];

  return (
    <>
      <PageHeader
        title="Account"
        description="Your profile, sign-in security, appearance, and user access."
      />

      <section className="settings-group">
        <div className="settings-group-heading">
          <div>
            <h2>Your account</h2>
            <p className="muted">Your sign-in details and role in Quick Pass.</p>
          </div>
        </div>
        <div className="two-columns settings-card-grid">
          <section className="card card-body">
            <h2>Profile</h2>
            <ActionForm action={saveOwnAccount}>
              <Field label="Name">
                <input name="name" autoComplete="name" required maxLength={160} defaultValue={actor.name} />
              </Field>
              <Field label="Email">
                <input type="email" autoComplete="username" readOnly value={actor.email} />
              </Field>
              <Field label="Phone">
                <input
                  name="phone"
                  type="tel"
                  autoComplete="tel"
                  maxLength={50}
                  defaultValue={actor.phone || actor.employee?.phone || ""}
                />
              </Field>
              <Field label="Role">
                <input readOnly value={accessName(actor.role)} />
              </Field>
            </ActionForm>
          </section>
          <ThemeSetting />
        </div>
      </section>

      <section className="settings-group space-top">
        <div className="settings-group-heading">
          <div>
            <h2>Account security</h2>
            <p className="muted">Change your own password using your current password.</p>
          </div>
        </div>
        <section className="card card-body" style={{ maxWidth: 720 }}>
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
            <button className="button button-primary" type="submit">Change password</button>
            <p className="muted">
              Forgot your current password? Contact your manager for verified account recovery.
            </p>
          </form>
        </section>
      </section>

      {actor.role === "OWNER" && (
        <section className="settings-group space-top">
          <div className="settings-group-heading">
            <div>
              <h2>User access</h2>
              <p className="muted">Owner-only account creation and access controls.</p>
            </div>
          </div>
          <ManagementAccounts accounts={accounts.map((user) => ({ user }))} currentUserId={actor.id} />
        </section>
      )}
    </>
  );
}
