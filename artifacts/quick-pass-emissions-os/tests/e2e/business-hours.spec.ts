import { expect, test } from "@playwright/test";
import { login } from "./workflow-helpers";

test("owner can set and save different business opening and closing times by day", async ({
  page,
}) => {
  await login(page, "owner@example.test");
  await page.goto("/settings");

  await expect(page.getByRole("heading", { name: "Business operating days" })).toBeVisible();
  const monday = page.getByRole("checkbox", { name: "Monday" });
  if (!(await monday.isChecked())) await monday.check();
  await page.getByLabel("Monday opening time hour", { exact: true }).selectOption("7");
  await page.getByLabel("Monday opening time minute", { exact: true }).selectOption("15");
  await page.getByLabel("Monday opening time AM or PM", { exact: true }).selectOption("AM");
  await page.getByLabel("Monday closing time hour", { exact: true }).selectOption("5");
  await page.getByLabel("Monday closing time minute", { exact: true }).selectOption("45");
  await page.getByLabel("Monday closing time AM or PM", { exact: true }).selectOption("PM");
  const save = page.getByRole("button", { name: "Save business hours", exact: true });
  const hoursForm = page.locator("form").filter({ has: save });
  await expect(hoursForm.locator('input[name="openTime1"]')).toHaveValue("07:15");
  await expect(hoursForm.locator('input[name="closeTime1"]')).toHaveValue("17:45");
  await save.click();
  try {
    await expect(hoursForm.getByRole("status")).toHaveText("Saved successfully.");
  } catch (error) {
    await page.screenshot({
      path: "../../generated-artifacts/business-hours-failure.png",
      fullPage: true,
    });
    throw error;
  }

  await page.reload();
  await expect(page.locator('input[name="openTime1"]')).toHaveValue("07:15");
  await expect(page.locator('input[name="closeTime1"]')).toHaveValue("17:45");
  await expect(page.getByLabel("Monday closing time AM or PM", { exact: true })).toHaveValue("PM");
  await page.screenshot({
    path: "../../generated-artifacts/business-hours-verified.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  for (const control of await page.locator(".business-time-select select").all()) {
    const bounds = await control.boundingBox();
    expect(bounds).not.toBeNull();
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(390);
  }
  await page.screenshot({
    path: "../../generated-artifacts/business-hours-mobile.png",
    fullPage: true,
  });
});
