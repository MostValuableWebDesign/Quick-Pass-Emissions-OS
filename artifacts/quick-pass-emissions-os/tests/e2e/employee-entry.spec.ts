import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { login } from "./workflow-helpers";

test("management can add, remove and restore staff without losing the record", async ({ page }) => {
  await login(page, "owner@example.test");
  await page.goto("/employees");
  const addDetails = page.locator("details.directory-add-details");
  await expect(addDetails.locator("summary")).toHaveText("Add employee");
  expect(await addDetails.getAttribute("class")).not.toContain("card");
  const addBox = await addDetails.locator("summary").boundingBox();
  const directoryBox = await page.locator("section.card").boundingBox();
  expect(addBox).not.toBeNull();
  expect(directoryBox).not.toBeNull();
  expect(addBox!.x).toBeGreaterThan(directoryBox!.x);
  expect(addBox!.x + addBox!.width).toBeGreaterThanOrEqual(directoryBox!.x + directoryBox!.width - 2);
  const navigation = page.getByRole("navigation", { name: "Main navigation" });
  const employeeRoot = navigation.locator('[data-nav-root="#employees-menu"]');
  const employeeTrigger = employeeRoot.getByRole("button", { name: "Employees", exact: true });
  await employeeTrigger.hover();
  const employeePages = page.getByRole("region", { name: "Employees pages" });
  await expect(
    employeePages.getByRole("link", { name: "Employee directory", exact: true }),
  ).toBeVisible();
  await addDetails.locator("summary").click();
  const form = page.locator("form").filter({
    has: page.getByRole("button", { name: "Create employee", exact: true }),
  });
  const key = randomUUID();
  const name = `Staff fixture ${key}`;
  await form.locator('[name="name"]').fill(name);
  await form.locator('[name="phone"]').fill("555-0100");
  await form.locator('[name="jobRole"]').fill("Emissions Inspector");
  await form.locator('[name="streetAddress"]').fill("100 Test Street");
  await expect(form.locator('[name="email"]')).toHaveCount(0);
  await form.getByRole("button", { name: "Create employee", exact: true }).click();
  await expect(form.getByRole("status")).toHaveText("Saved successfully.");
  const row = page.getByRole("row").filter({ has: page.getByRole("link", { name, exact: true }) });
  await expect(row).toContainText("Emissions Inspector");
  await expect(row).toContainText("555-0100");
  await page.reload();
  await page.getByRole("link", { name, exact: true }).click();
  await expect(page).toHaveURL(/\/employees\/[^/?]+(?:\?.*)?$/);
  await expect(page.locator('[name="jobRole"]')).toHaveValue("Emissions Inspector");
  await expect(page.locator('[name="phone"]')).toHaveValue("555-0100");
  await expect(page.locator('[name="streetAddress"]')).toHaveValue("100 Test Street");
  await page.getByRole("button", { name: "Remove from active staff", exact: true }).click();
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
  await expect(page.getByRole("button", { name: "Remove from active staff", exact: true })).toBeVisible();
  await page.reload();
  await expect(page.locator('[name="jobRole"]')).toHaveValue("Emissions Inspector");
  await employeeTrigger.hover();
  await employeePages.getByRole("link", { name: "Employee directory", exact: true }).click();
  await expect(page).toHaveURL(/\/employees$/);
  await expect(page.getByRole("link", { name, exact: true })).toBeVisible();
});
