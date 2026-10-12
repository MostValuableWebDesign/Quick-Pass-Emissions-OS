import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { expandGroups } from "./navigation-helpers";

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
  for (const route of ["/payroll", "/certificates", "/carwash", "/equipment", "/vendors"]) {
    const navigation = await expandGroups(page);
    await navigation.locator(`a[href="${route}"]`).click();
    await expect(page).toHaveURL(new RegExp(`${route}$`));
    await expect(page.locator("main h1")).toBeVisible();
    await expect(navigation.locator(`a[href="${route}"]`)).toHaveAttribute("aria-current", "page");
  }
});

test("protected vendor save survives reload through preview", async ({ page }) => {
  test.setTimeout(60000);
  const checkpoint = (value: string) =>
    test.info().annotations.push({ type: "regression-stage", description: value });
  checkpoint("opening");
  const name = `Regression Vendor ${randomUUID()}`;
  await page.goto("/carwash");
  const navigation = await expandGroups(page);
  await navigation.locator('a[href="/vendors"]').click();
  await expect(page).toHaveURL(/\/vendors$/);
  checkpoint("form");
  await page.getByRole("button", { name: "Add vendor", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Add vendor" });
  const form = dialog.locator("form").filter({
    has: page.getByRole("button", { name: "Add vendor", exact: true }),
  });
  await expect(form).toHaveCount(1);
  checkpoint("form-found");
  await form.locator('input[name="name"]').fill(name);
  checkpoint("name");
  await form.locator('input[name="phone"]').fill("555-555-0123");
  checkpoint("phone");
  await form.locator('textarea[name="services"]').fill("Regression-only service");
  checkpoint("services");
  await expect(form.locator('input[name="name"]')).toHaveAttribute("required", "");
  await expect(form.locator('input[name="phone"]')).toHaveAttribute("required", "");
  await expect(form.locator('input[name="verifiedDate"]')).toHaveCount(0);
  await expect(form.locator('select[name="active"]')).toHaveCount(0);
  await expect(form.locator('textarea[name="reason"]')).toHaveCount(0);
  checkpoint("submit");
  const response = page.waitForResponse(
    (r) => r.request().method() === "POST" && !!r.request().headers()["next-action"],
  );
  await form.getByRole("button", { name: "Add vendor", exact: true }).click();
  expect((await response).ok()).toBe(true);
  checkpoint("confirm");
  await expect(form.getByRole("status")).toHaveText("Saved successfully.");
  await page.reload();
  checkpoint("reload");
  await page.getByRole("link", { name, exact: true }).click();
  const record = page
    .locator("form")
    .filter({ has: page.getByRole("button", { name: "Update verified contact", exact: true }) });
  await expect(record.locator('input[name="name"]')).toHaveValue(name);
  await expect(record.locator('textarea[name="services"]')).toHaveValue("Regression-only service");
});
