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
  const open = page.getByLabel("Monday opening time");
  const close = page.getByLabel("Monday closing time");
  await open.fill("07:15");
  await close.fill("17:45");
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page.getByRole("status")).toHaveText("Saved successfully.");

  await page.reload();
  await expect(page.getByLabel("Monday opening time")).toHaveValue("07:15");
  await expect(page.getByLabel("Monday closing time")).toHaveValue("17:45");
});
