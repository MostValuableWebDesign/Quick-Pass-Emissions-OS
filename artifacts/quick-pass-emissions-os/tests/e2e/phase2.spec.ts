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
  await login(preparer, "preparer@example.test");
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
  await expect(
    reviewer
      .getByRole("table", { name: "Daily count review", exact: true })
      .locator("tbody tr")
      .filter({ hasText: "e2e-personal-65" }),
  ).toHaveCount(1);
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
  // Employee-first pay, progressive volume incentives, dated raises/reductions and full history.
  await page.goto("/payroll?date=2026-10-01&weekStart=4");
  const employeeRow = () =>
    page
      .getByRole("table", { name: "Employee pay summary", exact: true })
      .getByRole("row")
      .filter({ hasText: "Demo Al" });
  await expect(employeeRow()).toContainText("$15.00 / $15.00");
  await expect(employeeRow()).toContainText("No approved payroll");
  const dailyRate = form(page, "Authorize pay arrangement");
  await dailyRate.getByLabel(/^Pay employee/).selectOption({ label: "Demo Al" });
  await dailyRate.getByLabel("Pay effective date").fill("2026-10-03");
  await dailyRate.getByLabel("Compensation type").selectOption("DAILY");
  await dailyRate.getByLabel("Authorized amount · integer cents").fill("15000");
  await dailyRate.getByLabel("Configured paid days per week", { exact: false }).fill("5");
  await dailyRate
    .getByLabel("Pay authorization reason")
    .fill("E2E daily rate and weekly equivalent");
  await save(dailyRate, "Authorize pay arrangement");
  const volumePolicy = form(page, "Authorize commission policy");
  await volumePolicy.getByLabel(/^Commission employee/).selectOption({ label: "Demo Al" });
  await volumePolicy.getByLabel("Commission effective date").fill("2026-10-03");
  await volumePolicy.getByLabel("Commission eligibility").selectOption("true");
  await volumePolicy.getByLabel("Daily test threshold").fill("50");
  await volumePolicy.getByLabel("Rate per additional test · cents").fill("100");
  await volumePolicy.getByLabel("Volume boost starts above tests/day", { exact: false }).fill("60");
  await volumePolicy
    .getByLabel("Extra commission per test above volume threshold", { exact: false })
    .fill("50");
  await volumePolicy
    .getByLabel("Commission authorization reason")
    .fill("E2E higher-volume incentive");
  await save(volumePolicy, "Authorize commission policy");
  await preparer.goto("/payroll");
  const personalId = await form(preparer, "Record test count")
    .getByLabel(/^Employee/)
    .selectOption({ label: "Demo Al" });
  for (const [date, count] of [
    ["2026-10-03", "65"],
    ["2026-10-04", "0"],
  ]) {
    const dailyCount = form(preparer, "Record test count");
    await dailyCount.getByLabel(/^Employee/).selectOption({ label: "Demo Al" });
    await dailyCount.getByLabel("Test date").fill(date);
    await dailyCount.getByLabel("Personal qualifying tests").fill(count);
    await dailyCount.getByLabel("Unique source reference").fill(`pay-dashboard-${date}`);
    await dailyCount
      .getByLabel("Source / entry reason")
      .fill("E2E approved daily records including zero");
    await save(dailyCount, "Record test count");
  }
  await reviewer.goto("/payroll");
  for (const date of ["2026-10-03", "2026-10-04"]) {
    const countRow = reviewer.locator("tbody tr").filter({ hasText: `pay-dashboard-${date}` });
    await save(
      countRow
        .locator("form")
        .filter({ has: reviewer.getByRole("button", { name: "Approve count", exact: true }) }),
      "Approve count",
      true,
    );
  }
  await page.goto("/payroll?date=2026-10-03&weekStart=4");
  await expect(employeeRow()).toContainText("$150.00 / $750.00");
  await expect(employeeRow()).toContainText("$17.50 / $32.50");
  await expect(employeeRow()).toContainText("$10.83");
  await expect(employeeRow()).toContainText("Above 60 tests/day: add $0.50");
  await employeeRow().getByText("Adjust Demo Al", { exact: true }).click();
  const raise = employeeRow()
    .locator("form")
    .filter({
      has: page.getByRole("button", { name: "Apply base percentage adjustment", exact: true }),
    });
  await raise.getByLabel("Percentage · 10 means 10%").fill("10");
  await raise.getByLabel("Adjustment effective date").fill("2026-10-05");
  await raise.getByLabel("Adjustment reason").fill("E2E ten-percent base raise");
  await save(raise, "Apply base percentage adjustment");
  await page.goto("/payroll?date=2026-10-05&weekStart=4");
  await expect(employeeRow()).toContainText("$165.00 / $825.00");
  await employeeRow().getByText("Adjust Demo Al", { exact: true }).click();
  const reduction = employeeRow()
    .locator("form")
    .filter({
      has: page.getByRole("button", { name: "Apply base percentage adjustment", exact: true }),
    });
  await reduction.getByLabel("Base pay adjustment").selectOption("DECREASE");
  await reduction.getByLabel("Percentage · 10 means 10%").fill("10");
  await reduction.getByLabel("Adjustment effective date").fill("2026-10-06");
  await reduction.getByLabel("Adjustment reason").fill("E2E ten-percent base reduction");
  await save(reduction, "Apply base percentage adjustment");
  await page.goto("/payroll?date=2026-10-06&weekStart=4");
  await expect(employeeRow()).toContainText("$148.50 / $742.50");
  await expect(employeeRow()).toContainText("$115.00 gross"); // Approved historical payroll is unchanged.
  await page.reload();
  await expect(employeeRow()).toContainText("$148.50 / $742.50");
  await expect(page.getByRole("table", { name: "Pay transactions", exact: true })).toContainText(
    "E2E ten-percent base reduction",
  );
  await preparer.locator("summary").filter({ hasText: "Import count records" }).click();
  const batch = form(preparer, "Import test counts");
  await batch.getByLabel("Count records · JSON").fill(
    JSON.stringify(
      Array.from({ length: 16 }, (_, i) => ({
        employeeId: personalId[0],
        date: `2026-09-${String(i + 1).padStart(2, "0")}`,
        count: 0,
        sourceRef: `pay-paging-${i}`,
        reason: "E2E pagination history",
      })),
    ),
  );
  await save(batch, "Import test counts");
  await reviewer.goto("/payroll?status=PENDING&date=2026-10-06&weekStart=4");
  await expect(
    reviewer.getByText("16 matching counts · Page 1 of 2", { exact: true }),
  ).toBeVisible();
  await expect(form(reviewer, "Approve count")).toHaveCount(15);
  await reviewer.getByRole("link", { name: "Next counts", exact: true }).click();
  await expect(
    reviewer.getByText("16 matching counts · Page 2 of 2", { exact: true }),
  ).toBeVisible();
  await expect(form(reviewer, "Approve count")).toHaveCount(1);
  await expect(reviewer).toHaveURL(/date=2026-10-06/);
  await page.goto("/payroll?date=2026-10-06&weekStart=4");
  await expect(
    page.getByRole("table", { name: "Pay transactions", exact: true }).locator("tbody tr"),
  ).toHaveCount(15);
  await page.getByRole("link", { name: "Next transactions", exact: true }).click();
  await expect(page).toHaveURL(/historyPage=2/);
  await expect(
    page.getByRole("table", { name: "Pay transactions", exact: true }).locator("tbody tr"),
  ).toHaveCount(15);
  await page.setViewportSize({ width: 1440, height: 1200 });
  await page.goto("/payroll?date=2026-10-06&weekStart=4");
  await expect(employeeRow()).toContainText("$148.50 / $742.50");
  if (process.env.E2E_PAYROLL_CAPTURE_DIR)
    await page.screenshot({ path: `${process.env.E2E_PAYROLL_CAPTURE_DIR}/payroll-desktop.png` });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(employeeRow()).toContainText("$148.50 / $742.50");
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))
    .toBe(true);
  if (process.env.E2E_PAYROLL_CAPTURE_DIR)
    await page.screenshot({ path: `${process.env.E2E_PAYROLL_CAPTURE_DIR}/payroll-mobile.png` });
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
  await reviewerContext.close();
});
