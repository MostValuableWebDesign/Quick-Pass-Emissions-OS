/**
 * Pure navigation model: menu definition, route registry, active matching and
 * safe return-context helpers. Visibility here is presentation only; every
 * route remains authorized on the server.
 */
export type NavRole = "OWNER" | "ADMIN" | "BOOKKEEPER" | "EMPLOYEE";

export const ALL: readonly NavRole[] = ["OWNER", "ADMIN", "BOOKKEEPER", "EMPLOYEE"];
export const MANAGERS: readonly NavRole[] = ["OWNER", "ADMIN"];
export const OPERATORS: readonly NavRole[] = ["OWNER", "ADMIN", "EMPLOYEE"];
export const FINANCE: readonly NavRole[] = ["OWNER", "ADMIN", "BOOKKEEPER"];
export const OWNER_ONLY: readonly NavRole[] = ["OWNER"];

export type IconKey =
  | "dashboard"
  | "gauge"
  | "reminder"
  | "bell"
  | "tasks"
  | "calendar"
  | "template"
  | "users"
  | "wallet"
  | "package"
  | "flask"
  | "car"
  | "wrench"
  | "calendarCheck"
  | "cog"
  | "truck"
  | "building"
  | "receipt"
  | "key"
  | "ledger"
  | "chart"
  | "fileChart"
  | "archive"
  | "automation"
  | "settings"
  | "shield"
  | "map";

export type NavItem = { href: string; label: string; icon: IconKey; roles: readonly NavRole[] };
export type NavSection = { id: string; label: string; items: NavItem[] };

export const NAV_SECTIONS: NavSection[] = [
  {
    id: "overview",
    label: "Overview",
    items: [
      { href: "/dashboard", label: "Dashboard", icon: "dashboard", roles: ALL },
      { href: "/overview", label: "Owner exceptions", icon: "gauge", roles: OWNER_ONLY },
      { href: "/performance", label: "Performance", icon: "chart", roles: OWNER_ONLY },
      { href: "/reminders", label: "Reminders", icon: "reminder", roles: ALL },
      { href: "/notifications", label: "Notifications", icon: "bell", roles: ALL },
    ],
  },
  {
    id: "team",
    label: "Team & Tasks",
    items: [
      { href: "/tasks", label: "Tasks", icon: "tasks", roles: OPERATORS },
      { href: "/schedule", label: "Schedule", icon: "calendar", roles: OPERATORS },
      { href: "/tasks/templates", label: "Task templates", icon: "template", roles: MANAGERS },
      { href: "/employees", label: "Employees", icon: "users", roles: MANAGERS },
    ],
  },
  {
    id: "payroll",
    label: "Payroll",
    items: [{ href: "/payroll", label: "Payroll & commissions", icon: "wallet", roles: FINANCE }],
  },
  {
    id: "inventory",
    label: "Inventory",
    items: [
      { href: "/certificates", label: "Certificates", icon: "package", roles: FINANCE },
      { href: "/chemicals", label: "Chemicals", icon: "flask", roles: MANAGERS },
    ],
  },
  {
    id: "carwash",
    label: "Carwash & Maintenance",
    items: [
      { href: "/carwash", label: "Carwash & bays", icon: "car", roles: MANAGERS },
      { href: "/maintenance", label: "Maintenance tickets", icon: "wrench", roles: OPERATORS },
      {
        href: "/maintenance/plans",
        label: "Preventative schedules",
        icon: "calendarCheck",
        roles: MANAGERS,
      },
      { href: "/equipment", label: "Equipment", icon: "cog", roles: MANAGERS },
      { href: "/vendors", label: "Service & Support", icon: "truck", roles: OPERATORS },
    ],
  },
  {
    id: "billing",
    label: "Dealerships & Billing",
    items: [
      { href: "/dealerships", label: "Dealerships", icon: "building", roles: FINANCE },
      { href: "/invoices", label: "Invoices & payments", icon: "receipt", roles: FINANCE },
      { href: "/rentals", label: "Detailing rentals", icon: "key", roles: FINANCE },
      { href: "/finance", label: "Operational finance", icon: "ledger", roles: FINANCE },
    ],
  },
  {
    id: "reports",
    label: "Reports",
    items: [
      { href: "/reports", label: "Operational reports", icon: "chart", roles: FINANCE },
      { href: "/finance/reports", label: "Finance reports", icon: "fileChart", roles: FINANCE },
      { href: "/summaries", label: "Summary archive", icon: "archive", roles: OWNER_ONLY },
    ],
  },
  {
    id: "settings",
    label: "Settings",
    items: [
      { href: "/automation", label: "Automation", icon: "automation", roles: OWNER_ONLY },
      { href: "/settings", label: "Settings & audit", icon: "settings", roles: MANAGERS },
      { href: "/account/password", label: "Account & password", icon: "shield", roles: ALL },
      { href: "/roadmap", label: "Product roadmap", icon: "map", roles: ALL },
    ],
  },
];

