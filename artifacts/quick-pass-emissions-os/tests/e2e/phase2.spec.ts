import { test, expect, type Page, type Locator } from "@playwright/test";
import { login } from "./workflow-helpers";

async function save(form: Locator, button: string, disappears = false) {
  const saved = form
    .page()
    .waitForResponse(
      (response) =>
        response.request().method() === "POST" && !!response.request().headers()["next-action"],
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
test("payroll and certificate preparation, independent review, export, and physical receipt", async ({
  page,
  browser,
}) => {
  // Simulate three distinct clients on the isolated test server; keep login throttling enabled.
  await page.context().setExtraHTTPHeaders({ "x-forwarded-for": "198.51.100.11" });
  const preparerContext = await browser.newContext({
    extraHTTPHeaders: { "x-forwarded-for": "198.51.100.12" },
  });
  const reviewerContext = await browser.newContext({
    extraHTTPHeaders: { "x-forwarded-for": "198.51.100.13" },
  });
  const preparer = await preparerContext.newPage();
  const reviewer = await reviewerContext.newPage();
  await login(page, "owner@example.test");
  await login(preparer, "bookkeeper@example.test");
  await login(reviewer, "manager@example.test");
  await page.goto("/payroll");
  const arrangement = form(page, "Authorize pay arrangement");
  await arrangement.getByLabel(/^Pay\ employee/).selectOption({ label: "Demo Al" });
  await arrangement.getByLabel("Pay effective date").fill("2026-10-01");
  await arrangement.getByLabel("Authorized amount · integer cents").fill("10000");
  await arrangement
    .getByLabel("Pay authorization reason")
    .fill("E2E illustrative owner authorization");
  await save(arrangement, "Authorize pay arrangement");
  const policy = form(page, "Authorize commission policy");
  await policy.getByLabel(/^Commission\ employee/).selectOption({ label: "Demo Al" });
  await policy.getByLabel("Commission effective date").fill("2026-10-01");
  await policy.getByLabel("Commission eligibility").selectOption("true");
  await policy.getByLabel("Daily test threshold").fill("50");
  await policy.getByLabel("Rate per additional test · cents").fill("100");
  await policy
    .getByLabel("Commission authorization reason")
    .fill("E2E illustrative personal counts policy");
  await save(policy, "Authorize commission policy");
  await preparer.goto("/payroll");
  await expect(
    preparer.getByRole("button", { name: "Authorize pay arrangement", exact: true }),
  ).toHaveCount(0);
  const counts = form(preparer, "Record test count");
  await counts.getByLabel(/^Employee/).selectOption({ label: "Demo Al" });
  await counts.getByLabel("Test date").fill("2026-10-01");
  await counts.getByLabel("Personal qualifying tests").fill("65");
  await counts.getByLabel("Unique source reference").fill("e2e-personal-65");
  await counts.getByLabel("Source / entry reason").fill("E2E illustrative personal report");
  await save(counts, "Record test count");
  await reviewer.goto("/payroll");
  await save(form(reviewer, "Approve count"), "Approve count", true);
  const period = form(preparer, "Create payroll period");
  await period.getByLabel("Period label").fill("E2E Phase 2 period");
  await period.getByLabel("Period start").fill("2026-10-01");
  await period.getByLabel("Period end · inclusive").fill("2026-10-02");
  await save(period, "Create payroll period");
  await preparer.getByRole("link", { name: "E2E Phase 2 period", exact: true }).click();
  await expect(preparer).toHaveURL(/\/payroll\/[^/]+$/);
  const periodUrl = preparer.url();
  await reviewer.goto(periodUrl);
  await reviewer
    .getByRole("link", { name: "Review pending counts for this period", exact: true })
    .click();
  await expect(
    reviewer.getByText("0 matching counts · Page 1 of 1", { exact: true }),
  ).toBeVisible();
  await reviewer.getByLabel("Count approval filter").selectOption("ALL");
  await reviewer.getByRole("button", { name: "Filter counts", exact: true }).click();
  await expect(
    reviewer.getByText("1 matching counts · Page 1 of 1", { exact: true }),
  ).toBeVisible();
  await expect(reviewer.locator("tbody tr").filter({ hasText: "e2e-personal-65" })).toHaveCount(1);
  const inputs = form(preparer, "Record payroll input");
  await inputs.getByLabel(/^Payroll\ employee/).selectOption({ label: "Demo Al" });
  await inputs.getByLabel("Approved worked minutes · 0 for fixed pay").fill("0");
  await inputs.getByLabel("I verified all personal counts", { exact: false }).check();
  await inputs.getByLabel("Source / correction reason").fill("E2E complete count verification");
  await save(inputs, "Record payroll input");
  await reviewer.goto(periodUrl);
  await save(form(reviewer, "Approve payroll input"), "Approve payroll input", true);
  await preparer.reload();
  await save(form(preparer, "Generate payroll draft"), "Generate payroll draft", true);
  await expect(preparer.getByRole("heading", { name: "Draft revision 1 · draft" })).toBeVisible();
  const draftId = await preparer.locator('form input[name="id"]').count();
  expect(draftId).toBe(0); // Bookkeeper has no draft review or approved export control.
  await expect(preparer.getByRole("link", { name: "Download approved payroll CSV" })).toHaveCount(
    0,
  );
  await reviewer.reload();
  const review = form(reviewer, "Submit payroll review");
  await review.getByLabel("Payroll decision").selectOption("APPROVED");
  await review.getByLabel("Payroll review reason").fill("E2E independent gross-pay review");
  await save(review, "Submit payroll review", true);
  await expect(
    reviewer.getByRole("heading", { name: "Draft revision 1 · approved" }),
  ).toBeVisible();
  const downloadPromise = reviewer.waitForEvent("download");
  await reviewer.getByRole("link", { name: "Download approved payroll CSV" }).click();
  const download = await downloadPromise;
  const stream = await download.createReadStream();
  let csv = "";
  for await (const chunk of stream!) csv += chunk.toString();
  expect(csv).toContain('"10000","1500","11500","USD"');
  await reviewer.reload();
  await expect(
    reviewer.getByRole("heading", { name: "Draft revision 1 · approved" }),
  ).toBeVisible();
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
  await page.setViewportSize({ width: 390, height: 844 });
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))
    .toBe(true);
  await preparerContext.close();
  await reviewerContext.close();
});
