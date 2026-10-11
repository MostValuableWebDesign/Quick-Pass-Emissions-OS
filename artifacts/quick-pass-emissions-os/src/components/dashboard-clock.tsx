"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { businessDate, TIMEZONE } from "@/lib/time";

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: TIMEZONE,
  weekday: "short",
  month: "short",
  day: "numeric",
  year: "numeric",
});
const timeFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: TIMEZONE,
  hour: "numeric",
  minute: "2-digit",
  second: "2-digit",
  timeZoneName: "short",
});

export function DashboardClock({
  businessDay,
  initialTime,
}: {
  businessDay: string;
  initialTime: string;
}) {
  const router = useRouter();
  const [now, setNow] = useState(() => new Date(initialTime));

  useEffect(() => {
    let refreshedForNewDay = false;
    const interval = window.setInterval(() => {
      const current = new Date();
      setNow(current);
      if (!refreshedForNewDay && businessDate(current) !== businessDay) {
        refreshedForNewDay = true;
        router.refresh();
      }
    }, 1000);
    return () => window.clearInterval(interval);
  }, [businessDay, router]);

  return (
    <span className="dashboard-live-clock" role="group" aria-label="Current date and time in Eastern Time">
      <time dateTime={businessDay}>
        {dateFormatter.format(new Date(`${businessDay}T12:00:00.000Z`))}
      </time>
      <span className="dashboard-live-clock-separator" aria-hidden="true">
        ·
      </span>
      <time dateTime={now.toISOString()}>{timeFormatter.format(now)}</time>
    </span>
  );
}
