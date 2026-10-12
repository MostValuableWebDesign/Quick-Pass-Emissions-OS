import { test, expect } from "@playwright/test";
import { existsSync, readFileSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { expandGroups } from "./navigation-helpers";

const directory = process.env.E2E_PRIVATE_DIR!;
const fixtures = JSON.parse(readFileSync(path.join(directory, "navigation.json"), "utf8")) as {
  records: Record<string, string>;
};

for (const role of ["OWNER", "ADMIN"] as const) {
  test.describe(`${role} navigation`, () => {
    test.use({
      storageState: path.join(directory, role === "OWNER" ? "session.json" : `${role}.json`),
    });
    test("same-tab desktop and mobile navigation preserves current authorization", async ({
      page,
      context,
    }) => {
      test.setTimeout(240000);
      await page.goto("/dashboard");
      await expect(page).toHaveURL(/\/dashboard$/);
      for (const name of ["Today’s business snapshot", "Needs attention", "Quick actions"])
        await expect(page.getByRole("heading", { name, exact: true })).toBeVisible();
      await expect(
        page.getByRole("link", { name: "Order Certificates", exact: false }),
      ).toHaveCount(1);
      await expect(
        page.getByRole("link", { name: "Call Service & Support", exact: true }),
      ).toHaveAttribute("href", "/vendors");
      await expect(page.getByRole("link", { name: "Review payroll", exact: true })).toHaveAttribute(
        "href",
        "/payroll",
      );
      if (role === "OWNER")
        await expect(
          page.getByRole("link", { name: "Open Performance", exact: true }),
        ).toHaveAttribute("href", "/performance");
      else
        await expect(page.getByRole("link", { name: "Open Performance", exact: true })).toHaveCount(
          0,
        );
      if (role === "OWNER" && process.env.E2E_DASHBOARD_CAPTURE_DIR) {
        await page.setViewportSize({ width: 1440, height: 1100 });
        await page.screenshot({
          path: `${process.env.E2E_DASHBOARD_CAPTURE_DIR}/dashboard-desktop.png`,
          fullPage: true,
        });
      }
      const topLevelNavigation = page.getByRole("navigation", { name: "Main navigation" });
      const destinationMenus = [
        {
          parent: "Dealerships",
          parentHref: "#dealerships-menu",
          child: "Dealerships & contacts",
          childHref: "/dealerships",
        },
        {
          parent: "Employees",
          parentHref: "#employees-menu",
          child: "Employee directory",
          childHref: "/employees",
        },
      ];
      const startingUrl = page.url();
      for (const menu of destinationMenus) {
        const root = topLevelNavigation.locator(`[data-nav-root="${menu.parentHref}"]`);
        const trigger = root.getByRole("button", { name: menu.parent, exact: true });
        await expect(trigger).toBeVisible();
        await expect(root.locator(".nav-main-row > a")).toHaveCount(0);
        await trigger.hover();
        const sideMenu = page.getByRole("region", { name: `${menu.parent} pages` });
        await expect(sideMenu.getByRole("link", { name: menu.child, exact: true })).toHaveAttribute(
          "href",
          menu.childHref,
        );
        await expect(page).toHaveURL(startingUrl);
      }
      const navigation = await expandGroups(page);
      await expect(navigation).toBeVisible();
      const hrefs = await navigation
        .locator("a[href]")
        .evaluateAll((links) => links.map((link) => link.getAttribute("href")!));
      for (const href of hrefs) {
        expect(href.startsWith("/")).toBe(true);
        const response = await context.request.get(href, { maxRedirects: 0 });
        expect(response.status(), `Allowed ${role} destination ${href}`).toBe(200);
        expect(
          /NEXT_REDIRECT;|:E\{|You do not have permission for this action\./.test(
            await response.text(),
          ),
          `Allowed destination must render without a server error: ${role} ${href}`,
        ).toBe(false);
        await response.dispose();
      }
      for (const anchor of await navigation.locator("a").all())
        expect(await anchor.getAttribute("target")).not.toBe("_blank");
      const forbidden = role === "ADMIN" ? ["/overview", "/summaries", "/automation"] : [];
      for (const href of forbidden) {
        expect(hrefs).not.toContain(href);
        const response = await context.request.get(href, { maxRedirects: 0 });
        if (response.status() >= 300 && response.status() < 400)
          expect(response.headers().location).toBe("/dashboard");
        else if (response.status() === 200)
          expect(
            /NEXT_REDIRECT;(?:replace|push);\/dashboard;30[37];|You do not have permission for this action\./.test(
              await response.text(),
            ),
            `Server authorization denial for ${role} ${href}`,
          ).toBe(true);
        else
          expect(response.status(), `Server must deny ${role} access to ${href}`).toBeGreaterThan(
            399,
          );
        await response.dispose();
      }
      await expect(navigation.locator('[aria-current="page"]')).toHaveCount(1);
      await expect(
        page.locator(
          'nav[aria-label="Maintenance navigation"], nav[aria-label="Finance navigation"], nav[aria-label="Automation and reporting navigation"]',
        ),
      ).toHaveCount(0);
      await page.setViewportSize({ width: 390, height: 844 });
      await expect
        .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1))
        .toBe(true);
      if (role === "OWNER" && process.env.E2E_DASHBOARD_CAPTURE_DIR)
        await page.screenshot({
          path: `${process.env.E2E_DASHBOARD_CAPTURE_DIR}/dashboard-mobile.png`,
          fullPage: true,
        });
      const toggle = page.getByRole("button", {
        name: /^(open|close|toggle) navigation( menu)?$/i,
      });
      await toggle.click();
      await expect(toggle).toHaveAttribute("aria-expanded", "true");
      const brand = page.locator("#primary-navigation a").first();
      await expect(brand).toBeFocused();
      await page.keyboard.press("Shift+Tab");
      await expect(toggle).toBeFocused();
      await page.keyboard.press("Shift+Tab");
      expect(
        await page.evaluate(() =>
          document.getElementById("primary-navigation")?.contains(document.activeElement),
        ),
      ).toBe(true);
      await page.keyboard.press("Tab");
      await expect(toggle).toBeFocused();
      await page.keyboard.press("Tab");
      await expect(brand).toBeFocused();
      await page.keyboard.press("Escape");
      await expect(toggle).toHaveAttribute("aria-expanded", "false");
      await expect(toggle).toBeFocused();
      await toggle.click();
      const mobileNavigation = await expandGroups(page);
      await expect(mobileNavigation.locator('a[href="/dealerships"]')).toBeVisible();
      await expect(mobileNavigation.locator('a[href="/employees"]')).toBeVisible();
      const destination = role === "OWNER" ? "/payroll" : "/vendors";
      await mobileNavigation.locator(`a[href="${destination}"]`).click();
      await expect(page).toHaveURL(new RegExp(`${destination}$`));
      await expect(page.locator("main h1")).toBeVisible();
      await expect(toggle).toHaveAttribute("aria-expanded", "false");
      await page.reload();
      await expect(page.locator("main h1")).toBeVisible();
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
      ).toBe(true);
      expect(context.pages()).toHaveLength(1);
    });
  });
}

