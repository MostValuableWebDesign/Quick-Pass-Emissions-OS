"use client";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { createContext, useContext } from "react";
import { withReturn } from "@/lib/navigation";

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
  return (
    <Link className={className} aria-label={ariaLabel} href={withReturn(href, from, role)}>
      {children}
    </Link>
  );
}
