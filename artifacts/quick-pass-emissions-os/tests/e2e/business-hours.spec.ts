import { expect, test } from "@playwright/test";
import { login } from "./workflow-helpers";

test("hours remain visible after saving, support whole-week setup and preserve daily exceptions", async ({
  page,
}) => {
  await login(page, "owner@example.test");
  await page.goto("/settings");
  const save = page.getByRole("button", { name: "Save business hours", exact: true });
  const form = page.locator("form").filter({ has: save });
  const setup = page.getByLabel("Hours setup", { exact: true });
  const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  for (const day of days) await page.getByRole("checkbox", { name: day, exact: true }).check();
  await page.getByRole("checkbox", { name: "Sunday", exact: true }).uncheck();
  await setup.selectOption("shared");

  async function setTime(label: string, hour: string, minute: string, period: string) {
    await page.getByLabel(`${label} hour`, { exact: true }).selectOption(hour);
    await page.getByLabel(`${label} minute`, { exact: true }).selectOption(minute);
    await page.getByLabel(`${label} AM or PM`, { exact: true }).selectOption(period);
  }
  async function submit(message = "Saved successfully.") {
    const response = page.waitForResponse(
      (result) =>
        result.request().method() === "POST" && new URL(result.url()).pathname === "/settings",
    );
    await save.click();
    await response;
    await expect(save).toBeEnabled();
    await expect(form.getByRole("status")).toHaveText(message);
  }
  async function checkDays() {
    for (const day of days)
      await expect(page.getByRole("checkbox", { name: day, exact: true })).toBeChecked();
    await expect(page.getByRole("checkbox", { name: "Sunday", exact: true })).not.toBeChecked();
  }

  await setTime("All open days opening time", "9", "00", "AM");
  await setTime("All open days closing time", "8", "00", "AM");
  await submit("Closing time must be later than opening time.");
  await expect(page.getByLabel("All open days closing time hour", { exact: true })).toHaveValue(
    "8",
  );
  await checkDays();
  await setTime("All open days closing time", "6", "00", "PM");
  await submit();
  // Verify the actual displayed controls BEFORE a reload (native action-form
  // reset previously made saved hours appear blank, and could erase a second save).
  await expect(page.getByLabel("All open days opening time hour", { exact: true })).toHaveValue(
    "9",
  );
  await expect(page.getByLabel("All open days closing time hour", { exact: true })).toHaveValue(
    "6",
  );
  await expect(page.getByLabel("All open days closing time AM or PM", { exact: true })).toHaveValue(
    "PM",
  );
  await checkDays();
  await submit();
  await page.reload();
  await expect(setup).toHaveValue("shared");
  await expect(page.getByLabel("All open days opening time hour", { exact: true })).toHaveValue(
    "9",
  );
  await expect(page.getByLabel("All open days closing time AM or PM", { exact: true })).toHaveValue(
    "PM",
  );
  await checkDays();
  await page.screenshot({
    path: "../../generated-artifacts/business-hours-bulk.png",
    fullPage: true,
  });

  await setup.selectOption("individual");
  for (let day = 1; day <= 6; day++) {
    await expect(form.locator(`input[name="openTime${day}"]`)).toHaveValue("09:00");
    await expect(form.locator(`input[name="closeTime${day}"]`)).toHaveValue("18:00");
  }
  await setTime("Monday opening time", "7", "15", "AM");
  await setTime("Monday closing time", "5", "45", "PM");
  await setTime("Saturday closing time", "2", "00", "PM");
  await submit();
  await expect(page.getByLabel("Monday opening time hour", { exact: true })).toHaveValue("7");
  await expect(page.getByLabel("Monday opening time minute", { exact: true })).toHaveValue("15");
  await checkDays();
  await page.reload();
  await expect(setup).toHaveValue("individual");
  await expect(form.locator('input[name="openTime1"]')).toHaveValue("07:15");
  await expect(form.locator('input[name="closeTime1"]')).toHaveValue("17:45");
  await expect(form.locator('input[name="openTime2"]')).toHaveValue("09:00");
  await expect(form.locator('input[name="closeTime2"]')).toHaveValue("18:00");
  await expect(form.locator('input[name="closeTime6"]')).toHaveValue("14:00");
  await checkDays();
  await page.screenshot({
    path: "../../generated-artifacts/business-hours-verified.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  for (const control of await form.locator("select").all()) {
    const bounds = await control.boundingBox();
    expect(bounds).not.toBeNull();
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(390);
  }
  await setup.selectOption("shared");
  await page.screenshot({
    path: "../../generated-artifacts/business-hours-mobile.png",
    fullPage: true,
  });
});
