/**
 * Pure navigation model: menu definition, route registry, active matching and
 * safe return-context helpers. Visibility here is presentation only; every
 * route remains authorized on the server.
 */
export type NavRole = "OWNER" | "ADMIN";

export const ALL: readonly NavRole[] = ["OWNER", "ADMIN"];
export const MANAGERS: readonly NavRole[] = ["OWNER", "ADMIN"];
export const OPERATORS: readonly NavRole[] = ["OWNER", "ADMIN"];
export const FINANCE: readonly NavRole[] = ["OWNER", "ADMIN"];
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
  | "camera"
  | "shield"
  | "map";

export type NavItem = {
  href: string;
  label: string;
  icon: IconKey;
  roles: readonly NavRole[];
  parent?: string;
  category?: string;
  matchQuery?: Record<string, string>;
  menuOnly?: boolean;
  children?: NavItem[];
};
export type NavSection = { id: string; label: string; items: NavItem[] };

export const NAV_SECTIONS: NavSection[] = [
  {
    id: "overview",
    label: "Overview",
    items: [
      { href: "/dashboard", label: "Dashboard", icon: "dashboard", roles: ALL },
      { href: "/overview", label: "Owner exceptions", icon: "gauge", roles: OWNER_ONLY },
    ],
  },
  {
    id: "emissions",
    label: "Emissions",
    items: [
      { href: "/performance", label: "Performance", icon: "chart", roles: OWNER_ONLY },
      { href: "/certificates", label: "Certificates", icon: "package", roles: FINANCE },
      {
        href: "/dealerships",
        label: "Dealerships",
        icon: "building",
        roles: FINANCE,
        children: [
          { href: "/invoices", label: "Invoices", icon: "receipt", roles: FINANCE, category: "Billing" },
          {
            href: "/invoices?view=payments",
            label: "Payments",
            icon: "wallet",
            roles: FINANCE,
            category: "Billing",
            matchQuery: { view: "payments" },
          },
        ],
      },
    ],
  },
  {
    id: "carwash",
    label: "Car Wash",
    items: [
      { href: "/carwash", label: "Carwash & bays", icon: "car", roles: MANAGERS },
      { href: "/equipment", label: "Equipment", icon: "cog", roles: MANAGERS },
    ],
  },
  {
    id: "security",
    label: "Security",
    items: [{ href: "/security", label: "Camera viewing", icon: "camera", roles: MANAGERS }],
  },
  {
    id: "shared-business",
    label: "Business",
    items: [
      {
        href: "/employees",
        label: "Employees",
        icon: "users",
        roles: MANAGERS,
        children: [
          { href: "/payroll", label: "Payroll & commissions", icon: "wallet", roles: FINANCE },
        ],
      },
      { href: "/vendors", label: "Service & Support", icon: "truck", roles: OPERATORS },
      { href: "/finance", label: "Operational finance", icon: "ledger", roles: FINANCE },
    ],
  },
  {
    id: "reports",
    label: "Reports",
    items: [
      { href: "/finance/reports", label: "Finance reports", icon: "fileChart", roles: FINANCE },
    ],
  },
  {
    id: "settings",
    label: "Settings",
    items: [
      {
        href: "#settings-menu",
        label: "Settings",
        icon: "settings",
        roles: ALL,
        menuOnly: true,
        children: [
          {
            href: "/settings",
            label: "Business settings",
            icon: "settings",
            roles: MANAGERS,
            category: "Business operations",
          },
          {
            href: "/reminders",
            label: "Reminders",
            icon: "reminder",
            roles: ALL,
            category: "Reminders & notifications",
          },
          {
            href: "/notifications",
            label: "Notifications",
            icon: "bell",
            roles: ALL,
            category: "Reminders & notifications",
          },
          {
            href: "/settings/account",
            label: "Account",
            icon: "shield",
            roles: MANAGERS,
            category: "Account & security",
          },
          {
            href: "/automation",
            label: "Automation",
            icon: "automation",
            roles: OWNER_ONLY,
            category: "Automation",
          },
        ],
      },
    ],
  },
];

function isRole(role: string): role is NavRole {
  return (ALL as readonly string[]).includes(role);
}

/** Sections filtered for a role; empty sections are dropped. Same output for desktop and mobile. */
export function navForRole(role: string): NavSection[] {
  if (!isRole(role)) return [];
  const filterItem = (item: NavItem, parent?: string): NavItem | null => {
    if (!item.roles.includes(role)) return null;
    const children = item.children
      ?.map((child) => filterItem(child, item.menuOnly ? undefined : item.href))
      .filter((child): child is NavItem => !!child);
    return { ...item, ...(parent ? { parent } : {}), ...(item.children ? { children } : {}) };
  };
  return NAV_SECTIONS.map((s) => ({
    ...s,
    items: s.items.map((item) => filterItem(item)).filter((item): item is NavItem => !!item),
  })).filter((s) => s.items.length > 0);
}

