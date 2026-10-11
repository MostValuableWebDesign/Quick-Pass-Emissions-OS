import { Temporal } from "@js-temporal/polyfill";
import type { ReminderEvent } from "@prisma/client";
import { RecordLink } from "@/components/record-link";
import { ActionForm, Field } from "@/components/action-form";
import { Empty, PageHeader } from "@/components/shared";
import { Badge, fmtInstant } from "@/components/phase5";
import {
  acknowledgePersonalReminderAction,
  acknowledgeReminderAction,
  cancelPersonalReminderAction,
  completePersonalReminderAction,
  createPersonalReminderAction,
  updatePersonalReminderAction,
} from "@/app/phase5-actions";
import { currentUser } from "@/lib/access";
import { TIMEZONE } from "@/lib/time";
import { listPersonalReminders } from "@/modules/automation/personal-reminders";
import { remindersForUser } from "@/modules/automation/service";

function localTime(value: Date) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: TIMEZONE,
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(value);
}

function localInputTime(value: Date) {
  return Temporal.Instant.from(value.toISOString())
    .toZonedDateTimeISO(TIMEZONE)
    .toPlainDateTime()
    .toString({ smallestUnit: "minute" });
}

function ReminderFields({ reminder }: { reminder?: ReminderEvent }) {
  return (
    <>
      {reminder && <input type="hidden" name="id" value={reminder.id} />}
      <Field label="Title">
        <input name="title" required maxLength={160} defaultValue={reminder?.title} />
      </Field>
      <Field label="Date and time (Eastern)">
        <input
          name="startsAt"
          type="datetime-local"
          step={60}
          required
          defaultValue={reminder ? localInputTime(reminder.startsAt) : undefined}
        />
      </Field>
      <Field label="Description">
        <textarea name="description" maxLength={2000} defaultValue={reminder?.description} rows={3} />
      </Field>
      <Field label="Location (optional)">
        <input name="location" maxLength={160} defaultValue={reminder?.location} />
      </Field>
      <Field label="Alert me">
        <select name="alertMinutes" defaultValue={reminder?.alertMinutes ?? 15}>
          <option value={0}>At event time</option>
          <option value={5}>5 minutes before</option>
          <option value={15}>15 minutes before</option>
          <option value={60}>1 hour before</option>
          <option value={1440}>1 day before</option>
        </select>
      </Field>
    </>
  );
}

function EventActions({ reminder, alertIsDue }: { reminder: ReminderEvent; alertIsDue: boolean }) {
  return (
    <div className="personal-reminder-actions">
      {alertIsDue && !reminder.readAt && (
        <ActionForm
          action={acknowledgePersonalReminderAction}
          submit="Mark read"
          className="inline-form"
        >
          <input type="hidden" name="id" value={reminder.id} />
        </ActionForm>
      )}
      <details className="personal-reminder-edit">
        <summary>Edit</summary>
        <ActionForm action={updatePersonalReminderAction} submit="Save changes">
          <ReminderFields reminder={reminder} />
        </ActionForm>
      </details>
      <ActionForm action={completePersonalReminderAction} submit="Complete" className="inline-form">
        <input type="hidden" name="id" value={reminder.id} />
      </ActionForm>
      <ActionForm action={cancelPersonalReminderAction} submit="Cancel reminder" className="inline-form">
        <input type="hidden" name="id" value={reminder.id} />
      </ActionForm>
    </div>
  );
}

export default async function Reminders() {
  const user = await currentUser();
  const [list, operational] = await Promise.all([
    listPersonalReminders(user.id),
    remindersForUser(user.id),
  ]);
  const now = new Date();
  return (
    <>
      <PageHeader
        title="Events & reminders"
        description="Schedule a personal event with an in-app alert. Times use Eastern Time."
      />
      <section className="card card-body">
        <h2>Add an event or reminder</h2>
        <ActionForm action={createPersonalReminderAction} submit="Save reminder">
          <ReminderFields />
        </ActionForm>
      </section>
      <section className="card">
        <div className="card-heading">
          <h2>Your events & reminders</h2>
          <span className="count">{list.upcoming.length}</span>
        </div>
        {list.upcoming.length === 0 ? (
          <Empty title="No scheduled reminders" text="Events you add will appear here." />
        ) : (
          list.upcoming.map((reminder) => {
            const alertIsDue = reminder.alertAt <= now;
            const isOverdue = reminder.startsAt < now;
            return (
              <article className="list-row personal-reminder-row" id={reminder.id} key={reminder.id}>
                <div className="personal-reminder-content">
                  <strong>{reminder.title}</strong>{" "}
                  {isOverdue ? (
                    <Badge tone="amber">Past due</Badge>
                  ) : reminder.readAt ? (
                    <Badge tone="green">Read</Badge>
                  ) : alertIsDue ? (
                    <Badge tone="danger">Alert active</Badge>
                  ) : (
                    <Badge tone="neutral">Scheduled</Badge>
                  )}
                  <small>
                    {localTime(reminder.startsAt)} ·{" "}
                    {reminder.alertMinutes === 0 ? "Alert at event time" : `${reminder.alertMinutes} min alert`}
                  </small>
                  {reminder.location && <small>Location: {reminder.location}</small>}
                  {reminder.description && <p className="preserve-lines">{reminder.description}</p>}
                </div>
                <EventActions reminder={reminder} alertIsDue={alertIsDue} />
              </article>
            );
          })
        )}
      </section>
      {list.completed.length > 0 && (
        <details className="card space-top">
          <summary className="card-heading">Completed reminders · {list.completed.length}</summary>
          {list.completed.map((reminder) => (
            <div className="list-row" key={reminder.id}>
              <div>
                <strong>{reminder.title}</strong>
                <small>{localTime(reminder.startsAt)}</small>
              </div>
              <Badge tone="green">Complete</Badge>
            </div>
          ))}
        </details>
      )}
      <section className="card space-top">
        <div className="card-heading">
          <h2>Operational reminders</h2>
          <span className="count">{operational.length}</span>
        </div>
        <p className="muted card-body reminder-explanation">
          These alerts come from the existing operations checks. Acknowledging an alert marks it as
          read; complete the linked work from its source record.
        </p>
        {operational.length === 0 ? (
          <Empty title="No operational reminders" text="There are no open operations alerts." />
        ) : (
          operational.map((reminder) => (
            <div className="list-row" key={reminder.id}>
              <div>
                <strong>{reminder.title}</strong>
                <small>Due {reminder.dueDate} · created {fmtInstant(reminder.createdAt)}</small>
                <RecordLink className="text-link" href={reminder.href}>
                  Open source record
                </RecordLink>
              </div>
              <div>
                <Badge
                  tone={
                    reminder.stage === "ESCALATED"
                      ? "danger"
                      : reminder.stage === "OVERDUE"
                        ? "amber"
                        : "neutral"
                  }
                >
                  {reminder.stage.toLowerCase()}
                </Badge>{" "}
                {reminder.acknowledgedAt ? (
                  <Badge tone="green">Acknowledged {fmtInstant(reminder.acknowledgedAt)}</Badge>
                ) : (
                  <ActionForm
                    className="inline-form"
                    action={acknowledgeReminderAction}
                    submit="Acknowledge"
                  >
                    <input type="hidden" name="id" value={reminder.id} />
                  </ActionForm>
                )}
              </div>
            </div>
          ))
        )}
      </section>
    </>
  );
}
