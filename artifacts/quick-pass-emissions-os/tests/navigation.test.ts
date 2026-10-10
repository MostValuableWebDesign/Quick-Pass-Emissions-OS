import { describe, expect, it } from "vitest";
import {
  activeNavHref,
  breadcrumbs,
  matchRoute,
  navForRole,
  NAV_SECTIONS,
  returnTarget,
  safeReturnPath,
  withReturn,
} from "@/lib/navigation";

const hrefs = (role: string) => navForRole(role).flatMap((s) => s.items.map((i) => i.href));

describe("role-filtered navigation", () => {
  it.each(["EMPLOYEE", "BOOKKEEPER"])("%s has no application routes", (role) => {
    expect(navForRole(role)).toEqual([]);
    expect(safeReturnPath("/tasks", role)).toBeNull();
    expect(returnTarget("/tasks/t1", null, role)).toBeNull();
  });
  it("owner-only routes are owner-only; admin sees managers routes", () => {
    expect(hrefs("ADMIN")).not.toContain("/automation");
    expect(hrefs("ADMIN")).toContain("/settings");
    expect(hrefs("OWNER")).toEqual(
      expect.arrayContaining(["/automation", "/summaries", "/overview"]),
    );
  });
  it("unknown roles get nothing and hrefs are unique", () => {
    expect(navForRole("GUEST")).toEqual([]);
    const all = NAV_SECTIONS.flatMap((s) => s.items.map((i) => i.href));
    expect(new Set(all).size).toBe(all.length);
  });
});

describe("route matching", () => {
  it("prefers static over id routes and longest nav match", () => {
    expect(matchRoute("/tasks/templates")?.title).toBe("Task templates");
    expect(matchRoute("/tasks/abc123")?.title).toBe("Task detail");
    expect(activeNavHref("/tasks/templates", "OWNER")).toBe("/tasks/templates");
    expect(activeNavHref("/tasks/abc", "OWNER")).toBe("/tasks");
    expect(activeNavHref("/finance/reports", "ADMIN")).toBe("/finance/reports");
    expect(activeNavHref("/maintenance/plans", "ADMIN")).toBe("/maintenance/plans");
    expect(activeNavHref("/maintenance/t1", "ADMIN")).toBe("/maintenance");
    expect(matchRoute("/reminders/certification")).toBeUndefined();
    expect(activeNavHref("/tasksx", "OWNER")).toBeUndefined();
  });
  it("rejects odd id segments", () => {
    expect(matchRoute("/tasks/a/b")).toBeUndefined();
    expect(matchRoute("/invoices/" + "x".repeat(65))).toBeUndefined();
  });
  it("builds breadcrumbs for details", () => {
    expect(breadcrumbs("/invoices/i1")).toEqual([
      { label: "Dealerships & Billing" },
      { label: "Invoices & payments", href: "/invoices" },
      { label: "Invoice" },
    ]);
    expect(breadcrumbs("/payroll")).toEqual([
      { label: "Payroll" },
      { label: "Payroll & commissions" },
    ]);
  });
});