test.describe("Owner daily performance count", () => {
  test.use({ storageState: path.join(directory, "session.json") });

  test("selecting a date loads that single-day station count", async ({ page }) => {
    test.setTimeout(180000);
    await page.goto("/performance");
    await expect(page.locator("main h1")).toHaveText("Performance");
    if (process.env.E2E_PORTAL_LIVE !== "1") {
      await expect(page.getByTestId("text-today-total")).toHaveText("95");
      await expect(page.getByTestId("text-cars")).toHaveText("95");
      await expect(page.getByTestId("text-revenue")).toHaveText("$1,860");
    }
    await page.getByTestId("input-date").fill("2026-01-15");
    if (new URL(page.url()).searchParams.get("start") !== "2026-01-15")
      await page.getByTestId("button-apply-date").click();
    await expect(page).toHaveURL(/start=2026-01-15/);
    await page.reload();
    await expect(page.getByTestId("input-date")).toHaveValue("2026-01-15");
    if (process.env.E2E_PORTAL_LIVE !== "1") {
      await expect(page.getByTestId("text-cars")).toHaveText("95");
      await expect(page.getByTestId("text-revenue")).toHaveText("$1,860");
      await expect(page.getByTestId("text-pay")).toHaveText("$550");
      const employeeRows = page.getByRole("region", { name: "Employees" }).locator("tbody tr");
      await expect(employeeRows).toHaveCount(2);
      await expect(page.getByTestId("row-employee-inspector:Fixture%20One")).toContainText("$45");
      await expect(page.getByTestId("row-employee-inspector:Fixture%20Two")).toContainText("$45");
      await page.getByTestId("select-trend").selectOption("7");
      await page.getByTestId("button-apply-range").click();
      await expect(page.getByRole("region", { name: "Trend" })).toContainText("7 days");
      await page.getByTestId("select-trend").selectOption("30");
      await page.getByTestId("button-apply-range").click();
      await expect(page.getByRole("region", { name: "Trend" })).toContainText("30 days");
      await page.getByTestId("input-start").fill("2026-01-14");
      await page.getByTestId("input-end").fill("2026-01-15");
      await page.getByTestId("button-apply-range").click();
      await expect(page.getByTestId("text-cars")).toHaveText("190");
      await expect(page.getByTestId("text-revenue")).toHaveText("$3,720");
      await expect(page.getByTestId("text-pay")).toHaveText("$1,100");
      await page.getByTestId("select-employee").selectOption("inspector:Fixture%20Two");
      await page.getByTestId("button-apply-range").click();
      await expect(page.getByTestId("text-cars")).toHaveText("50");
      await expect(page.getByTestId("text-revenue")).toHaveText("$1,000");
      await expect(page.getByTestId("row-employee-inspector:Fixture%20Two")).toContainText("$90");
      await expect(page.getByTestId("text-today-total")).toHaveText("95");
      await expect(page.getByRole("region", { name: "Trend" })).toContainText(
        "line is station total",
      );
      await page.getByTestId("select-employee").selectOption("");
      await page.getByTestId("button-apply-range").click();
      await page.getByTestId("button-sort-name").click();
      const sortedRows = page.getByRole("region", { name: "Employees" }).locator("tbody tr");
      await expect(sortedRows.nth(0)).toContainText("Fixture One");
      await expect(sortedRows.nth(1)).toContainText("Fixture Two");
      const search = page.getByTestId("input-employee-filter");
      await search.fill("Fixture Two");
      await expect(sortedRows).toHaveCount(1);
      await expect(sortedRows.first()).toContainText("Fixture Two");
      await search.fill("no such fixture");
      await expect(page.getByText("No employees match that filter.")).toBeVisible();
      await search.fill("");
      await page.getByTestId("input-date").fill("2026-01-15");
      if (new URL(page.url()).searchParams.get("start") !== "2026-01-15")
        await page.getByTestId("button-apply-date").click();
      await expect(page).toHaveURL(/start=2026-01-15/);
      await page.getByTestId("select-trend").selectOption("30");
      await page.getByTestId("button-apply-date").click();
      const performanceUrl = page.url();
      await expect(page.getByTestId("button-pay-setup")).toHaveCount(0);
      await page.goto("/payroll");
      await page.getByTestId("button-pay-setup").click();
      await expect(page.getByRole("dialog")).toBeVisible();
      await expect(page.getByRole("dialog")).toContainText("Fixture One");
      await page.getByRole("dialog").getByRole("button", { name: "Day adjustments" }).click();
      await page.getByRole("dialog").getByRole("button", { name: "Add day adjustment" }).click();
      await page.getByRole("dialog").getByLabel("Date").last().fill("2026-01-15");
      await page.getByRole("dialog").getByLabel("Actual hours").last().fill("12");
      await page.getByTestId("button-save-pay").click();
      await expect(page.getByRole("dialog")).not.toBeVisible();
      await page.goto(performanceUrl);
      await expect(page.getByTestId("text-pay")).toHaveText("$596");
      await page.reload();
      await expect(page.getByTestId("text-pay")).toHaveText("$596");
      let workspace = process.cwd();
      while (
        !existsSync(path.join(workspace, "generated-artifacts")) &&
        path.dirname(workspace) !== workspace
      )
        workspace = path.dirname(workspace);
      const screenshots = path.join(workspace, "generated-artifacts");
      await mkdir(screenshots, { recursive: true });
      await page.screenshot({
        path: path.join(screenshots, "performance-dashboard-desktop.png"),
        fullPage: true,
      });
      await page.setViewportSize({ width: 390, height: 844 });
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
      ).toBe(true);
      await page.goto("/payroll");
      await expect(page.getByTestId("button-pay-setup")).toBeVisible();
      await page.getByTestId("button-pay-setup").click();
      const dialog = page.getByRole("dialog");
      await expect(dialog).toBeVisible();
      expect((await dialog.boundingBox())?.width).toBeLessThanOrEqual(390);
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
      ).toBe(true);
      await dialog.getByRole("button", { name: "Close" }).click();
      await expect(dialog).not.toBeVisible();
      await page.goto(performanceUrl);
      await page.screenshot({
        path: path.join(screenshots, "performance-dashboard-mobile.png"),
        fullPage: true,
      });
    }
    if (process.env.E2E_PORTAL_LIVE === "1") {
      await page.getByTestId("input-date").fill("2026-10-09");
      await expect(page.getByTestId("text-cars")).toHaveText("94", { timeout: 90000 });
      await expect(page.getByTestId("text-revenue")).toHaveText("$1,840");
      await page.reload();
      await expect(page.getByTestId("text-cars")).toHaveText("94");
    }
  });
});

