import { describe, expect, it } from "vitest";
import {
  activeNavHref,
  allNavItems,
  breadcrumbs,
  matchRoute,
  navForRole,
  NAV_SECTIONS,
  returnTarget,
  safeReturnPath,
  withReturn,
} from "@/lib/navigation";

const hrefs = (role: string) => allNavItems(role).map((item) => item.href);

describe("role-filtered navigation", () => {
  it.each(["EMPLOYEE", "BOOKKEEPER"])("%s has no application routes", (role) => {
    expect(navForRole(role)).toEqual([]);
    expect(safeReturnPath("/tasks", role)).toBeNull();
    expect(returnTarget("/tasks/t1", null, role)).toBeNull();
  });
  it("removes the Team & Tasks section from the navigation for all roles", () => {
    for (const role of ["OWNER", "ADMIN", "MANAGER", "BOOKKEEPER", "EMPLOYEE"]) {
      const sections = navForRole(role);
      expect(sections.some((s) => s.id === "team" || s.label === "Team & Tasks")).toBe(false);
      expect(sections.flatMap((s) => s.items).map((item) => item.href)).not.toEqual(
        expect.arrayContaining(["/tasks", "/schedule", "/tasks/templates"]),
      );
    }
    // Pages/data remain intact and may still be opened directly by an authorized user.
    expect(matchRoute("/tasks")).toBeDefined();
    expect(matchRoute("/employees")).toBeDefined();
  });
  it("owner-only routes are owner-only; admin sees managers routes", () => {
    expect(hrefs("ADMIN")).not.toContain("/automation");
    expect(hrefs("ADMIN")).toContain("/settings");
    expect(hrefs("OWNER")).toEqual(
      expect.arrayContaining(["/automation", "/finance/reports", "/overview"]),
    );
    expect(hrefs("OWNER")).not.toContain("/reports");
    expect(hrefs("OWNER")).not.toContain("/summaries");
    expect(matchRoute("/reports")?.title).toBe("Operational reports");
    expect(matchRoute("/summaries")?.title).toBe("Summary archive");
    expect(matchRoute("/summaries/example-id")?.title).toBe("Summary");
  });
  it("omits the retired Product roadmap tab and route", () => {
    expect(hrefs("OWNER")).not.toContain("/roadmap");
    expect(matchRoute("/roadmap")).toBeUndefined();
  });
  it("keeps Business settings under the Settings side-menu button", () => {
    const sections = navForRole("OWNER");
    const settings = sections.find((section) => section.id === "settings")!;
    expect(settings.label).toBe("Settings");
    expect(settings.items).toHaveLength(1);
    const settingsMenu = settings.items[0];
    expect(settingsMenu.label).toBe("Settings");
    expect(settingsMenu.menuOnly).toBe(true);
    expect(matchRoute(settingsMenu.href)).toBeUndefined();
    expect(allNavItems("OWNER").some((item) => item.menuOnly)).toBe(false);
    expect(settingsMenu.children?.map((item) => item.href)).toEqual([
      "/settings",
      "/reminders",
      "/notifications",
      "/settings/account",
      "/automation",
    ]);
    expect(settingsMenu.children?.[0].label).toBe("Business settings");
    expect(settingsMenu.children?.[0].category).toBe("Business operations");
    expect(matchRoute("/settings")?.section).toBe("Settings");
    expect(matchRoute("/settings")?.title).toBe("Business settings");
    expect(breadcrumbs("/settings")).toEqual([
      { label: "Settings" },
      { label: "Business settings" },
    ]);
    expect(sections.some((section) => section.id === "business-setup")).toBe(false);
    expect(matchRoute("/settings/import")).toBeUndefined();
    expect(matchRoute("/settings/station-data")).toBeUndefined();
    expect(hrefs("ADMIN")).toContain("/settings/account");
    expect(hrefs("OWNER")).not.toContain("/settings/import");
    expect(hrefs("ADMIN")).not.toContain("/settings/station-data");
    expect(matchRoute("/performance/settings")).toBeUndefined();
  });
  it("groups reminder, notification, and account links in the Settings side menu", () => {
    const sections = navForRole("OWNER");
    const overview = sections.find((section) => section.id === "overview")!;
    expect(overview.items.map((item) => item.href)).not.toContain("/reminders");
    expect(overview.items.map((item) => item.href)).not.toContain("/notifications");
    const settings = sections.find((section) => section.id === "settings")!;
    const destinations = settings.items[0].children ?? [];
    expect(destinations.map((item) => item.href)).toContain("/settings");
    expect(destinations.map((item) => item.href)).toContain("/reminders");
    expect(destinations.map((item) => item.href)).toContain("/notifications");
    expect(destinations.map((item) => item.href)).toContain("/settings/account");
    expect(
      destinations
        .filter((item) => item.category === "Reminders & notifications")
        .map((item) => item.href),
    ).toEqual(["/reminders", "/notifications"]);
    expect(destinations.find((item) => item.href === "/settings/account")?.category).toBe(
      "Account & security",
    );
    expect(allNavItems("ADMIN").some((item) => item.href === "/settings/import")).toBe(false);
  });
  it("nests the dealership directory, invoices, and payments under a menu-only Dealerships heading", () => {
    const emissions = navForRole("OWNER").find((section) => section.id === "emissions")!;
    expect(emissions.items.map((item) => item.href)).not.toContain("/invoices");
    expect(emissions.items.map((item) => item.href)).not.toContain("/dealerships");
    const dealers = emissions.items.find((item) => item.label === "Dealerships")!;
    expect(dealers.menuOnly).toBe(true);
    expect(dealers.children?.map((item) => item.href)).toEqual([
      "/dealerships",
      "/invoices",
      "/invoices?view=payments",
    ]);
    expect(dealers.children?.[0].label).toBe("Dealerships & contacts");
    expect(matchRoute(dealers.href)).toBeUndefined();
    expect(activeNavHref("/invoices", "OWNER", "view=payments&q=test")).toBe(
      "/invoices?view=payments",
    );
    expect(activeNavHref("/invoices", "OWNER")).toBe("/invoices");
    expect(activeNavHref("/dealerships", "OWNER")).toBe("/dealerships");
    expect(safeReturnPath("/invoices?view=payments", "ADMIN")).toBe("/invoices?view=payments");
  });
  it("gives management a separate Security category and camera route", () => {
    for (const role of ["OWNER", "ADMIN"]) {
      const security = navForRole(role).find((section) => section.id === "security");
      expect(security?.label).toBe("Security");
      expect(security?.items.map((item) => item.href)).toEqual(["/security", "/security/doors"]);
      expect(activeNavHref("/security", role)).toBe("/security");
      expect(safeReturnPath("/security", role)).toBe("/security");
    }
    expect(breadcrumbs("/security")).toEqual([{ label: "Security" }, { label: "Camera viewing" }]);
    for (const role of ["EMPLOYEE", "BOOKKEEPER", "GUEST"]) {
      expect(hrefs(role)).not.toContain("/security");
      expect(safeReturnPath("/security", role)).toBeNull();
    }
  });
  it("unknown roles get nothing and hrefs are unique", () => {
    expect(navForRole("GUEST")).toEqual([]);
    const all = NAV_SECTIONS.flatMap((s) => s.items.map((i) => i.href));
    expect(new Set(all).size).toBe(all.length);
  });
  it("separates emissions, car wash and shared tools without exposing retired tabs", () => {
    for (const role of ["OWNER", "ADMIN"]) {
      const sections = navForRole(role);
      const emissions = sections.find((s) => s.id === "emissions")!;
      const carwash = sections.find((s) => s.id === "carwash")!;
      const shared = sections.find((s) => s.id === "shared-business")!;
      const employees = shared.items.find((item) => item.label === "Employees")!;
      expect(shared.label).toBe("Business");
      expect(emissions.items.map((i) => i.href)).toEqual(
        expect.arrayContaining(["/certificates", "#dealerships-menu"]),
      );
      expect(carwash.items.map((i) => i.href)).toEqual(["/carwash", "/equipment"]);
      expect(shared.items.map((i) => i.href)).toEqual([
        "#employees-menu",
        "/vendors",
        "/finance",
        "#marketing-menu",
      ]);
      expect(employees.menuOnly).toBe(true);
      expect(employees.children?.map((item) => item.href)).toEqual(["/employees", "/payroll"]);
      expect(employees.children?.[0].label).toBe("Employee directory");
      expect(allNavItems(role).find((item) => item.href === "/employees")).toBeDefined();
      expect(allNavItems(role).find((item) => item.href === "/payroll")?.parent).toBe("/employees");
      for (const path of ["/maintenance", "/maintenance/plans", "/chemicals", "/rentals"]) {
        expect(hrefs(role)).not.toContain(path);
        expect(matchRoute(path)).toBeDefined();
        expect(safeReturnPath(path, role)).toBe(path);
        expect(activeNavHref(path, role)).toBeUndefined();
      }
    }
    expect(returnTarget("/rentals/r1", null, "OWNER")?.href).toBe("/rentals");
  });
});