describe("return context validation", () => {
  it("accepts allowlisted relative routes with query", () => {
    expect(safeReturnPath("/tasks?filter=overdue&page=2", "ADMIN")).toBe(
      "/tasks?filter=overdue&page=2",
    );
    expect(safeReturnPath("/finance/reports?start=2025-01-01&end=2025-01-31", "ADMIN")).toBe(
      "/finance/reports?start=2025-01-01&end=2025-01-31",
    );
  });
  it.each([
    "https://evil.example/tasks",
    "//evil.example/tasks",
    "/\\evil.example",
    "javascript:alert(1)",
    "/api/payroll/1/export",
    "/login",
    "/invite?token=x",
    "/tasks/../api/x",
    "/%2e%2e/api",
    "/tasks%2fabc",
    "/tasks\n",
    "/tasks#x",
    "/unknown",
    "/tasks?" + "a".repeat(600),
    "",
  ])("rejects %s", (raw) => {
    expect(safeReturnPath(raw, "OWNER")).toBeNull();
  });
  it("rejects non-strings and role-hidden routes", () => {
    expect(safeReturnPath(undefined, "OWNER")).toBeNull();
    expect(safeReturnPath(["/tasks"], "OWNER")).toBeNull();
    expect(safeReturnPath("/payroll", "EMPLOYEE")).toBeNull();
    expect(safeReturnPath("/tasks", "BOOKKEEPER")).toBeNull();
  });
  it("withReturn encodes safe origins and drops unsafe ones", () => {
    expect(withReturn("/tasks/t1", "/dashboard", "ADMIN")).toBe("/tasks/t1?from=%2Fdashboard");
    expect(withReturn("/invoices/i1", "/finance/reports?start=2025-01-01", "OWNER")).toBe(
      "/invoices/i1?from=%2Ffinance%2Freports%3Fstart%3D2025-01-01",
    );
    expect(withReturn("/tasks/t1", "//evil", "OWNER")).toBe("/tasks/t1");
  });
  it("returnTarget uses origin, else falls back to parent list", () => {
    expect(returnTarget("/invoices/i1", "/dealerships/d1", "ADMIN")).toEqual({
      href: "/dealerships/d1",
      label: "Back to dealership account",
    });
    expect(returnTarget("/tasks/t1", null, "ADMIN")).toEqual({
      href: "/tasks",
      label: "Back to tasks",
    });
    expect(returnTarget("/tasks/t1", "https://evil", "ADMIN")?.href).toBe("/tasks");
    expect(returnTarget("/tasks/t1", "/tasks/t1", "ADMIN")?.href).toBe("/tasks");
    expect(returnTarget("/tasks", "/dashboard", "OWNER")).toBeNull();
  });
});

describe("return context with query filters and cross-record links", () => {
  it("keeps encoded slashes and URLs inside query filter values", () => {
    expect(safeReturnPath("/dealerships?q=A%2FB", "ADMIN")).toBe("/dealerships?q=A%2FB");
    expect(safeReturnPath("/invoices?q=https%3A%2F%2Fevil.example%2Fx", "OWNER")).toBe(
      "/invoices?q=https%3A%2F%2Fevil.example%2Fx",
    );
    expect(safeReturnPath("/dealerships%2Fx?q=a", "OWNER")).toBeNull();
  });
  it("keeps a validated filtered-list origin across related records", () => {
    expect(safeReturnPath("/dealerships/d1?from=%2Fdealerships%3Fq%3DA%252FB&tab=x", "OWNER")).toBe(
      "/dealerships/d1?tab=x&from=%2Fdealerships%3Fq%3DA%252FB",
    );
  });
  it("cross-record origin survives a round trip", () => {
    const href = withReturn("/invoices/i1", "/dealerships/d1?from=%2Fdealerships", "ADMIN");
    expect(href).toBe("/invoices/i1?from=%2Fdealerships%2Fd1%3Ffrom%3D%252Fdealerships");
    const from = new URL(href, "http://x").searchParams.get("from");
    expect(returnTarget("/invoices/i1", from, "ADMIN")).toEqual({
      href: "/dealerships/d1?from=%2Fdealerships",
      label: "Back to dealership account",
    });
    const filtered = withReturn("/dealerships/d1", "/dealerships?q=A%2FB", "OWNER");
    const back = new URL(filtered, "http://x").searchParams.get("from");
    expect(returnTarget("/dealerships/d1", back, "OWNER")?.href).toBe("/dealerships?q=A%2FB");
  });
  it("does not add context to non-detail targets", () => {
    expect(withReturn("/dashboard", "/tasks", "OWNER")).toBe("/dashboard");
  });
  it("drops unsafe nested origins and bounds return chains", () => {
    expect(safeReturnPath("/dealerships/d1?from=https%3A%2F%2Fevil.example&q=x", "OWNER")).toBe(
      "/dealerships/d1?q=x",
    );
    let origin = "/dealerships?q=filtered";
    for (let index = 0; index < 7; index++)
      origin = `/dealerships/d${index}?from=${encodeURIComponent(origin)}`;
    const safe = safeReturnPath(origin, "OWNER");
    expect(safe === null || safe.length <= 512).toBe(true);
    const dealer = withReturn("/dealerships/d1", "/dealerships?q=filtered", "OWNER");
    const invoice = withReturn("/invoices/i1", dealer, "OWNER");
    const dealerReturn = new URL(invoice, "http://x").searchParams.get("from");
    const listReturn = new URL(dealerReturn!, "http://x").searchParams.get("from");
    expect(returnTarget("/dealerships/d1", listReturn, "OWNER")?.href).toBe(
      "/dealerships?q=filtered",
    );
  });
});
