"use client";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTheme } from "next-themes";
import { createAuthClient } from "better-auth/react";
import {
  LayoutDashboard,
  CheckCheck,
  CalendarDays,
  CalendarCheck,
  ClipboardList,
  Users,
  Bell,
  Settings,
  PanelLeftClose,
  PanelLeftOpen,
  Menu,
  X,
  Moon,
  LogOut,
  ShieldCheck,
  CircleDot,
  Wallet,
  Package,
  FlaskConical,
  Wrench,
  Cog,
  Truck,
  Building2,
  Receipt,
  Car,
  KeyRound,
  BookOpen,
  Gauge,
  BarChart3,
  FileBarChart,
  Archive,
  Workflow,
  BellRing,
  Map,
  ArrowLeft,
  type LucideIcon,
} from "lucide-react";
import { Button } from "./ui/button";
import { NavRoleContext } from "./record-link";
import {
  activeNavHref,
  breadcrumbs,
  matchRoute,
  navForRole,
  returnTarget,
  type IconKey,
} from "@/lib/navigation";

const authClient = createAuthClient();

const ICONS: Record<IconKey, LucideIcon> = {
  dashboard: LayoutDashboard,
  gauge: Gauge,
  reminder: BellRing,
  bell: Bell,
  tasks: CheckCheck,
  calendar: CalendarDays,
  template: ClipboardList,
  users: Users,
  wallet: Wallet,
  package: Package,
  flask: FlaskConical,
  car: Car,
  wrench: Wrench,
  calendarCheck: CalendarCheck,
  cog: Cog,
  truck: Truck,
  building: Building2,
  receipt: Receipt,
  key: KeyRound,
  ledger: BookOpen,
  chart: BarChart3,
  fileChart: FileBarChart,
  archive: Archive,
  automation: Workflow,
  settings: Settings,
  shield: ShieldCheck,
  map: Map,
};

