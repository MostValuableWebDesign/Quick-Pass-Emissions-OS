import { randomUUID } from "node:crypto";
import { test, expect } from "@playwright/test";
import { login } from "./workflow-helpers";

test("add a minimal vendor contact without marking it verified", async ({ page }) => {
  await login(page, "owner@example.test");
  await page.goto("/vendors");

  await expect(
    page.getByRole("heading", { name: "Preferred provider by category", exact: true }),
  ).toHaveCount(0);

  const form = page.locator("form").filter({
    has: page.getByRole("button", { name: "Add vendor", exact: true }),
  });
  await expect(form).toHaveCount(1);
  const name = `Form vendor ${randomUUID()}`;

  for (const field of ["name", "phone"]) {
    await expect(form.locator(`[name="${field}"]`)).toHaveAttribute("required", "");
  }
  for (const field of ["contact", "email", "services", "reference", "notes"]) {
    await expect(form.locator(`[name="${field}"]`)).not.toHaveAttribute("required");
  }
  for (const field of ["verifiedDate", "active", "reason"]) {
    await expect(form.locator(`[name="${field}"]`)).toHaveCount(0);
  }

  await form.getByLabel("Vendor name").fill(name);
  await form.getByLabel("Phone number").fill("555-0100");
  await form.getByRole("button", { name: "Add vendor", exact: true }).click();
  await expect(form.getByRole("status")).toHaveText("Saved successfully.");

  const vendorLink = page.getByRole("link", { name, exact: true });
  await expect(vendorLink).toBeVisible();
  await page.reload();
  await page.getByRole("link", { name, exact: true }).click();
  await expect(page.getByRole("heading", { name, exact: true })).toBeVisible();
  await expect(page.getByText("Unconfirmed", { exact: true })).toBeVisible();
});