describe("route matching", () => {
  it("prefers static over id routes and longest nav match", () => {
    expect(matchRoute("/tasks/templates")?.title).toBe("Task templates");
    expect(matchRoute("/tasks/abc123")?.title).toBe("Task detail");
    expect(activeNavHref("/tasks/templates", "OWNER")).toBeUndefined();
    expect(activeNavHref("/tasks/abc", "OWNER")).toBeUndefined();
    expect(activeNavHref("/finance/reports", "ADMIN")).toBe("/finance/reports");
    expect(activeNavHref("/maintenance/plans", "ADMIN")).toBeUndefined();
    expect(activeNavHref("/maintenance/t1", "ADMIN")).toBeUndefined();
    expect(matchRoute("/reminders/certification")).toBeUndefined();
    expect(activeNavHref("/tasksx", "OWNER")).toBeUndefined();
  });
  it("rejects odd id segments", () => {
    expect(matchRoute("/tasks/a/b")).toBeUndefined();
    expect(matchRoute("/invoices/" + "x".repeat(65))).toBeUndefined();
  });
  it("builds breadcrumbs for details", () => {
    expect(breadcrumbs("/invoices/i1")).toEqual([
      { label: "Emissions" },
      { label: "Invoices", href: "/invoices" },
      { label: "Invoice" },
    ]);
    expect(breadcrumbs("/payroll")).toEqual([
      { label: "Business" },
      { label: "Employee directory", href: "/employees" },
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