function isRole(role: string): role is NavRole {
  return (ALL as readonly string[]).includes(role);
}

/** Sections filtered for a role; empty sections are dropped. Same output for desktop and mobile. */
export function navForRole(role: string): NavSection[] {
  if (!isRole(role)) return [];
  return NAV_SECTIONS.map((s) => ({
    ...s,
    items: s.items.filter((i) => i.roles.includes(role)),
  })).filter((s) => s.items.length > 0);
}

export type RouteDef = {
  /** Path pattern; `:id` matches one opaque record id segment. */
  pattern: string;
  title: string;
  section: string;
  /** Primary nav entry that is active for this route. */
  navHref: string;
  /** Parent list route for detail pages (fallback return target). */
  parent?: string;
  roles: readonly NavRole[];
};

const navDefs: RouteDef[] = NAV_SECTIONS.flatMap((s) =>
  s.items.map((i) => ({
    pattern: i.href,
    title: i.label,
    section: s.label,
    navHref: i.href,
    roles: i.roles,
  })),
);

function detail(
  pattern: string,
  title: string,
  parent: string,
  roles: readonly NavRole[],
): RouteDef {
  const p = navDefs.find((d) => d.pattern === parent)!;
  return { pattern, title, section: p.section, navHref: parent, parent, roles };
}

export const ROUTES: RouteDef[] = [
  ...navDefs,
  {
    pattern: "/reminders/certification",
    title: "My certification",
    section: "Overview",
    navHref: "/reminders",
    parent: "/reminders",
    roles: ALL,
  },
  detail("/tasks/:id", "Task detail", "/tasks", OPERATORS),
  detail("/employees/:id", "Employee profile", "/employees", MANAGERS),
  detail("/payroll/:id", "Payroll period", "/payroll", FINANCE),
  detail("/maintenance/:id", "Maintenance ticket", "/maintenance", OPERATORS),
  detail("/vendors/:id", "Service & Support", "/vendors", OPERATORS),
  detail("/dealerships/:id", "Dealership account", "/dealerships", FINANCE),
  detail("/invoices/:id", "Invoice", "/invoices", FINANCE),
  detail("/rentals/:id", "Rental agreement", "/rentals", FINANCE),
  detail("/summaries/:id", "Summary", "/summaries", OWNER_ONLY),
  detail("/performance/settings", "Performance setup", "/performance", OWNER_ONLY),
  detail("/performance/tests/:id", "Station test evidence", "/performance", OWNER_ONLY),
];

const ID_SEGMENT = /^[A-Za-z0-9_-]{1,64}$/;

function segments(path: string) {
  return path.split("/").filter(Boolean);
}

/** Resolve a pathname to its route definition. Static routes win over `:id` patterns. */
export function matchRoute(pathname: string): RouteDef | undefined {
  const clean = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
  const exact = ROUTES.find((r) => r.pattern === clean);
  if (exact) return exact;
  const segs = segments(clean);
  return ROUTES.find((r) => {
    const ps = segments(r.pattern);
    if (!r.pattern.includes(":") || ps.length !== segs.length) return false;
    return ps.every((p, i) => (p === ":id" ? ID_SEGMENT.test(segs[i]) : p === segs[i]));
  });
}

/**
 * The single nav href to mark current: the route's own nav entry if visible,
 * otherwise the longest visible nav href that prefixes the path on a segment boundary.
 */