const MOBILE_QUERY = "(max-width: 680px)";
const FOCUSABLE = 'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function Shell({
  children,
  name,
  role,
}: {
  children: React.ReactNode;
  name: string;
  role: string;
}) {
  const path = usePathname();
  const params = useSearchParams();
  const router = useRouter();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const sidebarRef = useRef<HTMLElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const { resolvedTheme, setTheme } = useTheme();

  const sections = navForRole(role);
  const active = activeNavHref(path, role);
  const route = matchRoute(path);
  const crumbs = breadcrumbs(path);
  const back = returnTarget(path, params.get("from"), role);

  useEffect(() => {
    const mq = window.matchMedia(MOBILE_QUERY);
    const sync = () => {
      setIsMobile(mq.matches);
      if (!mq.matches) setMobileOpen(false);
    };
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  const closeMobile = useCallback((restoreFocus: boolean) => {
    setMobileOpen(false);
    if (restoreFocus) requestAnimationFrame(() => toggleRef.current?.focus());
  }, []);

  // Close the drawer after any navigation (adjust state during render, not in an effect).
  const [lastPath, setLastPath] = useState(path);
  if (lastPath !== path) {
    setLastPath(path);
    setMobileOpen(false);
  }

  // Page title from the route registry.
  useEffect(() => {
    if (route) document.title = `${route.title} · Quick Pass Business OS`;
  }, [route]);

  const drawerOpen = isMobile && mobileOpen;
  useEffect(() => {
    if (!drawerOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const first = sidebarRef.current?.querySelector<HTMLElement>(FOCUSABLE);
    first?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        closeMobile(true);
        return;
      }
      if (e.key !== "Tab" || !sidebarRef.current) return;
      const nodes = Array.from(sidebarRef.current.querySelectorAll<HTMLElement>(FOCUSABLE));
      const items = [toggleRef.current, ...nodes].filter(
        (node): node is HTMLElement => !!node && node.getClientRects().length > 0,
      );
      if (!items.length) return;
      const current = document.activeElement as HTMLElement | null;
      const index = current ? items.indexOf(current) : -1;
      // The close toggle precedes the drawer visually but follows it in DOM
      // order. Explicitly cycle the complete visible set in both directions.
      e.preventDefault();
      const next = index < 0 ? 0 : (index + (e.shiftKey ? -1 : 1) + items.length) % items.length;
      items[next].focus();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener("keydown", onKey);
    };
  }, [drawerOpen, closeMobile]);

  return (
    <NavRoleContext.Provider value={role}>
      <div className={`app ${collapsed ? "collapsed" : ""}`}>
        <a className="skip-link" href="#main">
          Skip to content
        </a>
        <aside
          id="primary-navigation"
          ref={sidebarRef}
          className={`sidebar ${drawerOpen ? "open" : ""}`}
          inert={isMobile && !mobileOpen ? true : undefined}
          aria-label="Workspace sidebar"
        >
          <Link className="brand" href="/dashboard">
            <span className="brand-icon">
              <CheckCheck size={26} />
            </span>
            <span className="nav-label">
              QUICK PASS<small>BUSINESS OS</small>
            </span>
          </Link>
          <div className="workspace nav-label">
            <span className="workspace-dot" />
            Quick Pass operations<small>Emissions · Tag renewal · Carwash</small>
          </div>
          <nav aria-label="Main navigation" className="primary-nav">
            {sections.map((section) => (
              <div className="nav-group" key={section.id}>
                <p className="nav-caption nav-label" id={`nav-${section.id}`}>
                  {section.label.toUpperCase()}
                </p>
                <ul aria-labelledby={`nav-${section.id}`}>
                  {section.items.map((item) => {
                    const Icon = ICONS[item.icon];
                    const current = item.href === active;
                    return (
                      <li key={item.href}>
                        <Link
                          title={collapsed ? item.label : undefined}
                          className={current ? "nav-link active" : "nav-link"}
                          aria-current={current ? "page" : undefined}
                          href={item.href}
                          onClick={() => setMobileOpen(false)}
                        >
                          <Icon size={18} aria-hidden="true" />
                          <span className="nav-label">{item.label}</span>
                          {collapsed && <span className="sr-only">{item.label}</span>}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </nav>
          <div className="sidebar-bottom nav-label">
            <div className="phase-note">
              <ShieldCheck size={21} />
              <strong>Operations, connected.</strong>
              <p>
                Clear responsibilities.
                <br />
                Accountable execution.
              </p>
            </div>
          </div>
        </aside>
        {drawerOpen && (
          <div className="nav-backdrop" aria-hidden="true" onClick={() => closeMobile(true)} />
        )}
        <div className="main-wrap">
          <header className="topbar">
            <div className="topbar-left">
              <Button
                variant="ghost"
                className="desktop-toggle"
                aria-label={collapsed ? "Expand navigation" : "Collapse navigation"}
                aria-controls="primary-navigation"
                aria-expanded={!collapsed}
                onClick={() => setCollapsed(!collapsed)}
              >
                {collapsed ? <PanelLeftOpen size={20} /> : <PanelLeftClose size={20} />}
              </Button>
              <Button
                ref={toggleRef}
                variant="ghost"
                className="mobile-toggle"
                aria-label={mobileOpen ? "Close navigation menu" : "Open navigation menu"}
                aria-controls="primary-navigation"
                aria-expanded={drawerOpen}
                onClick={() => (mobileOpen ? closeMobile(false) : setMobileOpen(true))}
              >
                {drawerOpen ? <X size={20} /> : <Menu size={20} />}
              </Button>
              <nav aria-label="Breadcrumb" className="breadcrumb">
                <ol>
                  {crumbs.map((c, i) => (
                    <li key={`${c.label}-${i}`}>
                      {c.href ? <Link href={c.href}>{c.label}</Link> : c.label}
                    </li>
                  ))}
                </ol>
              </nav>
            </div>
            <div className="topbar-right">
              <span className="business-zone">
                <CircleDot size={12} /> Eastern time
              </span>
              <Button
                variant="ghost"
                aria-label="Toggle theme"
                onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
              >
                <Moon size={18} />
              </Button>
              <span className="avatar">
                {name
                  .split(" ")
                  .map((n) => n[0])
                  .slice(0, 2)
                  .join("")}
              </span>
              <div className="user-label">
                <strong>{name}</strong>
                <small>{role === "ADMIN" ? "General manager" : role.toLowerCase()}</small>
              </div>
              <Button
                variant="ghost"
                aria-label="Sign out"
                onClick={async () => {
                  await authClient.signOut();
                  router.push("/login");
                  router.refresh();
                }}
              >
                <LogOut size={18} />
              </Button>
            </div>
          </header>
          <main id="main">
            {back && (
              <Link className="return-link" href={back.href}>
                <ArrowLeft size={15} aria-hidden="true" />
                {back.label}
              </Link>
            )}
            {children}
          </main>
          <footer className="page-footer">
            Quick Pass Business OS <span>Phases 1–5 · Business workspace</span>
          </footer>
        </div>
      </div>
    </NavRoleContext.Provider>
  );
}
