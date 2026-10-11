import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { login } from "./workflow-helpers";

test("management can add, remove and restore staff without losing the record", async ({ page }) => {
  await login(page, "owner@example.test");
  await page.goto("/employees");
  const navigation = page.getByRole("navigation", { name: "Main navigation" });
  await expect(
    navigation.getByRole("list", { name: /^business$/i })
      .getByRole("link", { name: "Employees", exact: true }),
  ).toBeVisible();
  await page.getByText("+ Add an employee", { exact: true }).click();
  const form = page.locator("form").filter({
    has: page.getByRole("button", { name: "Create employee", exact: true }),
  });
  const key = randomUUID();
  const name = `Staff fixture ${key}`;
  await form.locator('[name="name"]').fill(name);
  await form.locator('[name="email"]').fill(`staff-${key}@example.test`);
  await form.locator('[name="role"]').selectOption("EMPLOYEE");
  await form.locator('[name="duties"]').fill("Preserved synthetic duties");
  await form.locator('[name="workAreas"]').fill("Emissions");
  await form.getByRole("button", { name: "Create employee", exact: true }).click();
  await expect(form.getByRole("status")).toHaveText("Saved successfully.");
  const row = page.getByRole("row").filter({ has: page.getByRole("link", { name, exact: true }) });
  await expect(row).toContainText("No app access");
  await page.reload();
  await page.getByRole("link", { name, exact: true }).click();
  await expect(page).toHaveURL(/\/employees\/[^/?]+(?:\?.*)?$/);
  await page.getByRole("button", { name: "Remove from active staff", exact: true }).click();
  await expect(page.getByRole("button", { name: "Restore employee", exact: true })).toBeVisible();
  await page.reload();
  await expect(page.locator('[name="duties"]')).toHaveValue("Preserved synthetic duties");
  await page.goto("/employees");
  await expect(page.getByRole("link", { name, exact: true })).toHaveCount(0);
  await page.getByRole("link", { name: "Removed staff", exact: true }).click();
  await expect(page).toHaveURL(/\/employees\?status=inactive$/);
  await page.getByRole("link", { name, exact: true }).click();
  await expect(page).toHaveURL(/\/employees\/[^/?]+(?:\?.*)?$/);
  await page.getByRole("button", { name: "Restore employee", exact: true }).click();
  await expect(page.getByRole("button", { name: "Remove from active staff", exact: true })).toBeVisible();
  await page.reload();
  await expect(page.locator('[name="duties"]')).toHaveValue("Preserved synthetic duties");
  await navigation.getByRole("link", { name: "Employees", exact: true }).click();
  await expect(page).toHaveURL(/\/employees$/);
  await expect(page.getByRole("link", { name, exact: true })).toBeVisible();
});
