"use client";
import Link from "next/link";
import { CalendarDays } from "lucide-react";
import { useActionState, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import type { PaydaySnapshot } from "@/modules/payroll/payday-rules";
import { acknowledgePaydayAction, readPaydayAlertAction } from "@/app/payday-actions";
export function PaydayBanner({ initial }: { initial: PaydaySnapshot }) {
  const path = usePathname();
  const [snapshot, setSnapshot] = useState(initial);
  const [error, setError] = useState("");
  const [state, action, pending] = useActionState(acknowledgePaydayAction, {
    ok: false,
    message: "",
  });
  useEffect(() => {
    queueMicrotask(() => setSnapshot(initial));
  }, [initial]);
  useEffect(() => {
    let active = true;
    const refresh = () => {
      void readPaydayAlertAction()
        .then((next) => {
          if (active) {
            setSnapshot(next);
            setError("");
          }
        })
        .catch(() => {
          if (active) setError("Reminder could not refresh. Reload to check today's payday alert.");
        });
    };
    // Read-only UI freshness. No jobs, notifications or payments are scheduled here.
    refresh();
    const focused = () => {
      if (document.visibilityState === "visible") refresh();
    };
    window.addEventListener("focus", focused);
    document.addEventListener("visibilitychange", focused);
    return () => {
      active = false;
      window.removeEventListener("focus", focused);
      document.removeEventListener("visibilitychange", focused);
    };
  }, [path]);
  useEffect(() => {
    let active = true;
    const timer = setTimeout(
      () => {
        void readPaydayAlertAction()
          .then((next) => {
            if (active) setSnapshot(next);
          })
          .catch(() => {
            if (active)
              setError("Reminder could not refresh. Reload to check today's payday alert.");
          });
      },
      Math.max(1000, Date.parse(snapshot.nextRefreshAt) - Date.now() + 100),
    );
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [snapshot.nextRefreshAt]);
  const alert = snapshot.alert;
  if (!alert || (state.ok && state.date === alert.date)) return null;
  const payday = new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    weekday: "long",
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(`${alert.payDate}T12:00:00Z`));
  return (
    <section
      className={`payday-banner payday-banner--${alert.tone}`}
      role="alert"
      aria-label="Payroll payday reminder"
      data-testid="banner-payday"
      data-tone={alert.tone}
    >
      <CalendarDays size={22} aria-hidden="true" />
      <div className="payday-banner-content">
        <strong>
          {alert.daysAway === 2
            ? "Payroll is due in 2 days"
            : alert.daysAway === 1
              ? "Payroll is due tomorrow"
              : "Today is payday"}
        </strong>
        <span> · {payday} · Payroll is paid every Monday.</span>
        <small>
          Acknowledge hides this reminder for your account today; it does not record a payment.
        </small>
        {error || (!state.ok && state.message) ? (
          <small role="status">{error || state.message}</small>
        ) : null}
      </div>
      <div className="payday-banner-actions">
        <Link href="/payroll" className="payday-banner-button">
          Review payroll
        </Link>
        <form action={action}>
          <input type="hidden" name="date" value={alert.date} />
          <button type="submit" className="payday-banner-button" disabled={pending}>
            {pending ? "Acknowledging…" : "Acknowledge for today"}
          </button>
        </form>
      </div>
    </section>
  );
}
