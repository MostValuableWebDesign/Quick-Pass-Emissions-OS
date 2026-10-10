"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { useTheme } from "next-themes";
import { createAuthClient } from "better-auth/react";
import {
  LayoutDashboard,
  CheckCheck,
  CalendarDays,
  Users,
  Bell,
  Settings,
  PanelLeftClose,
  Menu,
  Moon,
  LogOut,
  ArrowUpRight,
  ShieldCheck,
  CircleDot,
  Wallet,
  Package,
  Wrench,
  Car,
  KeyRound,
} from "lucide-react";
import { Button } from "./ui/button";
const authClient = createAuthClient();
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
  const router = useRouter();
  const [collapsed, setCollapsed] = useState(false);
  const [mobile, setMobile] = useState(false);
  const { resolvedTheme, setTheme } = useTheme();
  const manager = ["OWNER", "ADMIN"].includes(role);
  const links = [
    { href: "/dashboard", label: "Overview", icon: LayoutDashboard },
    ...(role !== "BOOKKEEPER"
      ? [
          { href: "/tasks", label: "My tasks", icon: CheckCheck },
          { href: "/schedule", label: "Schedule", icon: CalendarDays },
        ]
      : []),
    ...(manager ? [{ href: "/employees", label: "Employees", icon: Users }] : []),
    ...(["OWNER", "ADMIN", "BOOKKEEPER"].includes(role)
      ? [
          { href: "/payroll", label: "Payroll & commissions", icon: Wallet },
          { href: "/certificates", label: "Certificates", icon: Package },
        ]
      : []),
    ...(manager ? [{ href: "/carwash", label: "Carwash & bays", icon: Car }] : []),
    ...(role !== "BOOKKEEPER"
      ? [{ href: "/maintenance", label: "Maintenance", icon: Wrench }]
      : []),
    ...(["OWNER", "ADMIN", "BOOKKEEPER"].includes(role)
      ? [{ href: "/rentals", label: "Detailing rentals", icon: KeyRound }]
      : []),
    { href: "/notifications", label: "Notifications", icon: Bell },
    { href: "/account/password", label: "Account & password", icon: ShieldCheck },
    ...(manager ? [{ href: "/settings", label: "Settings & audit", icon: Settings }] : []),
  ];
  return (
    <div className={`app ${collapsed ? "collapsed" : ""}`}>
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <aside className={`sidebar ${mobile ? "open" : ""}`}>
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
        <p className="nav-caption nav-label">WORKSPACE</p>
        <nav aria-label="Main navigation">
          {links.map((link) => (
            <Link
              title={link.label}
              onClick={() => setMobile(false)}
              className={path.startsWith(link.href) ? "nav-link active" : "nav-link"}
              aria-current={path.startsWith(link.href) ? "page" : undefined}
              href={link.href}
              key={link.href}
            >
              <link.icon size={19} />
              <span className="nav-label">{link.label}</span>
            </Link>
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
          <Link href="/roadmap">
            Product roadmap <ArrowUpRight size={15} />
          </Link>
        </div>
      </aside>
      <div className="main-wrap">
        <header className="topbar">
          <div className="topbar-left">
            <Button
              variant="ghost"
              className="desktop-toggle"
              aria-label="Collapse navigation"
              onClick={() => setCollapsed(!collapsed)}
            >
              <PanelLeftClose size={20} />
            </Button>
            <Button
              variant="ghost"
              className="mobile-toggle"
              aria-label="Toggle navigation"
              onClick={() => setMobile(!mobile)}
            >
              <Menu size={20} />
            </Button>
            <span className="breadcrumb">
              Workspace <span>/</span>{" "}
              {links.find((l) => path.startsWith(l.href))?.label ?? "Operations"}
            </span>
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
        <main id="main">{children}</main>
        <footer className="page-footer">
          Quick Pass Business OS <span>Phases 1–3 · Business workspace</span>
        </footer>
      </div>
    </div>
  );
}
