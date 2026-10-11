import { randomUUID } from "node:crypto";
import { test, expect } from "@playwright/test";
import { login } from "./workflow-helpers";

test("vendor filters, minimal entry and separate business navigation work", async ({ page }) => {
  await login(page, "owner@example.test");
  await page.goto("/vendors");

  const navigation = page.getByRole("navigation", { name: "Main navigation" });
  const emissions = navigation.getByRole("list", { name: /^emissions$/i });
  const carwash = navigation.getByRole("list", { name: /^car wash$/i });
  await expect(emissions.getByRole("link", { name: "Certificates", exact: true })).toBeVisible();
  await expect(emissions.getByRole("link", { name: "Carwash & bays", exact: true })).toHaveCount(0);
  await expect(carwash.getByRole("link", { name: "Carwash & bays", exact: true })).toBeVisible();
  await expect(carwash.getByRole("link", { name: "Certificates", exact: true })).toHaveCount(0);
  for (const href of ["/maintenance", "/maintenance/plans", "/chemicals", "/rentals"])
    await expect(navigation.locator(`a[href="${href}"]`)).toHaveCount(0);

  const filter = page.getByRole("search", { name: "Filter providers" });
  await expect(filter.getByLabel("Include archived providers")).toHaveCount(0);
  await expect(page.getByText(/Phone links open your device's calling app/)).toHaveCount(0);
  await expect(page.getByText(/Email links require an installed email app/)).toHaveCount(0);
  const results = {
    emissions: page.getByRole("link", { name: "Filter Emissions Contact", exact: true }),
    carwash: page.getByRole("link", { name: "Filter Car Wash Contact", exact: true }),
    archived: page.getByRole("link", { name: "Filter Archived Contact", exact: true }),
  };
  async function apply(search: string, category = "") {
    await filter.getByLabel("Search name, contact or services").fill(search);
    await filter.getByLabel("Category", { exact: true }).selectOption(category);
    await filter.getByRole("button", { name: "Apply filters" }).click();
    await page.waitForURL(
      (url) =>
        url.searchParams.get("search") === search && url.searchParams.get("category") === category,
    );
  }
  for (const search of [
    "Filter Emissions Contact",
    "eXhAuSt FiXtUrE dEsK",
    "Legacy fixture analyzer calibration",
    "tailpipe fixture diagnostics",
  ]) {
    await apply(search);
    await expect(results.emissions).toBeVisible();
    await expect(results.carwash).toHaveCount(0);
    await expect(results.archived).toHaveCount(0);
  }
  await apply("Hydraulic fixture cleaning", "Carwash Equipment Service");
  await expect(results.carwash).toBeVisible();
  await expect(results.emissions).toHaveCount(0);

  await apply("", "Carwash Equipment Service");
  await expect(results.carwash).toBeVisible();
  await expect(results.emissions).toHaveCount(0);
  await expect(results.archived).toHaveCount(0);

  await apply("Legacy fixture analyzer calibration", "Carwash Equipment Service");
  await expect(page.getByRole("heading", { name: "No providers match" })).toBeVisible();
  await filter.getByRole("link", { name: "Clear", exact: true }).click();
  await expect(page).toHaveURL(/\/vendors$/);
  await expect(filter.getByLabel("Search name, contact or services")).toHaveValue("");
  await expect(filter.getByLabel("Category", { exact: true })).toHaveValue("");
  await expect(results.emissions).toBeVisible();
  await expect(results.carwash).toBeVisible();
  await expect(results.archived).toHaveCount(0);

  await expect(
    page.getByRole("heading", { name: "Preferred provider by category", exact: true }),
  ).toHaveCount(0);

  const addCard = page.locator("details.vendor-add-card");
  const list = page.locator(".vendor-directory-grid");
  await expect(addCard.locator("summary")).toHaveText("Add vendor");
  const addBox = await addCard.boundingBox();
  const listBox = await list.boundingBox();
  expect(addBox).not.toBeNull();
  expect(listBox).not.toBeNull();
  expect(addBox!.y).toBeLessThan(listBox!.y);

  await page.locator(".vendor-add-toggle").click();
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
  const vendorCard = page.locator(".vendor-directory-card").filter({ has: vendorLink });
  await expect(vendorCard).toContainText("Description");
  await expect(vendorCard).toContainText("No description recorded.");
  await expect(vendorCard).toContainText("555-0100");
  await expect(vendorCard.getByRole("link", { name: /^Email / })).toHaveCount(0);
  await page.reload();
  await page.getByRole("link", { name, exact: true }).click();
  await expect(page).toHaveURL(/\/vendors\/[A-Za-z0-9_-]+$/);
  await expect(page.getByRole("heading", { name, exact: true })).toBeVisible();
  await expect(page.getByText("Unconfirmed", { exact: true })).toBeVisible();

  await page.setViewportSize({ width: 402, height: 874 });
  await page.getByRole("button", { name: "Open navigation menu", exact: true }).click();
  await expect(emissions).toBeVisible();
  await expect(carwash).toBeVisible();
  await navigation.getByRole("link", { name: "Service & Support", exact: true }).click();
  await expect(page).toHaveURL(/\/vendors$/);
  await expect(page.getByRole("link", { name, exact: true })).toBeVisible();
});
