import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import path from "node:path";
async function fixture() {
  return JSON.parse(
    await readFile(path.join(process.env.E2E_PRIVATE_DIR!, "navigation.json"), "utf8"),
  ) as {
    station: { date: string; source: string; wrongStation: string; employeeName: string };
  };
}
test("station report → explicit identity → coverage → count replacement, without implicit payroll or money", async ({
  page,
}) => {
  const { station: s } = await fixture();
  await page.goto("/settings");
  await expect(page.getByRole("heading", { name: "Business operating days" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Station settings" })).toBeVisible();
  await expect(page.getByText(/do not change Business operating days/)).toBeVisible();
  await expect(page.getByRole("heading", { name: "Operations scheduler" })).toHaveCount(0);
  await expect(page.getByText("Operations, connected.", { exact: true })).toHaveCount(0);

  await page.goto("/performance");
  await expect(page.getByRole("heading", { name: "Station performance" })).toBeVisible();
  await expect(page.getByText(/Insufficient data/, { exact: false }).first()).toBeVisible();
  await page.goto(`/performance/settings?date=${s.date}`);
  await expect(page.getByRole("heading", { name: "Station settings" })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Issued By mappings" })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Outcome rules & prices" })).toHaveCount(0);
  const importForm = page.locator("form").filter({ has: page.locator('input[name="report"]') });
  if (process.env.E2E_STATION_ONLY !== "1") {
    await importForm.locator('input[name="report"]').setInputFiles(s.source);
    await importForm.getByLabel("Reason", { exact: true }).fill("Synthetic all-page fixture");
    await importForm.getByRole("button", { name: "Import report", exact: true }).click();
    await expect(importForm.getByRole("status")).toContainText("Imported 1 new review rows");
  }
  await importForm.locator('input[name="report"]').setInputFiles(s.source);
  await importForm
    .getByLabel("Reason", { exact: true })
    .fill("Synthetic repeated source, fields reset after success");
  await importForm.getByRole("button", { name: "Import report", exact: true }).click();
  await expect(importForm.getByRole("status")).toContainText("skipped 1 exact repeats");
  await importForm.locator('input[name="report"]').setInputFiles(s.wrongStation);
  await importForm.getByLabel("Reason", { exact: true }).fill("Synthetic station mismatch");
  await importForm.getByRole("button", { name: "Import report", exact: true }).click();
  await expect(importForm.getByRole("status")).toContainText("configured station");
  await page.goto(`/performance?preset=custom&start=${s.date}&end=${s.date}`);
  await expect(page.getByText("pending identity", { exact: true }).first()).toBeVisible();
  await page.getByRole("link", { name: "Details", exact: true }).first().click();
  const review = page.locator("form").filter({ has: page.locator('select[name="disposition"]') });
  await review.locator('select[name="disposition"]').selectOption("RETAIL");
  await review.locator('select[name="eligibility"]').selectOption("RULE");
  await review
    .getByLabel("Reason", { exact: true })
    .fill("Synthetic distinct test and retail fee exception confirmed");
  await review.getByRole("button").click();
  await expect(review.getByRole("status")).toContainText("Saved");
  await page.goto(`/performance/settings?date=${s.date}`);
  const coverage = page
    .locator("form")
    .filter({ has: page.locator('input[name="expectedRows"]') })
    .first();
  await coverage.getByLabel("Portal total for these dates (all pages)").fill("1");
  await coverage.getByLabel("Reason", { exact: true }).fill("Synthetic portal total compared");
  await coverage.getByRole("button").click();
  await expect(coverage.getByRole("status")).toContainText("Saved");
  const count = page
    .locator("form")
    .filter({ has: page.locator('input[name="expectedVersion"]') })
    .filter({
      has: page.getByRole("button", { name: `Reconcile ${s.employeeName}`, exact: true }),
    });
  await count
    .locator('input[name="reason"]')
    .fill("Synthetic replacement, requires independent approval");
  await count.getByRole("button").click();
  await expect(count.getByRole("status")).toContainText("Saved");
  await page.goto(`/performance?preset=custom&start=${s.date}&end=${s.date}`);
  await expect(page.getByText("$25.01 USD", { exact: true }).first()).toBeVisible();
  await expect(page.getByText(/No payroll period/).first()).toBeVisible();
  const response = await page.request.get(`/api/performance/export?start=${s.date}&end=${s.date}`);
  expect(response.status()).toBe(200);
  const csv = await response.text();
  expect(csv).toContain("0001");
  expect(csv).not.toContain("1SYNTHETIC0000001");
  expect(csv).not.toContain('SYN000"');
});
test("station pages, evidence and export deny employee/admin/bookkeeper and expired sessions", async ({
  browser,
  baseURL,
}) => {
  const { station: s } = await fixture();
  for (const role of ["EMPLOYEE", "ADMIN", "BOOKKEEPER", "PUBLIC"]) {
    const context = await browser.newContext({
      baseURL,
      storageState:
        role === "PUBLIC"
          ? { cookies: [], origins: [] }
          : path.join(process.env.E2E_PRIVATE_DIR!, `${role}.json`),
    });
    try {
      const page = await context.newPage();
      await page.goto("/performance");
      await expect(page).not.toHaveURL(/\/performance$/);
      await page.goto("/performance/settings");
      await expect(page).not.toHaveURL(/\/performance\/settings$/);
      await page.goto("/performance/tests/not-real");
      await expect(page).not.toHaveURL(/\/performance\/tests\//);
      const response = await context.request.get(
        `/api/performance/export?start=${s.date}&end=${s.date}`,
        { maxRedirects: 0 },
      );
      expect(response.status()).not.toBe(200);
      expect(await response.text()).not.toContain("source_timestamp");
    } finally {
      await context.close();
    }
  }
});
