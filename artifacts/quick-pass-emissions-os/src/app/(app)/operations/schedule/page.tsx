import Link from "next/link";
import { currentUser } from "@/lib/access";
import { addDays, formatDate } from "@/lib/time";
import { ensureOperationsSchedule, managerOverview } from "@/modules/manager/service";
import {
  availabilityInput,
  operationsScheduleInput,
  operationsScheduleExceptions,
  type Plan,
} from "@/modules/manager/rules";
import { operationsDutyChecklists, weeklyStructure } from "@/modules/manager/starter";
import { managerAction } from "@/app/manager-actions";
import { ActionForm, Field } from "@/components/action-form";
import { PageHeader } from "@/components/shared";
import { WorkspaceTabs, Command } from "@/components/manager-workspace";
import "../workspace.css";
export default async function MySchedule() {
  const actor = await currentUser();
  const recurringSchedule = await ensureOperationsSchedule(actor.id);
  const proposed = operationsScheduleInput.parse(recurringSchedule.payload);
  const data = await managerOverview(actor.id);
  const availability = data.availability ? availabilityInput.parse(data.availability) : null;
  const exceptions = operationsScheduleExceptions(
    proposed,
    recurringSchedule.startDate,
    availability,
    data.commitments,
  );
  const plan = data.schedules.find((row) =>
      Array.isArray((row.payload as unknown as { slots?: unknown } | null)?.slots),
    ),
    payload = plan?.payload as Plan | undefined;
  const weekdays = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
  const scheduleStatus = recurringSchedule.status === "DRAFT" ? "Proposed" : "Approved";
  const displayDay = (date: string) =>
    new Intl.DateTimeFormat("en-US", {
      timeZone: "UTC",
      month: "short",
      day: "numeric",
      year: "numeric",
    }).format(new Date(`${date}T12:00:00Z`));
  return (
    <>
      <PageHeader
        title="My weekly schedule"
        description={`Week of ${displayDay(recurringSchedule.startDate)} · ${scheduleStatus}`}
      />
      <WorkspaceTabs active="schedule" />
      <div className="manager-schedule-intro">
        <div>
          <strong>Weekly work plan</strong>
          <p>
            Recurring duties are grouped by day. Open a checklist when you need the task details.
          </p>
        </div>
        <span className={`manager-schedule-status ${recurringSchedule.status.toLowerCase()}`}>
          {scheduleStatus}
        </span>
        <p className="manager-schedule-note">
          This is a management plan, not a payroll timesheet. Open time remains available for
          customer needs, repairs and interruptions.
        </p>
      </div>
      {exceptions.map((exception) => (
        <p className="notice warning" key={exception}>
          {exception}
        </p>
      ))}
      <div
        className="manager-week manager-recurring-week"
        aria-label="Proposed weekly operations schedule"
      >
        {weekdays.map((day, index) => {
          const blocks = proposed.blocks
            .filter((block) => block.weekdays.includes(index + 1))
            .sort((a, b) => a.start.localeCompare(b.start));
          return (
            <section className="manager-day-card" key={day}>
              <header className="manager-day-header">
                <div>
                  <h2>{day}</h2>
                  <p className="muted">{displayDay(addDays(recurringSchedule.startDate, index))}</p>
                </div>
                <span className="manager-day-count">
                  {blocks.length
                    ? `${blocks.length} ${blocks.length === 1 ? "block" : "blocks"}`
                    : "No work planned"}
                </span>
              </header>
              {blocks.map((block) => (
                <article className="manager-schedule-slot manager-week-block" key={block.id}>
                  <div className="manager-week-block-time">
                    <strong>{block.start}</strong>
                    <span>to</span>
                    <strong>{block.end}</strong>
                  </div>
                  <h3>{block.title}</h3>
                  <p className="muted">{block.description}</p>
                  <details>
                    <summary>View checklist</summary>
                    <ul>
                      {(operationsDutyChecklists[block.id] ?? [block.description]).map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  </details>
                </article>
              ))}
              {!blocks.length && (
                <p className="manager-day-empty">No manager work scheduled for this day.</p>
              )}
            </section>
          );
        })}
      </div>
      <details className="card card-body manager-schedule-settings">
        <summary>Schedule settings · adjust recurring times</summary>
        <p>
          Changes apply to every listed weekday and carry forward into later weekly proposals.
          Overlapping work blocks are rejected. Inventory orders, bank trips, service calls and
          confirmed Chamber events can be added as <Link href="/operations">additional tasks</Link>{" "}
          when needed; this schedule initiates no purchases, payments or messages.
        </p>
        {recurringSchedule.status === "DRAFT" ? (
          <div className="two-columns">
            {proposed.blocks.map((block) => (
              <section className="card card-body" key={block.id}>
                <h3>{block.title}</h3>
                <p className="muted">
                  {block.weekdays.map((weekday) => weekdays[weekday - 1]).join(", ")}
                </p>
                <ActionForm action={managerAction} submit="Save time">
                  <Command name="EDIT_OPERATIONS_SCHEDULE_BLOCK" />
                  <input type="hidden" name="scheduleId" value={recurringSchedule.id} />
                  <input type="hidden" name="revision" value={proposed.revision} />
                  <input type="hidden" name="blockId" value={block.id} />
                  <Field label="Start">
                    <input type="time" name="start" defaultValue={block.start} required />
                  </Field>
                  <Field label="End">
                    <input type="time" name="end" defaultValue={block.end} required />
                  </Field>
                </ActionForm>
              </section>
            ))}
          </div>
        ) : (
          <ActionForm action={managerAction} submit="Create a revised proposal">
            <Command name="REVISE_OPERATIONS_SCHEDULE" />
            <input type="hidden" name="scheduleId" value={recurringSchedule.id} />
          </ActionForm>
        )}
      </details>
      {recurringSchedule.status === "APPROVED" && (
        <Link className="button button-outline" href="/tasks/templates">
          View recurring duties
        </Link>
      )}
      {recurringSchedule.status === "DRAFT" && (
        <section className="card card-body">
          <h2>Approve the proposal</h2>
          <p>
            Approval creates recurring duties with checklists and deadlines. It replaces unmodified
            starter duties and cancels only their unused upcoming occurrences. Completed,
            in-progress, customized and individually created work is preserved. Proposed edits do
            not change active duties until approved.
          </p>
          {!data.actor.employee && (
            <p>
              Approval also creates your management responsibility profile for task assignment,
              without setting pay rates or changing account access. This profile appears in
              Employees and may appear as unconfigured in payroll setup.
            </p>
          )}
          <ActionForm action={managerAction} submit="Approve schedule & create recurring duties">
            <Command name="APPROVE_OPERATIONS_SCHEDULE" />
            <input type="hidden" name="scheduleId" value={recurringSchedule.id} />
            <input type="hidden" name="revision" value={proposed.revision} />
          </ActionForm>
        </section>
      )}
      <details className="card card-body">
        <summary>Optional availability-aware task planner</summary>
        <p className="muted">
          This separate tool places assigned task records around personal availability and fixed
          commitments. It is not required to use the proposed weekly work blocks above.
        </p>
        {!data.actor.employee && (
          <div className="notice warning">
            Missing responsibility profile: work cannot be assigned to your personal schedule.
            Create your management responsibility profile before approving a plan. No pay rates or
            account-access changes are made.
            <ActionForm action={managerAction} submit="Create my responsibility profile">
              <Command name="PROFILE" />
            </ActionForm>
          </div>
        )}
        <div className="notice">
          {availability?.days.length
            ? "Configured personal availability. Plans reserve your selected interruption capacity."
            : "Draft — personal availability has not been configured. Business hours are not assumed to be your working hours."}{" "}
          Staffing shifts remain in <Link href="/schedule">Staff schedule</Link>. No browser timer
          or new scheduling service is used.
        </div>
        <section className="card card-body">
          <h2>Availability, working days & breaks</h2>
          <p className="muted">
            Enable only your working days. Enter breaks as 12:00-12:30,15:00-15:15. Suggested input
            times are editable; disabled days are excluded.
          </p>
          <ActionForm action={managerAction} submit="Save my availability">
            <Command name="AVAILABILITY" />
            <input name="version" type="hidden" value={availability?.version ?? 0} />
            <div className="table-scroll wide">
              <table className="manager-availability">
                <thead>
                  <tr>
                    <th>Working day</th>
                    <th>Start</th>
                    <th>End</th>
                    <th>Breaks · Eastern</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    "Monday",
                    "Tuesday",
                    "Wednesday",
                    "Thursday",
                    "Friday",
                    "Saturday",
                    "Sunday",
                  ].map((label, i) => {
                    const day = availability?.days.find((d) => d.weekday === i + 1);
                    return (
                      <tr key={label}>
                        <td>
                          <label className="checkbox">
                            <input name={`day${i + 1}`} type="checkbox" defaultChecked={!!day} />
                            {label}
                          </label>
                        </td>
                        <td>
                          <input
                            aria-label={`${label} start`}
                            name={`start${i + 1}`}
                            type="time"
                            defaultValue={day?.start ?? "09:00"}
                          />
                        </td>
                        <td>
                          <input
                            aria-label={`${label} end`}
                            name={`end${i + 1}`}
                            type="time"
                            defaultValue={day?.end ?? "17:00"}
                          />
                        </td>
                        <td>
                          <input
                            aria-label={`${label} breaks`}
                            name={`breaks${i + 1}`}
                            type="text"
                            maxLength={120}
                            defaultValue={
                              day?.breaks.map((b) => `${b.start}-${b.end}`).join(",") ?? ""
                            }
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <Field label="Reserve capacity for interruptions · %">
              <input
                type="number"
                name="reservePercent"
                required
                min={0}
                max={80}
                defaultValue={availability?.reservePercent ?? 20}
              />
            </Field>
          </ActionForm>
        </section>
        <section className="card card-body">
          <h2>Fixed commitments</h2>
          {data.commitments.map((c) => (
            <div className="manager-schedule-slot" key={c.id}>
              <strong>{c.title}</strong> · {c.date} {c.startTime}–{c.endTime}
              <ActionForm action={managerAction} submit="Cancel commitment" className="inline-form">
                <Command name="CANCEL_COMMITMENT" />
                <input type="hidden" name="id" value={c.id} />
              </ActionForm>
            </div>
          ))}
          <ActionForm action={managerAction} submit="Add fixed commitment">
            <Command name="COMMITMENT" />
            <Field label="Commitment title">
              <input name="title" required maxLength={160} />
            </Field>
            <Field label="Date">
              <input type="date" name="date" required defaultValue={data.today} />
            </Field>
            <Field label="Start · Eastern">
              <input type="time" name="startTime" required />
            </Field>
            <Field label="End · Eastern">
              <input type="time" name="endTime" required />
            </Field>
          </ActionForm>
        </section>
        <section className="card card-body">
          <h2>Preview a week</h2>
          <p>
            Only work assigned to you is placed on your schedule. Deadlines remain unchanged.
            Dependencies and their required reviews must be satisfied. Approved snapshots retain
            their original task versions; later changes require a new preview.
          </p>
          <ActionForm action={managerAction} submit="Generate schedule preview">
            <Command name="PREVIEW" />
            <Field label="Week starting">
              <input type="date" name="start" defaultValue={data.today} required />
            </Field>
          </ActionForm>
          {plan && payload && (
            <>
              <h3>
                {plan.status} · {plan.startDate}—{addDays(plan.startDate, 6)}
              </h3>
              <p>
                Created {formatDate(plan.createdAt)} Eastern
                {plan.approvedAt
                  ? ` · approved ${formatDate(plan.approvedAt)} Eastern`
                  : " · not approved"}
              </p>
              {payload.conflicts.map((c, i) => (
                <p className="notice warning" key={i}>
                  {c}
                </p>
              ))}
              <div className="manager-week">
                {Array.from({ length: 7 }, (_, i) => addDays(plan.startDate, i)).map((date) => (
                  <section key={date}>
                    <h3>{date}</h3>
                    {payload.commitments
                      .filter((c) => c.date === date)
                      .map((c) => (
                        <p key={c.id}>
                          Fixed: {c.startTime}–{c.endTime} {c.title}
                        </p>
                      ))}
                    {payload.slots
                      .filter((s) => s.date === date)
                      .map((s) => (
                        <p className="manager-schedule-slot" key={s.taskId}>
                          {s.start}–{s.end}
                          <br />
                          <Link href={`/tasks/${s.taskId}`}>{s.title}</Link>
                        </p>
                      ))}
                    {!payload.slots.some((s) => s.date === date) && (
                      <p className="muted">No tasks placed</p>
                    )}
                  </section>
                ))}
              </div>
              <h3>Unscheduled work · {payload.unscheduled.length}</h3>
              {payload.unscheduled.map((t) => (
                <p key={t.taskId}>
                  <Link href={`/tasks/${t.taskId}`}>{t.title}</Link> · {t.reason}
                </p>
              ))}
              {plan.status === "DRAFT" && (
                <ActionForm action={managerAction} submit="Approve this schedule">
                  <Command name="APPROVE_SCHEDULE" />
                  <input type="hidden" name="id" value={plan.id} />
                </ActionForm>
              )}
            </>
          )}
        </section>
        <details className="card card-body">
          <summary>Suggested weekly focus</summary>
          {weeklyStructure.map(([d, t]) => (
            <p key={d}>
              <strong>{d}</strong> · {t}
            </p>
          ))}
          <p>
            Use editable recurring duties in the overview. No licensing, inspection training,
            equipment training or kiosk training is created.
          </p>
        </details>
      </details>
    </>
  );
}