test("record context survives refresh, browser history, and explicit return links", async ({
  page,
  context,
}) => {
  test.setTimeout(180000);
  for (const [source, record] of [
    ["/tasks?filter=overdue&page=1", `/tasks/${fixtures.records.task}`],
    ["/dealerships?q=SENTINEL", `/dealerships/${fixtures.records.dealership}`],
    ["/invoices?q=SENTINEL", `/invoices/${fixtures.records.invoice}`],
  ]) {
    await page.goto(source);
    await page.locator(`main a[href^="${record}"]`).first().click();
    await expect.poll(() => new URL(page.url()).pathname).toBe(record);
    await expect.poll(() => new URL(page.url()).searchParams.get("from")).toBe(source);
    await page.reload();
    await expect(page.locator("main h1")).toBeVisible();
    const back = page.getByRole("link", { name: /^Back to /i }).first();
    await expect(back).toHaveAttribute("href", source);
    await page.goBack();
    await expect.poll(() => new URL(page.url()).pathname + new URL(page.url()).search).toBe(source);
    await page.goForward();
    await expect.poll(() => new URL(page.url()).pathname).toBe(record);
    await back.click();
    await expect.poll(() => new URL(page.url()).pathname + new URL(page.url()).search).toBe(source);
  }
  const filteredDealers = "/dealerships?q=SENTINEL";
  await page.goto(filteredDealers);
  await page.locator(`main a[href^="/dealerships/${fixtures.records.dealership}"]`).first().click();
  await page.locator(`main a[href^="/invoices/${fixtures.records.invoice}"]`).first().click();
  const relatedReturn = page.getByRole("link", { name: /^Back to /i }).first();
  await relatedReturn.click();
  await expect
    .poll(() => new URL(page.url()).pathname)
    .toBe(`/dealerships/${fixtures.records.dealership}`);
  await expect(relatedReturn).toHaveAttribute("href", filteredDealers);
  await relatedReturn.click();
  await expect
    .poll(() => new URL(page.url()).pathname + new URL(page.url()).search)
    .toBe(filteredDealers);
  await page.goto(`/tasks/${fixtures.records.task}?from=https%3A%2F%2Funrelated.example`);
  await expect(page.getByRole("link", { name: /^Back to /i }).first()).toHaveAttribute(
    "href",
    "/tasks",
  );
  await page.goto(`/payroll/${fixtures.records.payroll}`);
  await expect(page.getByRole("link", { name: /^Back to /i }).first()).toHaveAttribute(
    "href",
    "/payroll",
  );
  expect(context.pages()).toHaveLength(1);
});

