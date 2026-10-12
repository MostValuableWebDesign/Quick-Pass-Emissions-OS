import { test, expect } from "@playwright/test";
import { login, form, save } from "./workflow-helpers";
test("owner can preview and persist daily report recipients without sending", async ({ page }) => {
  await login(page, "owner@example.test");
  await page.goto("/automation");
  await page.getByRole("link", { name: "Configure daily owner email" }).click();
  await expect(page.getByRole("heading", { name: "Daily owner email", exact: true })).toBeVisible();
  await expect(page.getByText(/Current-day business report at 6:30 PM Eastern/)).toBeVisible();
  await expect(page.getByText(/Email setup required/)).toBeVisible();
  await page.getByText("Preview today’s owner report", { exact: true }).click();
  await expect(page.getByText(/Tests performed:/)).toBeVisible();
  await expect(page.getByText(/Gross pay:/)).toBeVisible();
  const f = form(page, "Save owner email settings");
  await f.getByRole("checkbox", { name: /Regression Owner/ }).check();
  await save(f, "Save owner email settings");
  await page.reload();
  await expect(
    form(page, "Save owner email settings").getByRole("checkbox", { name: /Regression Owner/ }),
  ).toBeChecked();
  await expect(
    form(page, "Save owner email settings").getByLabel("Daily email status"),
  ).toHaveValue("false");
  await expect(page.getByText("No emails queued yet.")).toBeVisible();
});
test("managers cannot open owner email settings or private report routes", async ({ page }) => {
  await login(page, "manager@example.test");
  for (const route of ["/automation/daily-email", "/automation/daily-email/reports/not-a-report"]) {
    await page.goto(route);
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.getByRole("heading", { name: "Daily owner email", exact: true })).toHaveCount(
      0,
    );
  }
});