export function activeNavHref(pathname: string, role: string): string | undefined {
  const visible = navForRole(role).flatMap((s) => s.items.map((i) => i.href));
  const route = matchRoute(pathname);
  if (route && visible.includes(route.navHref)) return route.navHref;
  let best: string | undefined;
  for (const href of visible) {
    if (pathname === href || pathname.startsWith(href + "/")) {
      if (!best || href.length > best.length) best = href;
    }
  }
  return best;
}

export type Crumb = { label: string; href?: string };

/** Breadcrumb trail: section, then list page link for details, then current title (no href). */
export function breadcrumbs(pathname: string): Crumb[] {
  const route = matchRoute(pathname);
  if (!route) return [{ label: "Workspace" }, { label: "Operations" }];
  const trail: Crumb[] = [{ label: route.section }];
  if (route.parent) {
    const parent = matchRoute(route.parent);
    if (parent) trail.push({ label: parent.title, href: parent.pattern });
  }
  trail.push({ label: route.title });
  return trail;
}

const MAX_RETURN_LENGTH = 512;
const BLOCKED_PREFIXES = ["/api", "/login", "/invite", "/_next"];

/**
 * Validate an untrusted return destination. Returns a same-origin relative
 * path+query that maps to a registered, role-visible app route, else null.
 */
export function safeReturnPath(raw: unknown, role: string, depth = 0): string | null {
  if (typeof raw !== "string" || raw.length === 0 || raw.length > MAX_RETURN_LENGTH) return null;
  if (!raw.startsWith("/") || raw.startsWith("//")) return null;
  // Reject backslashes, control characters/whitespace and any encoded separators or dots.
  if (/[\\\s\u0000-\u001f\u007f]/.test(raw)) return null;
  const rawPath = raw.split("?")[0];
  // Encoded dots/separators are only dangerous in the path; query filter values may contain them.
  if (/%(2e|2f|5c|00|09|0a|0d)/i.test(rawPath)) return null;
  if (raw.includes("#")) return null;
  let url: URL;
  try {
    url = new URL(raw, "http://quickpass.invalid");
  } catch {
    return null;
  }
  if (url.origin !== "http://quickpass.invalid") return null;
  const path = url.pathname;
  if (segments(rawPath).some((s) => s === "." || s === "..")) return null;
  if (BLOCKED_PREFIXES.some((p) => path === p || path.startsWith(p + "/"))) return null;
  const route = matchRoute(path);
  if (!route || !isRole(role) || !route.roles.includes(role)) return null;
  // Keep a bounded, recursively validated record → record → filtered-list origin.
  // Deeper or unsafe context is stripped instead of allowing unbounded URL growth.
  const nested = url.searchParams.get("from");
  url.searchParams.delete("from");
  if (nested && depth < 2) {
    const safeNested = safeReturnPath(nested, role, depth + 1);
    if (safeNested && safeNested.split("?")[0] !== path) url.searchParams.set("from", safeNested);
  }
  const qs = url.searchParams.toString();
  return qs ? `${path}?${qs}` : path;
}

/** Append a validated origin (`from`) to a record href. Unsafe origins are dropped. */
export function withReturn(href: string, from: string, role: string): string {
  const target = matchRoute(href.split("?")[0]);
  if (!target?.parent) return href; // only record-detail routes carry return context
  const safe = safeReturnPath(from, role);
  if (!safe || safe === href) return href;
  const sep = href.includes("?") ? "&" : "?";
  return `${href}${sep}from=${encodeURIComponent(safe)}`;
}

export type ReturnTarget = { href: string; label: string };

/**
 * Context-aware return link for detail pages. Uses validated `from` when it
 * differs from the current page; otherwise falls back to the parent list.
 */
export function returnTarget(
  pathname: string,
  from: string | null | undefined,
  role: string,
): ReturnTarget | null {
  const route = matchRoute(pathname);
  if (!route?.parent) return null;
  const safe = safeReturnPath(from, role);
  if (safe && safe.split("?")[0] !== pathname) {
    const origin = matchRoute(safe.split("?")[0])!;
    return { href: safe, label: `Back to ${origin.title.toLowerCase()}` };
  }
  const parent = matchRoute(route.parent)!;
  if (!isRole(role) || !parent.roles.includes(role)) return null;
  return { href: parent.pattern, label: `Back to ${parent.title.toLowerCase()}` };
}
