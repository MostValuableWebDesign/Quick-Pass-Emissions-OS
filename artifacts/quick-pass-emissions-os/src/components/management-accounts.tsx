"use client";

import type { Role } from "@prisma/client";
import { ActionForm, Field } from "@/components/action-form";
import {
  createManagerAccount,
  issueManagerAccountInvite,
  setManagerAccountActive,
} from "@/app/actions";

type ManagementAccount = {
  user: {
    id: string;
    name: string;
    email: string;
    phone: string;
    role: Role;
    active: boolean;
    accounts: { id: string }[];
    employee: { phone: string } | null;
  };
};

function roleName(role: Role) {
  if (role === "OWNER") return "Owner";
  if (role === "ADMIN") return "Manager";
  return role === "BOOKKEEPER" ? "Bookkeeper" : "Employee";
}

export function ManagementAccounts({
  accounts,
  currentUserId,
}: {
  accounts: ManagementAccount[];
  currentUserId: string;
}) {
  return (
    <>
      <details className="card dealership-add-card space-top">
        <summary className="button button-primary dealership-add-toggle">
          <span>Add user</span>
        </summary>
        <div className="card-body">
          <p className="muted">
            Add an owner or manager sign-in. The new user will receive no password in this app;
            copy their private invitation link and share it directly. The link expires in 48 hours.
            Employees without sign-in are managed separately on the Employees page.
          </p>
          <ActionForm action={createManagerAccount} submit="Add user">
            <Field label="Full name">
              <input name="name" autoComplete="name" required maxLength={160} />
            </Field>
            <Field label="Account email">
              <input name="email" type="email" autoComplete="email" required maxLength={254} />
            </Field>
            <Field label="Phone">
              <input name="phone" type="tel" autoComplete="tel" maxLength={50} />
            </Field>
            <Field label="Sign-in role">
              <select name="role" defaultValue="ADMIN" required>
                <option value="ADMIN">Manager — business access, not owner-only approvals</option>
                <option value="OWNER">Owner — full owner privileges</option>
              </select>
            </Field>
          </ActionForm>
        </div>
      </details>

      <section className="card space-top">
        <div className="card-heading">
          <div>
            <h2>Owner and manager accounts</h2>
            <p className="muted">Deactivation revokes sign-in and keeps business history.</p>
          </div>
        </div>
        {!accounts.length ? (
          <p className="card-body muted">No owner or manager accounts were found.</p>
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th scope="col">Name</th>
                  <th scope="col">Email</th>
                  <th scope="col">Phone</th>
                  <th scope="col">Role</th>
                  <th scope="col">Status</th>
                  <th scope="col">Access</th>
                </tr>
              </thead>
              <tbody>
                {accounts.map((account) => {
                  const own = account.user.id === currentUserId;
                  return (
                    <tr key={account.user.id}>
                      <td>
                        <strong>{account.user.name}</strong>
                        {own && <small className="account-self-label">Your account</small>}
                      </td>
                      <td><a href={`mailto:${account.user.email}`}>{account.user.email}</a></td>
                      <td>
                        {account.user.phone || account.user.employee?.phone
                          ? <a href={`tel:${account.user.phone || account.user.employee?.phone}`}>{account.user.phone || account.user.employee?.phone}</a>
                          : "—"}
                      </td>
                      <td>{roleName(account.user.role)}</td>
                      <td>{account.user.active ? "Active" : "Inactive"}</td>
                      <td>
                        <div className="account-row-actions">
                          {own ? (
                            <span className="muted">Protected</span>
                          ) : account.user.active ? (
                            <>
                              {!account.user.accounts.length && (
                                <ActionForm action={issueManagerAccountInvite} submit="Create invitation" className="inline-form">
                                  <input type="hidden" name="id" value={account.user.id} />
                                </ActionForm>
                              )}
                              <ActionForm action={setManagerAccountActive} submit="Deactivate" className="inline-form">
                                <input type="hidden" name="id" value={account.user.id} />
                                <input type="hidden" name="active" value="false" />
                              </ActionForm>
                            </>
                          ) : (
                            <ActionForm action={setManagerAccountActive} submit="Reactivate" className="inline-form">
                              <input type="hidden" name="id" value={account.user.id} />
                              <input type="hidden" name="active" value="true" />
                            </ActionForm>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
