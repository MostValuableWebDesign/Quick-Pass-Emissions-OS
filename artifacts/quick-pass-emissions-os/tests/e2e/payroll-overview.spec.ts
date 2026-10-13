import { expect, test } from "@playwright/test";
import { login } from "./workflow-helpers";

test("owner can select a pay day and range without a transaction history panel", async ({ page }) => {
  await login(page, "owner@example.test");
  await page.goto("/payroll");
  const overview = page.getByRole("region", { name: "Employee pay overview" });
  await expect(overview).toBeVisible();
  await expect(overview.getByRole("table", { name: "Employee pay summary" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Pay transaction history" })).toHaveCount(0);

  await overview.getByRole("button", { name: "Date range" }).click();
  await overview.getByLabel("Start date").fill("2026-10-05");
  await overview.getByLabel("End date").fill("2026-10-06");
  await overview.getByRole("button", { name: "Apply" }).click();
  await expect(page).toHaveURL(/start=2026-10-05.*end=2026-10-06/);
  await expect(overview.getByText("Selected range: 2026-10-05 — 2026-10-06")).toBeVisible();
  await expect(overview.getByRole("columnheader", { name: "Commission · range / weekly" })).toBeVisible();

  await overview.getByRole("button", { name: "Single day" }).click();
  await overview.getByLabel("Date", { exact: true }).fill("2026-10-05");
  await overview.getByRole("button", { name: "Apply" }).click();
  await expect(page).toHaveURL(/start=2026-10-05.*end=2026-10-05/);
  await expect(overview.getByText("Selected day: 2026-10-05")).toBeVisible();
  await expect(overview.getByRole("columnheader", { name: "Commission · daily / weekly" })).toBeVisible();
});
