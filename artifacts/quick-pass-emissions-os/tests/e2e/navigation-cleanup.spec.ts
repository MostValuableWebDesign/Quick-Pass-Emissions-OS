import { expect, test } from "@playwright/test";
import { login } from "./workflow-helpers";

test("retired finance screens are removed and Automation is independent of Settings", async ({
  page,
}) => {
  await login(page, "owner@example.test");
  await page.goto("/dashboard");
  const nav = page.getByRole("navigation", { name: "Main navigation" });
  await page.screenshot({
    path: "../../generated-artifacts/navigation-cleanup.png",
    fullPage: true,
  });
  await expect(nav.locator('[data-nav-section="automation"]')).toBeVisible();
  await expect(nav.getByText("AUTOMATION", { exact: true })).toBeVisible();
  await expect(nav.getByRole("link", { name: "Operational finance", exact: true })).toHaveCount(0);
  await expect(nav.getByRole("link", { name: "Finance reports", exact: true })).toHaveCount(0);
  const automation = nav.getByRole("button", { name: "Automation settings", exact: true });
  await expect(automation).toHaveAttribute("aria-expanded", "false");
  await expect(nav.getByRole("link", { name: "Automation settings", exact: true })).toHaveCount(0);
  await automation.click();
  const schedules = page.getByRole("link", { name: "Schedules", exact: true });
  await expect(schedules).toBeVisible();
  await schedules.click();
  await expect(page.getByRole("heading", { name: "Schedules", exact: true })).toBeVisible();
  await automation.click();
  await page.getByRole("link", { name: "Reminder policies", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Reminder policies", exact: true })).toBeVisible();
  await automation.click();
  await page.getByRole("link", { name: "Daily owner email", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Daily owner email", exact: true })).toBeVisible();
  for (const path of ["/finance", "/finance/reports?start=2026-01-01&end=2026-01-31"]) {
    await page.goto(path);
    await expect.poll(() => new URL(page.url()).pathname).toBe("/dashboard");
  }
  await page.goto("/reports");
  await expect(page.getByRole("heading", { name: "Financial reports", exact: true })).toHaveCount(
    0,
  );
  await expect(page.locator('a[href^="/finance"], a[href^="/api/finance/export"]')).toHaveCount(0);
  await page.goto("/dashboard");
  await page.screenshot({
    path: "../../generated-artifacts/navigation-cleanup.png",
    fullPage: true,
  });
});
