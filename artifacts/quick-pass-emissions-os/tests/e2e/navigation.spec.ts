import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
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
      const destination = role === "OWNER" ? "/payroll" : "/maintenance";
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

test("selected weeks and report dates survive navigation, refresh and Back/Forward", async ({
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
  await page.getByRole("link", { name: "Export records", exact: true }).click();
  await expect.poll(() => new URL(page.url()).pathname).toBe("/finance/reports");
  await expect.poll(() => new URL(page.url()).searchParams.get("start")).toBe("2026-01-01");
  await expect.poll(() => new URL(page.url()).searchParams.get("end")).toBe("2026-01-31");
  await expect(
    page.getByRole("navigation", { name: "Main navigation" }).locator('[aria-current="page"]'),
  ).toHaveCount(1);
  await page.reload();
  await expect(page.locator('main input[name="start"]')).toHaveValue("2026-01-01");
  await expect(page.locator('main input[name="end"]')).toHaveValue("2026-01-31");
  await page.goBack();
  await expect.poll(() => new URL(page.url()).pathname).toBe("/finance");
  await page.goForward();
  await expect.poll(() => new URL(page.url()).pathname).toBe("/finance/reports");
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
