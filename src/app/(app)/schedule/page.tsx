import Link from "next/link";
import { currentUser } from "@/lib/access";
import { db } from "@/lib/db";
import { isManager } from "@/lib/policy";
import { businessDate, addDays } from "@/lib/time";
import { dateString } from "@/lib/validation";
import { PageHeader } from "@/components/shared";
import { ActionForm, Field } from "@/components/action-form";
import { removeShift, saveShift } from "@/app/actions";
export default async function Schedule({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const actor = await currentUser();
  const management = isManager(actor.role);
  const raw = (await searchParams).date;
  const from = dateString.safeParse(raw).success ? raw! : businessDate();
  const dates = Array.from({ length: 7 }, (_, i) => addDays(from, i));
  const [shifts, employees] = await Promise.all([
    db.employeeSchedule.findMany({
      where: {
        date: { gte: from, lte: dates[6] },
        ...(management
          ? {}
          : { employeeId: actor.role === "EMPLOYEE" ? (actor.employee?.id ?? "none") : "none" }),
      },
      include: { employee: { select: { user: { select: { name: true, active: true } } } } },
      orderBy: { startTime: "asc" },
    }),
    management
      ? db.employee.findMany({
          where: { user: { active: true } },
          select: { id: true, user: { select: { name: true } } },
        })
      : [],
  ]);
  return (
    <>
      <PageHeader
        title="A clear plan for the week"
        description="Recorded shifts and assigned duties · America/New_York"
      >
        {management && (
          <Link className="button button-outline" href="/tasks/templates">
            Recurring duties →
          </Link>
        )}
      </PageHeader>
      <div className="week-nav">
        <Link href={`/schedule?date=${addDays(from, -7)}`}>← Previous week</Link>
        <strong>
          {from} — {dates[6]}
        </strong>
        <Link href={`/schedule?date=${addDays(from, 7)}`}>Next week →</Link>
      </div>
      <div className="week-grid">
        {dates.map((date) => (
          <section className="day-card" key={date}>
            <h2>
              {new Intl.DateTimeFormat("en-US", {
                weekday: "short",
                day: "numeric",
                month: "short",
                timeZone: "UTC",
              }).format(new Date(date))}
            </h2>
            {shifts
              .filter((s) => s.date === date)
              .map((s) => (
                <div className="shift" key={s.id}>
                  <strong>
                    {s.employee.user.name}
                    {!s.employee.user.active && " · inactive"}
                  </strong>
                  <p>
                    {s.startTime}–{s.endTime}
                  </p>
                  <small>{s.duties || "No duties specified"}</small>
                  {management && (
                    <ActionForm action={removeShift} submit="Remove" className="inline-form">
                      <input type="hidden" name="id" value={s.id} />
                    </ActionForm>
                  )}
                </div>
              ))}
            {!shifts.some((s) => s.date === date) && <p className="muted">No shifts</p>}
          </section>
        ))}
      </div>
      {management && (
        <section className="card card-body space-top">
          <h2>Add or update a shift</h2>
          <p className="muted">
            One shift per employee per date. Saving replaces that date’s recorded shift.
          </p>
          <ActionForm action={saveShift} submit="Save shift">
            <Field label="Employee">
              <select name="employeeId" required>
                {employees.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.user.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Date">
              <input name="date" type="date" defaultValue={from} required />
            </Field>
            <Field label="Start · Eastern">
              <input name="startTime" type="time" required />
            </Field>
            <Field label="End · Eastern">
              <input name="endTime" type="time" required />
            </Field>
            <Field label="Assigned duties" wide>
              <textarea name="duties" maxLength={2000} />
            </Field>
          </ActionForm>
        </section>
      )}
    </>
  );
}
