import type { Metadata } from "next";
import Link from "next/link";
import { KeyRound, ShieldCheck } from "lucide-react";
import { manager } from "@/lib/access";
import { formatDate } from "@/lib/time";
import { PageHeader, Empty } from "@/components/shared";
import { ActionForm } from "@/components/action-form";
import { DoorCodeForm, RevokeDoorCode } from "@/components/door-code-form";
import { registerDoorAction, refreshDoorAction } from "@/app/door-actions";
import { doorOverview } from "@/modules/security/service";
export const metadata: Metadata = { title: "Door access" };
const statuses: Record<string, string> = {
  PENDING: "Pending confirmation",
  ACTIVE: "Active · provider-confirmed",
  SCHEDULED: "Scheduled · provider-confirmed",
  REMOVING: "Removal pending",
  REVOKED: "Removed · provider-confirmed",
  CANCELLED: "Cancelled before submission",
  REVIEW: "Needs review",
};
function Pages({
  page,
  total,
  historyPage,
  history = false,
}: {
  page: number;
  total: number;
  historyPage: number;
  history?: boolean;
}) {
  const count = Math.max(1, Math.ceil(total / 15)),
    current = history ? historyPage : page;
  const href = (n: number) =>
    `/security/doors?page=${history ? page : n}&historyPage=${history ? n : historyPage}`;
  return (
    <nav className="pagination" aria-label={history ? "Access history pages" : "Access code pages"}>
      {current > 1 ? (
        <Link className="button button-outline" href={href(current - 1)}>
          Previous
        </Link>
      ) : null}
      <span>
        Page {current} of {count} · {total} items
      </span>
      {current < count ? (
        <Link className="button button-outline" href={href(current + 1)}>
          Next
        </Link>
      ) : null}
    </nav>
  );
}
export default async function DoorAccessPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; historyPage?: string }>;
}) {
  const actor = await manager(),
    q = await searchParams;
  const number = (v: string | undefined) =>
    Math.max(1, Math.min(100000, Math.floor(Number(v)) || 1));
  const page = number(q.page),
    historyPage = number(q.historyPage);
  const data = await doorOverview(actor.id, page, historyPage);
  return (
    <>
      <PageHeader
        eyebrow="QUICK PASS SECURITY"
        title="Door access"
        description="Manage Schlage Encode keypad access for your business."
      >
        <KeyRound size={24} />
      </PageHeader>
      {!data.configured ? (
        <section className="card">
          <div className="card-heading">
            <h2>Connection setup needed</h2>
            <span className="badge neutral">Not connected</span>
          </div>
          <div className="card-body">
            <p>
              The selected lock is the Schlage Encode BE489WB. Connect it to Wi-Fi and Schlage Home,
              then complete the secure Seam connection setup.
            </p>
            <p className="muted">
              An owner must configure the server connection before registering doors or issuing
              codes. Existing physical codes are unchanged.
            </p>
            <a
              className="button button-outline"
              href="https://console.seam.co/"
              target="_blank"
              rel="noopener noreferrer"
            >
              Open Seam console
            </a>
          </div>
        </section>
      ) : null}
      <div className="two-columns">
        <section className="card">
          <div className="card-heading">
            <h2>Business doors</h2>
            <ShieldCheck size={20} />
          </div>
          <div className="card-body">
            {!data.doors.length ? (
              <Empty
                title="No doors registered"
                text="An owner can register each connected door after setup."
              />
            ) : (
              data.doors.map((d) => (
                <div key={d.id} className="card-body">
                  <h3>{d.name}</h3>
                  <p>
                    {d.online === null
                      ? "Connection unknown"
                      : d.online
                        ? "Online at last check"
                        : "Offline at last check"}{" "}
                    ·{" "}
                    {d.locked === null
                      ? "Lock state unknown"
                      : d.locked
                        ? "Locked at last check"
                        : "Unlocked at last check"}
                    {d.batteryPercent !== null ? ` · Battery ${d.batteryPercent}%` : ""}
                  </p>
                  <p className="muted">
                    {d.checkedAt
                      ? `Last checked ${formatDate(d.checkedAt)} Eastern`
                      : "Not checked yet"}
                  </p>
                  {d.failure ? (
                    <p role="status" className="error-text">
                      {d.failure}
                    </p>
                  ) : null}
                  {data.configured ? (
                    <ActionForm action={refreshDoorAction} submit="Refresh status">
                      <input type="hidden" name="id" value={d.id} />
                    </ActionForm>
                  ) : null}
                </div>
              ))
            )}
            <p className="muted">
              Status reflects the last provider check. Refreshes share a 15-second cooldown; code
              checks run at most once per minute. Pending removals need a successful status check;
              check the physical lock when urgent.
            </p>
          </div>
        </section>
        {data.role === "OWNER" ? (
          <section className="card">
            <div className="card-heading">
              <h2>Register a door</h2>
            </div>
            <div className="card-body">
              <p>
                Connect your Schlage Home account in Seam, then copy this door’s device ID. Only the
                configured account and supported lock model are accepted.
              </p>
              {data.configured ? (
                <ActionForm action={registerDoorAction} submit="Verify and register door">
                  <label>
                    Door name
                    <input name="name" required maxLength={80} placeholder="Front door" />
                  </label>
                  <label>
                    Seam device ID
                    <input name="deviceId" required autoComplete="off" />
                  </label>
                </ActionForm>
              ) : (
                <p className="muted">Registration becomes available after connection setup.</p>
              )}
            </div>
          </section>
        ) : null}
      </div>
      {data.configured && data.doors.length ? (
        <section className="card">
          <div className="card-heading">
            <h2>Issue or change a code</h2>
          </div>
          <div className="card-body">
            <DoorCodeForm
              doors={data.doors}
              staff={data.staff.map((e) => ({ id: e.id, name: e.user.name }))}
              changes={data.codes
                .filter(
                  (c) =>
                    c.status === "ACTIVE" &&
                    c.desiredState === "ACTIVE" &&
                    c.employeeId &&
                    !c.replacement &&
                    (data.role === "OWNER" || c.employee?.user.role === "EMPLOYEE"),
                )
                .map((c) => ({
                  doorId: c.doorId,
                  id: c.id,
                  label: c.label,
                  employeeId: c.employeeId!,
                  version: c.version,
                }))}
            />
          </div>
        </section>
      ) : null}
      <section className="card">
        <div className="card-heading">
          <h2>Access codes</h2>
        </div>
        {!data.codes.length ? (
          <Empty
            title="No access requests yet"
            text="Staff and temporary access will appear here with confirmation status."
          />
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Access</th>
                  <th>Door</th>
                  <th>Window · Eastern</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {data.codes.map((c) => (
                  <tr key={c.id}>
                    <td>
                      <strong>{c.label}</strong>
                      <small>{c.employee?.user.name || "Temporary access"}</small>
                    </td>
                    <td>{c.door.name}</td>
                    <td>
                      {c.startsAt && c.endsAt
                        ? `${formatDate(c.startsAt)} – ${formatDate(c.endsAt)}`
                        : "Continuous staff access"}
                    </td>
                    <td>
                      <span
                        className={`badge ${c.status === "ACTIVE" ? "green" : c.status === "REVIEW" ? "danger" : "neutral"}`}
                      >
                        {statuses[c.status] || "Unknown"}
                      </span>
                      {c.failure ? <small>{c.failure}</small> : null}
                    </td>
                    <td>
                      {!["REVOKED", "CANCELLED"].includes(c.status) &&
                      (c.desiredState === "ACTIVE" || c.status === "REVIEW") &&
                      (data.role === "OWNER" ||
                        !c.employee ||
                        c.employee.user.role === "EMPLOYEE") ? (
                        <RevokeDoorCode id={c.id} version={c.version} label={c.label} />
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Pages page={page} historyPage={historyPage} total={data.total} />
      </section>
      <section className="card">
        <div className="card-heading">
          <h2>Access change history</h2>
        </div>
        {!data.events.length ? (
          <Empty
            title="No access changes"
            text="Requests and provider confirmations are recorded here."
          />
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>When · Eastern</th>
                  <th>By</th>
                  <th>Event</th>
                  <th>Reference</th>
                </tr>
              </thead>
              <tbody>
                {data.events.map((e) => (
                  <tr key={e.id}>
                    <td>{formatDate(e.createdAt)}</td>
                    <td>{e.actor?.name || "System"}</td>
                    <td>
                      {e.action
                        .replace(/^DOOR_/, "")
                        .toLowerCase()
                        .replaceAll("_", " ")}
                    </td>
                    <td>{e.entityId}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Pages page={page} historyPage={historyPage} total={data.eventTotal} history />
      </section>
    </>
  );
}
