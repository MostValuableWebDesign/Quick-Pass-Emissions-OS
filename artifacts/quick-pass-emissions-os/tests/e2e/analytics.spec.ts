import { test, expect } from "@playwright/test";
import { login, form, save } from "./workflow-helpers";
test("owner sees honest Google setup and can persist Analytics action history", async ({
  page,
}) => {
  await login(page, "owner@example.test");
  await page.goto("/analytics");
  await expect(page.getByRole("heading", { name: "Analytics", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Connection setup needed" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Connect Google", exact: true })).toHaveCount(0);
  await page.getByText("Station mapping & manager access", { exact: true }).click();
  const station = form(page, "Save Analytics station");
  await station.getByLabel("Station display name").fill("Analytics verification station");
  await station.getByRole("checkbox").check();
  await save(station, "Save Analytics station");
  await expect(
    page.getByRole("heading", { name: "Google performance", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Unavailable · collection records not linked to this station"),
  ).toBeVisible();
  await expect(
    page.getByText("No supported performance recommendation for this period.", { exact: false }),
  ).toBeVisible();
  const action = form(page, "Record action taken");
  await action
    .getByLabel("Action taken", { exact: true })
    .fill("Review unanswered feedback weekly");
  await action
    .getByLabel("Measurable target and comparison plan")
    .fill("Compare the next 30 days of review response coverage");
  await save(action, "Record action taken");
  await page.reload();
  await expect(page.getByText("Review unanswered feedback weekly", { exact: true })).toBeVisible();
  await page.getByRole("link", { name: "May 2026", exact: true }).click();
  await expect(page.getByLabel("From", { exact: true })).toHaveValue("2026-05-01");
  await expect(page.getByLabel("Through", { exact: true })).toHaveValue("2026-05-31");
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
});
test("manager has no implicit Analytics station grant", async ({ page }) => {
  await login(page, "manager@example.test");
  await page.goto("/analytics");
  await expect(page.getByRole("heading", { name: "No authorized station" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Google performance", exact: true })).toHaveCount(
    0,
  );
  await expect(page.getByText("Station mapping & manager access", { exact: true })).toHaveCount(0);
});