/** Flatten the role-filtered tree for route checks and tests. */
export function allNavItems(role: string): NavItem[] {
  const flatten = (items: NavItem[]): NavItem[] =>
    items.flatMap((item) => [
      ...(item.menuOnly ? [] : [item]),
      ...flatten(item.children ?? []),
    ]);
  return flatten(navForRole(role).flatMap((section) => section.items));
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

const navDefs: RouteDef[] = (() => {
  const seen = new Set<string>();
  return NAV_SECTIONS.flatMap((section) =>
    section.items.flatMap((item) => [
      ...(!item.menuOnly ? [{ item, parent: item.parent, section: section.label }] : []),
      ...(item.children ?? []).map((child) => ({
        item: child,
        parent: item.menuOnly ? undefined : item.href,
        section: section.label,
      })),
    ]),
  )
    .filter(({ item }) => {
      const pattern = item.href.split("?")[0];
      if (seen.has(pattern)) return false;
      seen.add(pattern);
      return true;
    })
    .map(({ item, parent, section }) => ({
      pattern: item.href.split("?")[0],
      title: item.label,
      section,
      navHref: item.href,
      parent,
      roles: item.roles,
    }));
})();

// Keep these routes resolvable for existing deep links and notifications,
// without exposing them as sidebar navigation entries.
const detachedNavDefs: RouteDef[] = [
  {
    pattern: "/reports",
    title: "Operational reports",
    section: "Reports",
    navHref: "/reports",
    roles: FINANCE,
  },
  {
    pattern: "/summaries",
    title: "Summary archive",
    section: "Reports",
    navHref: "/summaries",
    roles: OWNER_ONLY,
  },
  {
    pattern: "/maintenance",
    title: "Maintenance tickets",
    section: "Car Wash",
    navHref: "/maintenance",
    roles: OPERATORS,
  },
  {
    pattern: "/maintenance/plans",
    title: "Preventative schedules",
    section: "Car Wash",
    navHref: "/maintenance/plans",
    roles: MANAGERS,
  },
  {
    pattern: "/chemicals",
    title: "Chemicals",
    section: "Car Wash",
    navHref: "/chemicals",
    roles: MANAGERS,
  },
  {
    pattern: "/rentals",
    title: "Detailing rentals",
    section: "Car Wash",
    navHref: "/rentals",
    roles: FINANCE,
  },
  { pattern: "/tasks", title: "Tasks", section: "Operations", navHref: "/tasks", roles: OPERATORS },
  {
    pattern: "/schedule",
    title: "Schedule",
    section: "Operations",
    navHref: "/schedule",
    roles: OPERATORS,
  },
  {
    pattern: "/tasks/templates",
    title: "Task templates",
    section: "Operations",
    navHref: "/tasks/templates",
    roles: MANAGERS,
  },
];

function detail(
  pattern: string,
  title: string,
  parent: string,
  roles: readonly NavRole[],
): RouteDef {
  // Detail routes may remain directly reachable after their parent link has
  // been removed from the sidebar. Keep matching/breadcrumb metadata valid.
  const p = [...navDefs, ...detachedNavDefs].find((d) => d.pattern === parent);
  return { pattern, title, section: p?.section ?? "Records", navHref: parent, parent, roles };
}

export const ROUTES: RouteDef[] = [
  ...navDefs,
  ...detachedNavDefs,
  detail("/tasks/:id", "Task detail", "/tasks", OPERATORS),
  detail("/employees/:id", "Employee profile", "/employees", MANAGERS),
  detail("/payroll/:id", "Payroll period", "/payroll", FINANCE),
  detail("/maintenance/:id", "Maintenance ticket", "/maintenance", OPERATORS),
  detail("/vendors/:id", "Service & Support", "/vendors", OPERATORS),
  detail("/dealerships/:id", "Dealership account", "/dealerships", FINANCE),
  detail("/invoices/:id", "Invoice", "/invoices", FINANCE),
  detail("/rentals/:id", "Rental agreement", "/rentals", FINANCE),
  detail("/summaries/:id", "Summary", "/summaries", OWNER_ONLY),
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
export function activeNavHref(
  pathname: string,
  role: string,
  search = "",
): string | undefined {
  const query = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  const items = allNavItems(role);
  const queryMatch = items.find((item) => {
    if (!item.matchQuery) return false;
    if (item.href.split("?")[0] !== pathname) return false;
    return Object.entries(item.matchQuery).every(([key, value]) => query.get(key) === value);
  });
  const exact = queryMatch ?? items.find(
    (item) => !item.matchQuery && item.href.split("?")[0] === pathname,
  );
  if (exact) return exact.href;
  const visible = items.map((item) => item.href);
  const route = matchRoute(pathname);
  if (route && visible.includes(route.navHref)) return route.navHref;
  let best: string | undefined;
  for (const href of visible) {
    const base = href.split("?")[0];
    if (pathname === base || pathname.startsWith(base + "/")) {
      if (!best || base.length > best.split("?")[0].length) best = href;
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
