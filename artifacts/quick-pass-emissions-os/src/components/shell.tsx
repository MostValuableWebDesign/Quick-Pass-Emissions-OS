"use client";
import { createPortal } from "react-dom";
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
  Sun,
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
  ChevronDown,
  Map,
  ArrowLeft,
  type LucideIcon,
} from "lucide-react";
import { Button } from "./ui/button";
import { CertificatePortalBanner } from "./certificate-portal-banner";
import type { CertificatePortalStatus } from "@/modules/certificates/portal-types";
import { NavRoleContext } from "./record-link";
import {
  activeNavHref,
  breadcrumbs,
  matchRoute,
  navForRole,
  returnTarget,
  type IconKey,
  allNavItems,
  type NavItem,
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
  certificateStatus = null,
}: {
  children: React.ReactNode;
  name: string;
  role: string;
  certificateStatus?: CertificatePortalStatus | null;
}) {
  const path = usePathname();
  const params = useSearchParams();
  const router = useRouter();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [openSubmenus, setOpenSubmenus] = useState<Record<string, boolean>>({});
  const [sideMenu, setSideMenu] = useState<{ href: string; left: number; top: number } | null>(null);
  const sidebarRef = useRef<HTMLElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const { resolvedTheme, setTheme } = useTheme();

  const sections = navForRole(role);
  const active = activeNavHref(path, role, params.toString());
  const route = matchRoute(path);
  const crumbs = breadcrumbs(path);
  const selectedItem = allNavItems(role).find((item) => item.href === active);
  if (selectedItem?.matchQuery && crumbs.length)
    crumbs[crumbs.length - 1] = { label: selectedItem.label };
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

  const openSideMenu = (item: NavItem, anchor: HTMLElement) => {
    if (isMobile || !item.children?.length) return;
    const rect = anchor.getBoundingClientRect();
    const categories = new Set(item.children.map((child) => child.category));
    const estimatedHeight = Math.min(window.innerHeight - 24, item.children.length * 38 + categories.size * 28 + 24);
    const top = Math.max(12, Math.min(rect.top, window.innerHeight - estimatedHeight - 12));
    setSideMenu({ href: item.href, left: rect.right - 2, top });
  };

  // Close the drawer after any navigation (adjust state during render, not in an effect).
  const [lastPath, setLastPath] = useState(path);
  if (lastPath !== path) {
    setLastPath(path);
    setMobileOpen(false);
  }

  // Page title from the route registry.
  useEffect(() => {
    if (route) document.title = `${selectedItem?.matchQuery ? selectedItem.label : route.title} · Quick Pass Emissions`;
  }, [route, selectedItem?.label, selectedItem?.matchQuery]);

  const drawerOpen = isMobile && mobileOpen;
  const sideMenuItem = sideMenu
    ? allNavItems(role).find((item) => item.href === sideMenu.href && item.children?.length)
    : undefined;
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
              Quick Pass<small>EMISSIONS</small>
            </span>
          </Link>
          <div className="workspace nav-label">
            <span className="workspace-dot" />
            Quick Pass Emissions<small>Emissions · Tag renewal · Carwash</small>
          </div>
          <nav aria-label="Main navigation" className="primary-nav">
            {sections.map((section) => (
              <div className="nav-group" data-nav-section={section.id} key={section.id}>
                <p className="nav-caption nav-label" id={`nav-${section.id}`}>
                  {section.label.toUpperCase()}
                </p>
                <ul aria-labelledby={`nav-${section.id}`}>
                  {section.items.map((item) => {
                    const Icon = ICONS[item.icon];
                    const children = item.children ?? [];
                    const hasChildren = children.length > 0;
                    const current = item.href === active;
                    const childIsCurrent = children.some((child) => child.href === active);
                    const submenuOpen = isMobile
                      ? (openSubmenus[item.href] ?? childIsCurrent)
                      : sideMenu?.href === item.href;
                    const categories = [...new Set(children.map((child) => child.category ?? ""))];
                    const submenuId = `nav-submenu-${section.id}-${item.href.replaceAll("/", "-")}`;
                    return (
                      <li
                        className={[
                          "nav-item",
                          hasChildren ? "nav-item-with-children" : "",
                          submenuOpen ? "submenu-open" : "",
                        ]
                          .filter(Boolean)
                          .join(" ")}
                        key={item.href}
                        data-nav-root={item.href}
                        onMouseEnter={(event) => {
                          if (hasChildren) openSideMenu(item, event.currentTarget);
                        }}
                        onMouseLeave={(event) => {
                          const target = event.relatedTarget;
                          const movingToFlyout =
                            target instanceof Element &&
                            target.closest(".nav-flyout")?.getAttribute("data-nav-parent") === item.href;
                          if (hasChildren && !isMobile && !movingToFlyout) setSideMenu(null);
                        }}
                        onFocus={(event) => {
                          const target = event.relatedTarget;
                          const movingFromFlyout =
                            target instanceof Element &&
                            target.closest(".nav-flyout")?.getAttribute("data-nav-parent") === item.href;
                          if (hasChildren && !isMobile && !movingFromFlyout)
                            openSideMenu(item, event.currentTarget);
                        }}
                        onBlur={(event) => {
                          const target = event.relatedTarget;
                          const movingToFlyout =
                            target instanceof Element &&
                            target.closest(".nav-flyout")?.getAttribute("data-nav-parent") === item.href;
                          if (hasChildren && !isMobile && !movingToFlyout) setSideMenu(null);
                        }}
                        onKeyDown={(event) => {
                          if (event.key === "Escape" && hasChildren && submenuOpen) {
                            event.stopPropagation();
                            setOpenSubmenus((old) => ({ ...old, [item.href]: false }));
                            setSideMenu(null);
                            event.currentTarget.querySelector<HTMLButtonElement>(".nav-submenu-toggle")?.focus();
                          }
                        }}
                      >
                        <div className="nav-main-row">
                          <Link
                            title={collapsed ? item.label : undefined}
                            className={[
                              "nav-link",
                              current ? "active" : "",
                              childIsCurrent ? "nav-parent-active" : "",
                              item.href === "/settings" ? "nav-link-settings-root" : "",
                            ]
                              .filter(Boolean)
                              .join(" ")}
                            aria-current={current ? "page" : undefined}
                            href={item.href}
                            onClick={() => {
                              setMobileOpen(false);
                              setSideMenu(null);
                            }}
                          >
                            <Icon size={18} aria-hidden="true" />
                            <span className="nav-label">{item.label}</span>
                            {collapsed && <span className="sr-only">{item.label}</span>}
                          </Link>
                          {hasChildren && (
                            <button
                              type="button"
                              className="nav-submenu-toggle"
                              aria-label={`${submenuOpen ? "Hide" : "Show"} ${item.label} pages`}
                              aria-expanded={submenuOpen}
                              aria-controls={isMobile ? `${submenuId}-inline` : submenuId}
                              title={`${submenuOpen ? "Hide" : "Show"} ${item.label} pages`}
                              onClick={(event) => {
                                event.stopPropagation();
                                if (isMobile) {
                                  setOpenSubmenus((old) => ({ ...old, [item.href]: !submenuOpen }));
                                } else if (submenuOpen) {
                                  setSideMenu(null);
                                } else {
                                  openSideMenu(item, event.currentTarget.closest("[data-nav-root]") as HTMLElement);
                                  if (event.detail === 0)
                                    requestAnimationFrame(() =>
                                      document.getElementById(submenuId)?.querySelector<HTMLAnchorElement>("a")?.focus(),
                                    );
                                }
                              }}
                            >
                              <ChevronDown size={14} aria-hidden="true" />
                            </button>
                          )}
                        </div>
                        {hasChildren && (
                          <div
                            id={`${submenuId}-inline`}
                            className={`nav-submenu${submenuOpen ? " open" : ""}`}
                          >
                            {categories.map((category) => (
                              <div className="nav-submenu-group" key={category || "pages"}>
                                {category && <p className="nav-submenu-caption">{category}</p>}
                                <ul>
                                  {children
                                    .filter((child) => (child.category ?? "") === category)
                                    .map((child) => {
                                      const ChildIcon = ICONS[child.icon];
                                      const childCurrent = child.href === active;
                                      return (
                                        <li key={child.href}>
                                          <Link
                                            className={`nav-submenu-link${childCurrent ? " active" : ""}`}
                                            aria-current={childCurrent ? "page" : undefined}
                                            href={child.href}
                                            onClick={() => {
                                              setMobileOpen(false);
                                              setSideMenu(null);
                                            }}
                                          >
                                            <ChildIcon size={15} aria-hidden="true" />
                                            <span>{child.label}</span>
                                          </Link>
                                        </li>
                                      );
                                    })}
                                </ul>
                              </div>
                            ))}
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </nav>
        </aside>
        {!isMobile && sideMenu && sideMenuItem && typeof document !== "undefined" &&
          createPortal(
            <div
              id={`nav-submenu-${sections.find((section) => section.items.some((item) => item.href === sideMenu.href))?.id}-${sideMenu.href.replaceAll("/", "-")}`}
              className="nav-submenu nav-flyout open"
              data-nav-parent={sideMenu.href}
              role="region"
              aria-label={`${sideMenuItem.label} pages`}
              style={{ left: sideMenu.left, top: sideMenu.top }}
              onMouseLeave={(event) => {
                const target = event.relatedTarget;
                const movingToParent =
                  target instanceof Element &&
                  target.closest("[data-nav-root]")?.getAttribute("data-nav-root") === sideMenu.href;
                if (!movingToParent) setSideMenu(null);
              }}
              onBlur={(event) => {
                const target = event.relatedTarget;
                const movingToParent =
                  target instanceof Element &&
                  target.closest("[data-nav-root]")?.getAttribute("data-nav-root") === sideMenu.href;
                const movingWithinFlyout =
                  target instanceof Element &&
                  target.closest(".nav-flyout")?.getAttribute("data-nav-parent") === sideMenu.href;
                if (!movingToParent && !movingWithinFlyout) setSideMenu(null);
              }}
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  event.preventDefault();
                  setSideMenu(null);
                  document
                    .querySelector<HTMLElement>(`[data-nav-root="${sideMenu.href}"] .nav-submenu-toggle`)
                    ?.focus();
                  return;
                }
                if (event.key !== "Tab") return;
                const links = Array.from(
                  event.currentTarget.querySelectorAll<HTMLAnchorElement>("a[href]"),
                );
                const activeLink = document.activeElement;
                if (event.shiftKey && activeLink === links[0]) {
                  event.preventDefault();
                  document
                    .querySelector<HTMLElement>(`[data-nav-root="${sideMenu.href}"] .nav-submenu-toggle`)
                    ?.focus();
                } else if (!event.shiftKey && activeLink === links.at(-1)) {
                  const nav = sidebarRef.current;
                  const root = nav?.querySelector<HTMLElement>(`[data-nav-root="${sideMenu.href}"]`);
                  const focusable = Array.from(
                    nav?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [],
                  ).filter((node) => node.getClientRects().length > 0);
                  const rootToggle = root?.querySelector<HTMLElement>(".nav-submenu-toggle");
                  const index = rootToggle ? focusable.indexOf(rootToggle) : -1;
                  const next = focusable[index + 1];
                  if (next) {
                    event.preventDefault();
                    next.focus();
                  }
                }
              }}
            >
              {[...new Set(sideMenuItem.children?.map((child) => child.category ?? "") ?? [])].map(
                (category) => (
                  <div className="nav-submenu-group" key={category || "pages"}>
                    {category && <p className="nav-submenu-caption">{category}</p>}
                    <ul>
                      {sideMenuItem.children
                        ?.filter((child) => (child.category ?? "") === category)
                        .map((child) => {
                          const ChildIcon = ICONS[child.icon];
                          const childCurrent = child.href === active;
                          return (
                            <li key={child.href}>
                              <Link
                                className={`nav-submenu-link${childCurrent ? " active" : ""}`}
                                aria-current={childCurrent ? "page" : undefined}
                                href={child.href}
                                onClick={() => setSideMenu(null)}
                              >
                                <ChildIcon size={15} aria-hidden="true" />
                                <span>{child.label}</span>
                              </Link>
                            </li>
                          );
                        })}
                    </ul>
                  </div>
                ),
              )}
            </div>,
            document.body,
          )}
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
                aria-pressed={resolvedTheme === "dark"}
                onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
              >
                {resolvedTheme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
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
          <CertificatePortalBanner initial={certificateStatus} role={role} />
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
            Quick Pass Emissions <span>Management workspace</span>
          </footer>
        </div>
      </div>
    </NavRoleContext.Provider>
  );
}
