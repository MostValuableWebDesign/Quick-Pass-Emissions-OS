"use client";

import { Bell } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

export function NotificationBell() {
  const [count, setCount] = useState(0);
  const path = usePathname();

  useEffect(() => {
    let active = true;
    const refresh = async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const response = await fetch("/api/notifications/inbox", { cache: "no-store" });
        if (!response.ok) return;
        const result: unknown = await response.json();
        if (
          active &&
          typeof result === "object" &&
          result !== null &&
          "count" in result &&
          typeof result.count === "number" &&
          Number.isSafeInteger(result.count) &&
          result.count >= 0
        ) setCount(result.count);
      } catch {
        // A transient offline period should not erase the last successfully loaded count.
      }
    };
    void refresh();
    const timer = window.setInterval(refresh, 60_000);
    const onVisibility = () => void refresh();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      active = false;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [path]);

  return (
    <Link
      className="notification-bell-link"
      href="/notifications"
      aria-label={count ? `${count} unread notifications` : "Notifications"}
      title="Notifications"
    >
      <Bell size={19} aria-hidden="true" />
      {count > 0 && (
        <span className="notification-bell-count" aria-hidden="true">
          {count > 99 ? "99+" : count}
        </span>
      )}
    </Link>
  );
}
