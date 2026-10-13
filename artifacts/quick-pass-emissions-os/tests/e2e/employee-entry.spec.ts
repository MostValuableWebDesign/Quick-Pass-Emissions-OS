import { test, expect, type Locator, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { login } from "./workflow-helpers";

async function confirmAction(page: Page, button: Locator, accept: boolean) {
  await button.click();
  const dialog = page.getByRole("alertdialog", { name: "Confirm employee removal" });
  await expect(dialog).toBeVisible();
  const dialogBox = await dialog.boundingBox();
  const viewport = page.viewportSize();
  expect(dialogBox).not.toBeNull();
  expect(viewport).not.toBeNull();
  expect(Math.abs(dialogBox!.x + dialogBox!.width / 2 - viewport!.width / 2)).toBeLessThanOrEqual(1);
  expect(Math.abs(dialogBox!.y + dialogBox!.height / 2 - viewport!.height / 2)).toBeLessThanOrEqual(1);
  await expect(dialog).toContainText("payroll history will be kept");
  await expect(dialog).not.toContainText("replit.dev");
  await dialog
    .getByRole("button", { name: accept ? "Remove from active staff" : "Keep employee" })
    .click();
  await expect(dialog).not.toBeVisible();
}

test("management can add, remove and restore staff without losing the record", async ({ page }) => {
  await login(page, "owner@example.test");
  await page.goto("/employees");
  const addTrigger = page.getByRole("button", { name: "Add employee", exact: true });
  await expect(addTrigger).toBeVisible();
  expect(await addTrigger.getAttribute("class")).not.toContain("card");
  const addBox = await addTrigger.boundingBox();
  const directoryBox = await page.locator("section.card").boundingBox();
  expect(addBox).not.toBeNull();
  expect(directoryBox).not.toBeNull();
  expect(addBox!.x).toBeGreaterThan(directoryBox!.x);
  expect(addBox!.x + addBox!.width).toBeGreaterThanOrEqual(
    directoryBox!.x + directoryBox!.width - 2,
  );
  const navigation = page.getByRole("navigation", { name: "Main navigation" });
  const employeeRoot = navigation.locator('[data-nav-root="#employees-menu"]');
  const employeeTrigger = employeeRoot.getByRole("button", { name: "Employees", exact: true });
  await employeeTrigger.hover();
  const employeePages = page.getByRole("region", { name: "Employees pages" });
  await expect(
    employeePages.getByRole("link", { name: "Employee directory", exact: true }),
  ).toBeVisible();
  await addTrigger.click();
  const dialog = page.getByRole("dialog", { name: "Add employee" });
  await expect(dialog).toBeVisible();
  const form = dialog.locator("form").filter({
    has: page.getByRole("button", { name: "Create employee", exact: true }),
  });
  const key = randomUUID();
  const name = `Staff fixture ${key}`;
  await form.locator('[name="name"]').fill(name);
  await form.locator('[name="phone"]').fill("555-0100");
  await form.locator('[name="jobRole"]').selectOption("Inspector");
  await form.locator('[name="streetAddress"]').fill("100 Test Street");
  await expect(form.locator('[name="email"]')).toHaveCount(0);
  await form.getByRole("button", { name: "Create employee", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  const row = page.getByRole("row").filter({ has: page.getByRole("link", { name, exact: true }) });
  await expect(row).toContainText("Inspector");
  await expect(row).toContainText("555-0100");
  const removeFromList = row.getByRole("button", { name: "Remove from active staff", exact: true });
  await confirmAction(page, removeFromList, false);
  await expect(row).toBeVisible();
  await confirmAction(page, removeFromList, true);
  await expect(row).toHaveCount(0);
  await page.goto("/employees?status=inactive");
  const removedRow = page
    .getByRole("row")
    .filter({ has: page.getByRole("link", { name, exact: true }) });
  await removedRow.getByRole("button", { name: "Restore employee", exact: true }).click();
  await expect(removedRow).toHaveCount(0);
  await page.goto("/employees");
  await expect(
    page.getByRole("row").filter({ has: page.getByRole("link", { name, exact: true }) }),
  ).toBeVisible();
  await page.reload();
  await page.getByRole("link", { name, exact: true }).click();
  await expect(page).toHaveURL(/\/employees\/[^/?]+(?:\?.*)?$/);
  await expect(page.locator('[name="jobRole"]')).toHaveValue("Inspector");
  await expect(page.locator('[name="phone"]')).toHaveValue("555-0100");
  await expect(page.locator('[name="streetAddress"]')).toHaveValue("100 Test Street");
  await confirmAction(
    page,
    page.getByRole("button", { name: "Remove from active staff", exact: true }),
    true,
  );
  await expect(page.getByRole("button", { name: "Restore employee", exact: true })).toBeVisible();
  await page.reload();
  await expect(page.locator('[name="phone"]')).toHaveValue("555-0100");
  await page.goto("/employees");
  await expect(page.getByRole("link", { name, exact: true })).toHaveCount(0);
  await page.getByRole("link", { name: "Removed staff", exact: true }).click();
  await expect(page).toHaveURL(/\/employees\?status=inactive$/);
  await page.getByRole("link", { name, exact: true }).click();
  await expect(page).toHaveURL(/\/employees\/[^/?]+(?:\?.*)?$/);
  await page.getByRole("button", { name: "Restore employee", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Remove from active staff", exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(page.locator('[name="jobRole"]')).toHaveValue("Inspector");
  await employeeTrigger.hover();
  await employeePages.getByRole("link", { name: "Employee directory", exact: true }).click();
  await expect(page).toHaveURL(/\/employees$/);
  await expect(page.getByRole("link", { name, exact: true })).toBeVisible();
});
