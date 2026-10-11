import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import path from "node:path";
import { mkdir } from "node:fs/promises";
import { businessDate } from "../../src/lib/time";
import * as certificates from "../../src/modules/certificates/service";

const portal = "https://gadashboard.com/Purchasing/Purchasing.aspx";
const directory = process.env.E2E_PRIVATE_DIR!;
const db = new PrismaClient();
const snapshot = async () =>
  JSON.stringify(
    await Promise.all([
      db.certificatePurchase.findMany({ orderBy: { id: "asc" } }),
      db.certificateStock.findMany(),
      db.certificateMovement.findMany({ orderBy: { id: "asc" } }),
      db.notification.findMany({ orderBy: { id: "asc" } }),
      db.automationDelivery.findMany({ orderBy: { id: "asc" } }),
      db.actionReminder.findMany({ orderBy: { id: "asc" } }),
      db.auditLog.findMany({ orderBy: { id: "asc" } }),
    ]),
  );

test.beforeAll(async () => {
  const owner = await db.user.findFirstOrThrow({ where: { role: "OWNER" } });
  const admin = await db.user.findFirstOrThrow({ where: { role: "ADMIN" } });
  const today = businessDate();
  await certificates.saveCertificateSettings(owner.id, {
    minimumOrder: 300,
    reorderPoint: 100,
    leadDays: 3,
    windowDays: 7,
    reason: "Disposable portal-link fixture only",
  });
  await certificates.reconcileStock(owner.id, {
    observed: 50,
    version: 0,
    date: today,
    reference: "portal-link-opening",
    reason: "Disposable physical-count fixture",
  });
  const purchase = await certificates.requestPurchase(owner.id, {
    quantity: 300,
    reason: "Disposable independent-approval fixture",
  });
  await certificates.reviewPurchase(admin.id, {
    id: purchase.id,
    decision: "APPROVED",
    reason: "Disposable separate approval",
  });
  await db.notification.create({
    data: { key: "portal-link-alert", userId: owner.id, title: "Disposable unrelated alert" },
  });
});
test.afterAll(async () => db.$disconnect());

for (const role of ["OWNER", "ADMIN", "BOOKKEEPER", "EMPLOYEE"] as const) {
  test.describe(role, () => {
    test.use({
      storageState: path.join(directory, role === "OWNER" ? "session.json" : `${role}.json`),
    });
    test("manual portal navigation retains roles, stock, purchases and alerts", async ({
      page,
      context,
    }) => {
      test.setTimeout(180000);
      // No request reaches the real portal. Simulate login redirecting away from purchasing.
      await context.route("https://gadashboard.com/**", async (route) => {
        await route.fulfill({
          contentType: "text/html",
          body: "<h1>Controlled portal destination</h1>",
        });
      });
      const before = await snapshot();
      await page.goto("/certificates");
      const action = page.getByRole("link", { name: /Order Certificates/ }).first();
      if (role === "EMPLOYEE") {
        await expect(action).toHaveCount(0);
        await expect(
          page.getByRole("heading", { name: "Purchase history · latest 100" }),
        ).toHaveCount(0);
        expect(await page.content()).toMatch(/You do not have permission|\/dashboard/);
      } else {
        await expect(action).toBeVisible();
        await expect(action).toHaveAttribute("href", portal);
        await expect(action).toHaveAttribute("target", "_blank");
        await expect(action).toHaveAttribute("rel", "noopener noreferrer");
        const parentURL = page.url();
        // Reach the native anchor using Tab, then activate using Enter, not a popup script.
        await page.locator("body").click({ position: { x: 1, y: 1 } });
        let reached = false;
        for (let n = 0; n < 100; n++) {
          await page.keyboard.press("Tab");
          reached = await action.evaluate((a) => a === document.activeElement);
          if (reached) break;
        }
        expect(reached).toBe(true);
        const [tab] = await Promise.all([
          context.waitForEvent("page"),
          page.keyboard.press("Enter"),
        ]);
        await expect(tab).toHaveURL(portal);
        expect(await tab.evaluate(() => window.opener === null)).toBe(true);
        // Controlled navigation stands in for an unverified portal post-login redirect.
        // Redirect chains may bypass route interception; never send even a GET to the portal.
        await tab.goto("https://gadashboard.com/mock-login");
        await expect(tab).toHaveURL("https://gadashboard.com/mock-login");
        expect(page.url()).toBe(parentURL);
        await tab.close();
        const [reopened] = await Promise.all([context.waitForEvent("page"), action.click()]);
        await expect(reopened).toHaveURL(portal);
        await reopened.close();
        expect(await snapshot()).toBe(before);
        await expect(
          page.getByRole("link", { name: "Review purchase requests & order records", exact: true }),
        ).toHaveCount(0);
        await expect(page.locator("details#records")).toHaveCount(0);
        expect(context.pages()).toHaveLength(1);
        const screenshots = path.resolve("../../generated-artifacts/certificate-order");
        await mkdir(screenshots, { recursive: true });
        await page.goto("/certificates");
        await page.screenshot({ path: path.join(screenshots, `${role}-desktop.jpg`) });
        await page.setViewportSize({ width: 390, height: 844 });
        await expect(action).toBeVisible();
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
          true,
        );
        await page.screenshot({ path: path.join(screenshots, `${role}-mobile.jpg`) });
      }
      await page.goto("/dashboard");
      await expect(page.getByRole("link", { name: /Order Certificates/ })).toHaveCount(
        role === "OWNER" || role === "ADMIN" ? 1 : 0,
      );
      if (role === "OWNER") {
        await page.goto("/overview");
        await expect(page.getByRole("link", { name: /Order Certificates/ })).toHaveCount(1);
      }
      for (const href of ["/notifications", "/reminders"]) {
        await page.goto(href);
        await expect(page.getByRole("link", { name: /Order Certificates/ })).toHaveCount(0);
      }
      expect(await snapshot()).toBe(before);
    });
  });
}
