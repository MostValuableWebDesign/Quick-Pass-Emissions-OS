import { test, expect, type Page, type Locator } from "@playwright/test";
import { login } from "./workflow-helpers";
function form(page: Page, button: string) {
  return page
    .locator("form")
    .filter({ has: page.getByRole("button", { name: button, exact: true }) });
}

async function save(f: Locator, button: string, disappears = false) {
  const response = f
    .page()
    .waitForResponse(
      (r) => r.request().method() === "POST" && !!r.request().headers()["next-action"],
    );
  await f.getByRole("button", { name: button, exact: true }).click();
  await response;
  if (disappears) await expect(f).toHaveCount(0);
  else await expect(f.getByRole("status")).toHaveText("Saved successfully.");
}
test("dealer billing, reviewed terms and invoice, receipts, reversals, aging and finance exports", async ({
  page,
  browser,
}) => {
  await page.context().setExtraHTTPHeaders({ "x-forwarded-for": "198.51.100.41" });
  const bookContext = await browser.newContext({
      extraHTTPHeaders: { "x-forwarded-for": "198.51.100.42" },
    }),
    book = await bookContext.newPage();
  const employeeContext = await browser.newContext({
      extraHTTPHeaders: { "x-forwarded-for": "198.51.100.43" },
    }),
    employee = await employeeContext.newPage();
  await employeeContext.clearCookies();
  await login(page, "owner@example.test");
  await login(book, "preparer@example.test");
  await book.goto("/dealerships");
  let f = form(book, "Add dealership");
  await f.getByLabel("Unique dealership code").fill("E2E-DEALER");
  await f.getByLabel("Dealership name").fill("E2E Dealership");
  await f.getByLabel("Billing address / instructions").fill("Illustrative E2E billing desk");
  await f.getByLabel("Change reason").fill("E2E fixture account");
  await save(f, "Add dealership");
  await book.getByRole("link", { name: "E2E Dealership", exact: true }).click();
  await expect(book.getByRole("heading", { name: "E2E Dealership", exact: true })).toBeVisible();
  const dealerUrl = book.url();
  await expect(book.getByRole("button", { name: "Authorize dealership terms" })).toHaveCount(0);
  await page.goto(dealerUrl);
  await page.getByText("Authorize billing terms", { exact: true }).click();
  f = form(page, "Authorize dealership terms");
  await f.getByLabel("Payment terms · days after issue").fill("30");
  await f.getByLabel("Default service rate · integer USD cents").fill("1000");
  await f.getByLabel("Authorized tax", { exact: false }).fill("750");
  await f
    .getByLabel("Verified contract / tax authorization source")
    .fill("E2E hypothetical contract and tax setting");
  await f.getByLabel("Change reason").fill("E2E illustrative authorization");
  await save(f, "Authorize dealership terms");
  await page
    .locator("summary")
    .filter({ hasText: /^Add contact$/ })
    .click();
  f = form(page, "Add contact");
  await f.getByLabel("Contact person").fill("E2E Billing Contact");
  await f.getByLabel("Contact email").fill("billing@example.test");
  await f.getByLabel("Contact responsibility").fill("Accounts payable");
  await f.getByLabel("Contact source / checked reference").fill("E2E fixture contact source");
  await f.getByLabel("Change reason").fill("E2E contact record");
  await save(f, "Add contact");
  await book.reload();
  f = form(book, "Record completed service");
  await f.getByLabel("Service completion date").fill("2026-02-01");
  await f.getByLabel("Service description").fill("E2E completed emissions");
  await f.getByLabel("Completed quantity · whole units").fill("10");
  await f.getByLabel("Unique service source reference").fill("e2e-dealer-services");
  await f
    .getByLabel("Completion evidence / external record")
    .fill("E2E manual completed service evidence");
  await save(f, "Record completed service");
  f = form(book, "Create invoice draft");
  await f.getByLabel("Unique invoice number").fill("E2E-INV-001");
  await f.getByLabel("Invoice issue date").fill("2026-02-02");
  await f.locator('input[name="serviceIds"]').check();
  await save(f, "Create invoice draft");
  await book.getByRole("link", { name: "E2E-INV-001", exact: true }).last().click();
  await expect(
    book.getByRole("heading", { name: "Invoice E2E-INV-001", exact: true }),
  ).toBeVisible();
  const invoiceUrl = book.url();
  await expect(
    book.getByRole("heading", { name: "Total: $107.50 USD", exact: true }),
  ).toBeVisible();
  f = form(book, "Record invoice decision");
  await f.getByLabel("Change reason").fill("E2E own draft approval denied");
  await f.getByRole("button", { name: "Record invoice decision" }).click();
  await expect(f.getByRole("status")).toHaveText(/different owner or manager/);
  await page.goto(invoiceUrl);
  f = form(page, "Record invoice decision");
  await f.getByLabel("Change reason").fill("E2E separate review of services and tax");
  await save(f, "Record invoice decision");
  await f.getByLabel("Invoice decision").selectOption("SENT");
  await f
    .getByLabel("External delivery reference", { exact: false })
    .fill("E2E simulated delivery record");
  await f.getByLabel("Change reason").fill("E2E external delivery recorded; no email sent");
  await save(f, "Record invoice decision");
  await book.reload();
  f = form(book, "Record dealership payment");
  await f.getByLabel("Received amount · integer USD cents").fill("4000");
  await f.getByLabel("Unique receipt reference").fill("e2e-dealer-receipt");
  await f.getByLabel("External receipt evidence / reference").fill("E2E receipt fixture");
  await save(f, "Record dealership payment");
  await book.reload();
  await expect(book.getByText(/Outstanding: \$67\.50 USD/)).toBeVisible();
  await page.reload();
  await page.getByText("Reverse this receipt", { exact: true }).click();
  f = form(page, "Reverse dealership payment");
  await f.getByLabel("Unique reversal reference").fill("e2e-dealer-reversal");
  await f.getByLabel("Reversal evidence / reason").fill("E2E correction fixture");
  await save(f, "Reverse dealership payment", true);
  await page.reload();
  await expect(page.getByText(/-\$40\.00 USD/)).toBeVisible();
  await book.goto("/finance/reports");
  await expect(
    book.getByRole("heading", { name: "Finance reports & exports", exact: true }),
  ).toBeVisible();
  await expect(book.getByRole("link", { name: "E2E-INV-001", exact: true })).toBeVisible();
  await expect(
    book
      .locator("tr")
      .filter({ has: book.getByRole("link", { name: "E2E-INV-001", exact: true }) })
      .getByRole("cell", { name: "91+ days", exact: true }),
  ).toBeVisible();
  await book.goto("/finance");
  f = form(book, "Record finance entry");
  await f.getByLabel("Record direction").selectOption("EXPENSE");
  await f.getByLabel("Finance category").selectOption("UTILITIES");
  await f.getByLabel("Record amount · integer USD cents").fill("2500");
  await f.getByLabel("Unique external accounting reference").fill("e2e-utility-expense");
  await f.getByLabel("Record description").fill("E2E utility bill paid");
  await f
    .getByLabel("External evidence / estimate assumptions")
    .fill("E2E illustrative utility receipt");
  await f.locator('[name="separateRecord"]').check();
  await save(f, "Record finance entry");
  await page.goto("/finance");
  await page.getByText("Review record", { exact: true }).click();
  f = form(page, "Review finance entry");
  await f.getByLabel("Change reason").fill("E2E separate evidence check");
  await save(f, "Review finance entry");
  await expect(
    page.getByRole("cell", { name: /Verified against supplied evidence/ }),
  ).toBeVisible();
  await book.goto("/finance/reports");
  const downloadPromise = book.waitForEvent("download");
  await book.getByRole("link", { name: "Download dealer payments CSV", exact: true }).click();
  const download = await downloadPromise;

  const stream = await download.createReadStream();
  let csv = "";
  for await (const part of stream!) csv += part.toString();
  expect(csv).toContain('"-4000"');
  expect(csv).toContain('"e2e-dealer-reversal"');
  await page.goto("/finance");
  await expect(
    page.getByRole("heading", { name: "Operational finance", exact: true }),
  ).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Operational finance", exact: true }),
  ).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))
    .toBe(true);
  for (const path of ["/dealerships", dealerUrl, invoiceUrl, "/finance", "/finance/reports"]) {
    await employee.goto(path);
    await expect(employee).toHaveURL(/\/login$/);
    await expect(employee.getByText("Private account notes", { exact: true })).toHaveCount(0);
  }
  const denied = await employee.request.get(
    "/api/finance/export?dataset=entries&start=2026-01-01&end=2026-10-10",
    { maxRedirects: 0 },
  );
  expect(denied.status()).toBe(307);
  expect(denied.headers().location).toBe("/login");
  expect(denied.headers()["content-disposition"]).toBeUndefined();
  await bookContext.close();
  await employeeContext.close();
});
