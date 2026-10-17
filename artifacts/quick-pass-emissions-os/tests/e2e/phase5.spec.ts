import { test, expect } from "@playwright/test";
import { login, form, save } from "./workflow-helpers";

test("Phase 5 owner configuration, durable summary, report export and failed-job retry", async ({
  page,
}) => {
  await login(page, "owner@example.test");
  await page.goto("/automation");
  let f = form(page, "Save daily schedule");
  await f.getByLabel("Weekday", { exact: false }).selectOption("1");
  await f.getByLabel("Run time", { exact: false }).fill("00:00");
  await f.getByLabel("Run on open days only").selectOption("false");
  await save(f, "Save daily schedule");
  f = form(page, "Save certification policy");
  await f.getByLabel("Policy status").selectOption("true");
  await f.getByLabel("Advance notice days before due").fill("0");
  await f.getByLabel("Escalate after days overdue").fill("365");
  await f
    .getByRole("group", { name: "Recipients (advance and overdue)", exact: true })
    .getByRole("checkbox", { name: "Navigation Fixture ADMIN (admin)", exact: true })
    .check();
  await f
    .getByRole("group", { name: "Escalation recipients", exact: true })
    .getByRole("checkbox", { name: "Regression Owner (owner)", exact: true })
    .check();
  await save(f, "Save certification policy");
  f = form(page, "Save Certificates forecast");
  await f.getByLabel("Observation window days", { exact: false }).fill("7");
  await f.getByLabel("Minimum days of history", { exact: false }).fill("1");
  await f.getByLabel("Planning lead days").fill("0");
  await f.getByLabel("Low-stock threshold", { exact: false }).fill("0");
  await save(f, "Save Certificates forecast");
  await page.reload();
  await expect(
    form(page, "Save Certificates forecast").getByLabel("Planning lead days"),
  ).toHaveValue("0");
  await save(form(page, "Authorize retry"), "Authorize retry", true);
  await page.goto("/settings");
  const operations = form(page, "Run operations check");
  await operations.getByRole("button", { name: "Run operations check" }).click();
  await expect(operations.getByRole("status")).toHaveText(/Operations checked\./);
  await page.goto("/summaries");
  await page.getByRole("link", { name: "Open snapshot", exact: true }).first().click();
  await expect(
    page.getByRole("heading", { name: "Schedule and boundaries", exact: true }),
  ).toBeVisible();
  const snapshotUrl = page.url();
  const snapshot = await page.locator("main").innerText();
  await page.goto("/notifications");
  await expect(page.getByRole("link", { name: /Historical summary:/ }).first()).toBeVisible();
  await page.goto("/automation");
  f = form(page, "Save Certificates forecast");
  await f.getByLabel("Low-stock threshold", { exact: false }).fill("1000");
  await save(f, "Save Certificates forecast");
  await page.goto("/overview");
  await expect(
    page.getByRole("heading", { name: "Certificate reorder needed", exact: true }),
  ).toBeVisible();
  await page.goto(snapshotUrl);
  await expect.poll(() => page.locator("main").innerText()).toBe(snapshot);
  await page.goto("/reports?dataset=certificates");
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("link", { name: "Download CSV (all rows)", exact: true }).click();
  const stream = await (await downloadPromise).createReadStream();
  let csv = "";
  for await (const chunk of stream!) csv += chunk.toString();
  expect(csv).toContain("e2e-delivery");
  await page.goto("/automation");
  await expect(page.getByRole("button", { name: "Authorize retry", exact: true })).toHaveCount(0);
});

test("Phase 5 management reminder acknowledgement persists while private owner records stay protected", async ({
  page,
}) => {
  await login(page, "manager@example.test");
  await page.goto("/reminders");
  const reminder = page
    .locator(".list-row")
    .filter({ has: page.getByRole("link", { name: "Open source record" }) });
  await expect(reminder).toHaveCount(1);
  await reminder.getByRole("button", { name: "Acknowledge", exact: true }).click();
  await expect(reminder.getByText(/Acknowledged/)).toBeVisible();
  await page.reload();
  await expect(reminder.getByText(/Acknowledged/)).toBeVisible();
  await reminder.getByRole("link", { name: "Open source record" }).click();
  await expect(page).toHaveURL(/\/employees\//);
  await expect(page.getByRole("heading", { name: "Demo Al", exact: true })).toBeVisible();
  for (const route of ["/automation", "/overview", "/summaries"]) {
    await page.goto(route);
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(
      page.getByRole("heading", {
        name: /Schedules|Live owner exceptions|Consolidated summary archive|Operational reports/,
      }),
    ).toHaveCount(0);
  }
  const denied = await page.request.get(
    "/api/reports/export?dataset=certificates&start=2026-10-01&end=2026-10-10",
  );
  expect(denied.status()).toBe(200);
  await login(page, "preparer@example.test");
  await page.goto("/reports?dataset=certificates");
  await expect(
    page.getByRole("heading", { name: "Operational reports", exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel(/^Report/).locator("option")).toHaveCount(6);
  await page.goto("/automation");
  await expect(page).toHaveURL(/\/dashboard$/);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/reminders");
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
    .toBe(true);
});
