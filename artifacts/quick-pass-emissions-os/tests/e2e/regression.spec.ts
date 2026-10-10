import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";

test("public clients cannot open protected pages", async ({ browser, baseURL }) => {
  const context = await browser.newContext({ baseURL, storageState: { cookies: [], origins: [] } });
  try {
    const page = await context.newPage();
    await page.goto("/vendors");
    await expect(page).toHaveURL(/\/login$/);
    const form = page.locator("form");
    await expect(form).toHaveAttribute("method", "post");
    await expect(form).toHaveAttribute("action", "/api/sign-in");
    await expect(page.locator('input[type="password"]')).toHaveValue("");
  } finally {
    await context.close();
  }
});

test("signed-in owner can use new operation navigation", async ({ page }) => {
  await page.goto("/dashboard");
  const navigation = page.getByRole("navigation", { name: "Main navigation" });
  for (const [label, route] of [
    ["Payroll & commissions", "/payroll"],
    ["Certificates", "/certificates"],
    ["Carwash & bays", "/carwash"],
    ["Maintenance", "/maintenance"],
    ["Detailing rentals", "/rentals"],
  ]) {
    await navigation.getByRole("link", { name: label, exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`${route}$`));
    await expect(page.locator("main h1")).toBeVisible();
    await expect(navigation.getByRole("link", { name: label, exact: true })).toHaveAttribute(
      "aria-current",
      "page",
    );
  }
});

test("protected vendor save survives reload through preview", async ({ page }) => {
  test.setTimeout(60000);
  const checkpoint = (value: string) =>
    test.info().annotations.push({ type: "regression-stage", description: value });
  checkpoint("opening");
  const name = `Regression Vendor ${randomUUID()}`;
  await page.goto("/carwash");
  await page.getByRole("link", { name: "Vendors", exact: true }).click();
  await expect(page).toHaveURL(/\/vendors$/);
  checkpoint("form");
  const form = page.locator("form").filter({
    has: page.getByRole("button", { name: "Save verified vendor", exact: true }),
  });
  await expect(form).toHaveCount(1);
  checkpoint("form-found");
  await form.locator('input[name="name"]').fill(name);
  checkpoint("name");
  await form.locator('input[name="contact"]').fill("Owned fixture contact");
  checkpoint("contact");
  await form.locator('input[name="phone"]').fill("555-fixture");
  checkpoint("phone");
  await form.locator('textarea[name="services"]').fill("Regression-only service");
  checkpoint("services");
  await form.locator('input[name="reference"]').fill("owned-regression");
  checkpoint("reference");
  await form.locator('textarea[name="reason"]').fill("Owned fixture browser regression");
  checkpoint("submit");
  const response = page.waitForResponse(
    (r) => r.request().method() === "POST" && !!r.request().headers()["next-action"],
  );
  await form.getByRole("button", { name: "Save verified vendor", exact: true }).click();
  expect((await response).ok()).toBe(true);
  checkpoint("confirm");
  await expect(form.getByRole("status")).toHaveText("Saved successfully.");
  await page.reload();
  checkpoint("reload");
  const record = page.locator("section").filter({
    has: page.getByRole("heading", { name: `${name} · active`, exact: true }),
  });
  await expect(record).toHaveCount(1);
  await record.getByText("Edit verified details", { exact: true }).click();
  await expect(record.locator('input[name="name"]')).toHaveValue(name);
  await expect(record.locator('textarea[name="services"]')).toHaveValue("Regression-only service");
});
