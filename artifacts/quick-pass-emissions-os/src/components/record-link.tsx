"use client";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { createContext, useContext } from "react";
import { matchRoute, safeReturnPath, withReturn } from "@/lib/navigation";

export const NavRoleContext = createContext<string>("");

/** Same-tab link to a record that carries the current list URL (filters, dates, page) as validated context. */
export function RecordLink({
  href,
  className,
  children,
  "aria-label": ariaLabel,
}: {
  href: string;
  className?: string;
  children: React.ReactNode;
  "aria-label"?: string;
}) {
  const role = useContext(NavRoleContext);
  const pathname = usePathname();
  const params = useSearchParams();
  const qs = params.toString();
  const from = qs ? `${pathname}?${qs}` : pathname;
  // Keep permitted record data visible without offering a dead-end link into
  // a different module the current role cannot open (for example, staff profiles).
  const destination = href.split(/[?#]/)[0];
  if (role && matchRoute(destination) && !safeReturnPath(destination, role))
    return <span className={className?.replace(/\btext-link\b/g, "").trim()}>{children}</span>;
  return (
    <Link className={className} aria-label={ariaLabel} href={withReturn(href, from, role)}>
      {children}
    </Link>
  );
}
