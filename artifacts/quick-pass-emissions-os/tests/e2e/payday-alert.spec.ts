import { paydayCalendar } from "../../src/modules/payroll/payday-rules";
import { PrismaClient } from "@prisma/client";
import { test, expect } from "@playwright/test";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { assertOwnedDatabase } from "../../scripts/e2e-safety.mjs";
test("payday banner changes urgency and acknowledgement only hides the current account's day", async ({
  page,
  browser,
}) => {
  assertOwnedDatabase(process.env);
  if (process.env.E2E_PAYDAY_ONLY !== "1") {
    // The default suite keeps its real clock and normal auth/session policy.
    const expected = paydayCalendar();
    await page.goto("/dashboard");
    const current = page.getByTestId("banner-payday");
    if (expected.alert) {
      await expect(current).toHaveAttribute("data-tone", expected.alert.tone);
      await current.getByRole("button", { name: "Acknowledge for today", exact: true }).click();
      await expect(current).toHaveCount(0);
      await page.reload();
      await expect(current).toHaveCount(0);
    } else await expect(current).toHaveCount(0);
    return;
  }
  const file = path.join(process.env.E2E_PRIVATE_DIR!, "payday-clock.txt");
  const original = await readFile(file, "utf8");
  const banner = page.getByTestId("banner-payday");
  async function capture(name: string) {
    if (process.env.E2E_PAYDAY_ONLY !== "1" || !process.env.E2E_PAYDAY_CAPTURE_DIR) return;
    await mkdir(process.env.E2E_PAYDAY_CAPTURE_DIR, { recursive: true });
    await banner.screenshot({ path: path.join(process.env.E2E_PAYDAY_CAPTURE_DIR, `${name}.png`) });
  }
  // Advancing the synthetic calendar must not expire the owned fixture's 12-hour sessions.
  // Production session policy is unchanged, and original timestamps are restored below.
  const db = new PrismaClient();
  const sessions = await db.session.findMany({
    select: { id: true, expiresAt: true, updatedAt: true },
  });
  await db.session.updateMany({
    data: {
      expiresAt: new Date("2027-01-01T00:00:00Z"),
      updatedAt: new Date("2027-01-01T00:00:00Z"),
    },
  });
  try {
    await writeFile(file, "2026-10-17T16:00:00Z");
    await page.goto("/dashboard");
    await expect(banner).toHaveAttribute("data-tone", "yellow");
    await expect(banner).toContainText("Payroll is due in 2 days");
    await expect(banner).toHaveCSS("background-color", "rgb(255, 248, 219)");
    await capture("yellow-desktop");
    await banner.getByRole("button", { name: "Acknowledge for today", exact: true }).click();
    await expect(banner).toHaveCount(0);
    await page.reload();
    await expect(banner).toHaveCount(0);
    await page.goto("/payroll");
    await expect(banner).toHaveCount(0);
    const manager = await browser.newContext({
      baseURL: new URL(page.url()).origin,
      storageState: path.join(process.env.E2E_PRIVATE_DIR!, "ADMIN.json"),
    });
    try {
      const other = await manager.newPage();
      await other.goto("/dashboard");
      await expect(other.getByTestId("banner-payday")).toHaveAttribute("data-tone", "yellow");
    } finally {
      await manager.close();
    }
    await writeFile(file, "2026-10-18T16:00:00Z");
    // A dismissed banner returns on a new day even when the existing tab stays open.
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await expect(banner).toHaveAttribute("data-tone", "orange");
    await expect(banner).toContainText("Payroll is due tomorrow");
    await expect(banner).toHaveCSS("background-color", "rgb(255, 240, 223)");
    await capture("orange-desktop");
    await banner.getByRole("button", { name: "Acknowledge for today", exact: true }).click();
    await expect(banner).toHaveCount(0);
    await writeFile(file, "2026-10-19T16:00:00Z");
    await page.reload();
    await expect(banner).toHaveAttribute("data-tone", "red");
    await expect(banner).toContainText("Today is payday");
    await expect(banner).toHaveCSS("background-color", "rgb(254, 238, 238)");
    await banner.getByRole("link", { name: "Review payroll", exact: true }).click();
    await expect(page).toHaveURL(/\/payroll$/);
    await expect(banner).toBeVisible();
    await page.setViewportSize({ width: 390, height: 844 });
    await capture("red-phone");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
      true,
    );
    await banner.getByRole("button", { name: "Acknowledge for today", exact: true }).click();
    await expect(banner).toHaveCount(0);
    await page.reload();
    await expect(banner).toHaveCount(0);
    await writeFile(file, "2026-10-20T16:00:00Z");
    await page.reload();
    await expect(banner).toHaveCount(0);
    await writeFile(file, "2026-10-24T16:00:00Z");
    await page.reload();
    await expect(banner).toHaveAttribute("data-tone", "yellow");
  } finally {
    await writeFile(file, original);
    for (const session of sessions)
      await db.session.update({
        where: { id: session.id },
        data: { expiresAt: session.expiresAt, updatedAt: session.updatedAt },
      });
    await db.$disconnect();
  }
});
