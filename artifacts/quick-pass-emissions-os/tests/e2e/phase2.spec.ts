import { test, expect, type Page, type Locator } from "@playwright/test";
import { login } from "./workflow-helpers";

async function save(form: Locator, button: string, disappears = false) {
  const saved = form
    .page()
    .waitForResponse(
      (response) => response.request().method() === "POST" && !!response.request().headers()["next-action"],
    );
  await form.getByRole("button", { name: button, exact: true }).click();
  await saved;
  if (disappears) await expect(form).toHaveCount(0);
  else await expect(form.getByRole("status")).toHaveText("Saved successfully.");
}

function form(page: Page, button: string) {
  return page
    .locator("form")
    .filter({ has: page.getByRole("button", { name: button, exact: true }) });
}

test("payroll hides retired panels while certificate preparation and review remain available", async ({
  page,
  browser,
}) => {
  await page.context().setExtraHTTPHeaders({ "x-forwarded-for": "198.51.100.11" });
  const preparerContext = await browser.newContext({
    extraHTTPHeaders: { "x-forwarded-for": "198.51.100.12" },
  });
  const preparer = await preparerContext.newPage();
  await login(page, "owner@example.test");
  await login(preparer, "preparer@example.test");

  await page.goto("/payroll");
  await expect(page.getByRole("heading", { name: "Employee pay overview" })).toBeVisible();
  await expect(page.getByRole("table", { name: "Employee pay summary" })).toBeVisible();
  await expect(page.getByRole("table", { name: "Pay transactions" })).toBeVisible();
  for (const retiredHeading of [
    "Payroll periods",
    "Record personal daily tests",
    "Authorize a pay arrangement",
    "Authorize commission policy",
    "Daily counts · review",
  ]) {
    await expect(page.getByRole("heading", { name: retiredHeading, exact: true })).toHaveCount(0);
  }

  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/certificates");
  const settings = form(page, "Save certificate settings");
  await settings.getByLabel("Minimum order quantity").fill("300");
  await settings.getByLabel("Configured reorder point").fill("150");
  await settings.getByLabel("Expected delivery lead days").fill("7");
  await settings.getByLabel("Usage window · calendar days").fill("30");
  await settings
    .getByLabel("Settings authorization reason")
    .fill("E2E illustrative ordering settings");
  await save(settings, "Save certificate settings");
  const reconciliation = form(page, "Reconcile stock");
  await reconciliation.getByLabel("Observed physical certificates").fill("100");
  await reconciliation.getByLabel("Reconciliation reference").fill("e2e-opening");
  await reconciliation.getByLabel("Reconciliation reason").fill("E2E illustrative physical count");
  await save(reconciliation, "Reconcile stock");
  await expect(page.getByRole("heading", { name: "Certificate reorder needed" })).toBeVisible();
  await page.goto("/dashboard");
  await expect(
    page.getByRole("heading", { name: "Certificate reorder needed", exact: true }),
  ).toBeVisible();
  await page.goto("/certificates");
  await preparer.goto("/certificates");
  const purchase = form(preparer, "Request purchase");
  await purchase.getByLabel("Requested certificates").fill("300");
  await purchase.getByLabel("Purchase request reason").fill("E2E low stock request");
  await save(purchase, "Request purchase");
  await expect(
    preparer.getByRole("button", { name: "Submit purchase review", exact: true }),
  ).toHaveCount(0);
  await page.reload();
  const purchaseReview = form(page, "Submit purchase review");
  await purchaseReview
    .getByLabel("Purchase review reason")
    .fill("E2E independently authorized purchase");
  await save(purchaseReview, "Submit purchase review");
  await preparer.reload();
  const order = form(preparer, "Record external order");
  await order.getByLabel("External order confirmation").fill("e2e-order-confirmation");
  await order.getByLabel("Payment reference · optional").fill("e2e-external-payment-reference");
  await order.getByLabel("Order record reason").fill("E2E external channel confirmation");
  await save(order, "Record external order", true);
  await page.reload();
  const receipt = form(page, "Confirm certificate receipt");
  await receipt.getByLabel("Certificates received").fill("300");
  await receipt.getByLabel("Unique delivery reference").fill("e2e-delivery");
  await receipt.getByLabel("Receipt verification reason").fill("E2E physically checked delivery");
  await save(receipt, "Confirm certificate receipt", true);
  await page.reload();
  await expect(page.getByRole("heading", { name: "300 certificates · received" })).toBeVisible();
  await expect(
    page.locator('section[aria-label="Certificate metrics"]').getByText("400", { exact: true }),
  ).toBeVisible();
  await page.goto("/dashboard");
  await expect(page.getByRole("heading", { name: "Needs attention", exact: true })).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Certificate reorder needed", exact: true }),
  ).toHaveCount(0);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))
    .toBe(true);
  await preparerContext.close();
});