test("selected weeks survive navigation and retired accounting routes return to the dashboard", async ({
  page,
  context,
}) => {
  await page.goto("/schedule?date=2026-01-01");
  const nextWeek = page.getByRole("link", { name: /Next week/ });
  const nextWeekHref = await nextWeek.getAttribute("href");
  await nextWeek.click();
  await expect(page).toHaveURL(new URL(nextWeekHref!, page.url()).toString());
  await page.goBack();
  await expect.poll(() => new URL(page.url()).searchParams.get("date")).toBe("2026-01-01");
  await page.reload();
  await expect.poll(() => new URL(page.url()).searchParams.get("date")).toBe("2026-01-01");
  await page.goto("/finance?start=2026-01-01&end=2026-01-31");
  await expect.poll(() => new URL(page.url()).pathname).toBe("/dashboard");
  await expect(
    page.getByRole("navigation", { name: "Main navigation" }).locator('[aria-current="page"]'),
  ).toHaveCount(1);
  await page.goto("/finance/reports?start=2026-01-01&end=2026-01-31");
  await expect.poll(() => new URL(page.url()).pathname).toBe("/dashboard");
  expect(context.pages()).toHaveLength(1);
});

for (const role of ["EMPLOYEE", "BOOKKEEPER"] as const) {
  test(`${role} cannot enter any former workspace`, async ({ browser }) => {
    const context = await browser.newContext({
      storageState: path.join(directory, `${role}.json`),
    });
    try {
      const page = await context.newPage();
      for (const route of [
        "/dashboard",
        "/tasks",
        "/schedule",
        "/maintenance",
        "/vendors",
        "/reminders",
        "/payroll",
      ]) {
        await page.goto(route);
        await expect(page).toHaveURL(/\/login$/);
        await expect(page.getByRole("navigation", { name: "Main navigation" })).toHaveCount(0);
      }
    } finally {
      await context.close();
    }
  });
}
