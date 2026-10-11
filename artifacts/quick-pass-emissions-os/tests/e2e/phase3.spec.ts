import { test, expect, type Page, type Locator } from "@playwright/test";
import { login } from "./workflow-helpers";
function form(page: Page, button: string) {
  return page
    .locator("form")
    .filter({ has: page.getByRole("button", { name: button, exact: true }) });
}

async function save(
  f: Locator,
  button: string,
  disappears = false,
  expected: string | RegExp = "Saved successfully.",
) {
  const response = f
    .page()
    .waitForResponse(
      (r) => r.request().method() === "POST" && !!r.request().headers()["next-action"],
    );
  await f.getByRole("button", { name: button, exact: true }).click();
  await response;
  if (disappears) await expect(f).toHaveCount(0);
  else await expect(f.getByRole("status")).toHaveText(expected);
}
test("six bays, management-recorded issue and reviewed repair, preventative work, chemical stock and rental payment", async ({
  page,
  browser,
}) => {
  await page.context().setExtraHTTPHeaders({ "x-forwarded-for": "198.51.100.31" });
  const employeeContext = await browser.newContext({
      extraHTTPHeaders: { "x-forwarded-for": "198.51.100.32" },
    }),
    employee = await employeeContext.newPage();
  const bookContext = await browser.newContext({
      extraHTTPHeaders: { "x-forwarded-for": "198.51.100.33" },
    }),
    book = await bookContext.newPage();
  await login(page, "owner@example.test");
  await login(employee, "manager@example.test");
  await login(book, "preparer@example.test");
  await page.goto("/carwash");
  let f = form(page, "Confirm six bays");
  for (let n = 1; n <= 6; n++) await f.locator(`[name="bay${n}"]`).fill(`E2E Bay ${n}`);
  await f
    .getByLabel("Layout verification reference / reason")
    .fill("E2E illustrative layout confirmation");
  await save(f, "Confirm six bays", true);
  await expect(page.getByRole("heading", { name: "E2E Bay 1", exact: true })).toBeVisible();
  const bay = page
    .locator("section")
    .filter({ has: page.getByRole("heading", { name: "E2E Bay 1", exact: true }) });
  f = bay.locator("form");
  await f.getByLabel("Bay condition").selectOption("OUT_OF_SERVICE");
  await f.getByLabel("Responsible employee").selectOption({ label: "Demo Al" });
  await f.getByLabel("Change reason").fill("E2E pump inspection outage");
  await save(f, "Update bay");
  await expect(bay.locator(".badge").filter({ hasText: "out of service" })).toBeVisible();
  await page.goto("/vendors");
  f = form(page, "Save verified vendor");
  await f.getByLabel("Vendor name").fill("E2E Verified Vendor");
  await f.getByLabel("Verified contact person / department").fill("Fixture support desk");
  await f.getByLabel("Verified phone", { exact: false }).fill("555-fixture");
  await f.getByLabel("Services provided").fill("Fixture pump service");
  await f
    .getByLabel("Business reference / contact verification evidence")
    .fill("e2e-contact-reference");
  await f.getByLabel("Contact verification date").fill("2026-10-01");
  await f.getByLabel("Change reason").fill("E2E checked contact");
  await save(f, "Save verified vendor");
  await page.goto("/equipment");
  f = form(page, "Register equipment");
  await f.getByLabel("Unique equipment code").fill("E2E-PUMP");
  await f.getByLabel("Equipment name").fill("E2E Wash Pump");
  await f.getByLabel("Equipment category").selectOption("PUMP");
  await f.getByLabel("Equipment location").selectOption({ label: "E2E Bay 1" });
  await f.getByLabel("Service vendor").selectOption({ label: "E2E Verified Vendor" });
  await f.getByLabel("Change reason").fill("E2E registered pump");
  await save(f, "Register equipment");
  await employee.goto("/maintenance");
  f = form(employee, "Report maintenance issue");
  await f
    .getByLabel("Equipment · choose a bay or equipment")
    .selectOption({ label: "E2E Wash Pump" });
  await f.getByLabel("Issue title").fill("E2E hose leak");
  await f.getByLabel("Issue details").fill("E2E leak reported from assigned work area");
  await save(f, "Report maintenance issue");
  await employee.getByRole("link", { name: "E2E hose leak", exact: true }).click();
  await expect(employee).toHaveURL(/\/maintenance\/[^/]+$/);
  const ticketUrl = employee.url();
  await expect(employee.getByRole("heading", { name: "E2E hose leak", exact: true })).toBeVisible();
  await expect(employee.getByRole("heading", { name: "Assignment & deadline" })).toBeVisible();
  await page.goto(ticketUrl);
  f = form(page, "Update maintenance assignment");
  await f.getByLabel("Assigned employee").selectOption({ label: "Demo Al" });
  await f.getByLabel("Assigned vendor").selectOption({ label: "E2E Verified Vendor" });
  await f.getByLabel("Change reason").fill("E2E assigned repair");
  await save(f, "Update maintenance assignment");
  await employee.reload();
  f = form(employee, "Save maintenance progress");
  await f.getByLabel("Maintenance work status").selectOption("AWAITING_REVIEW");
  await f.getByLabel("Work performed / findings").fill("E2E replaced leaking hose");
  await f.getByLabel("Work update / review reason").fill("E2E work ready for inspection");
  await save(f, "Save maintenance progress");
  await page.reload();
  f = form(page, "Save maintenance progress");
  await f.getByLabel("Maintenance work status").selectOption("COMPLETED");
  await f.getByLabel("Actual repair cost", { exact: false }).fill("2500");
  await f.getByLabel("Work update / review reason").fill("E2E verified hose replacement");
  await save(f, "Save maintenance progress", true);
  await expect(page.getByText("Recorded repair cost: $25.00 USD", { exact: true })).toBeVisible();
  await employee.reload();
  await expect(employee.getByText("E2E replaced leaking hose", { exact: true })).toBeVisible();
  await expect(employee.getByText("Recorded repair cost", { exact: false })).toBeVisible();
  await expect(employee.getByRole("heading", { name: "Maintenance history" })).toBeVisible();
  await page.goto("/maintenance/plans");
  f = form(page, "Create preventative schedule");
  await f
    .getByLabel("Equipment · choose a bay or equipment")
    .selectOption({ label: "E2E Wash Pump" });
  await f.getByLabel("Inspection / maintenance title").fill("E2E weekly pump inspection");
  await f.getByLabel("Maintenance instructions").fill("E2E check hose and pressure");
  await f.getByLabel("Schedule assignee").selectOption({ label: "Demo Al" });
  await f.getByLabel("Repeat every · calendar days").fill("7");
  await f.getByLabel("Change reason").fill("E2E preventative responsibility");
  await save(f, "Create preventative schedule");
  await page.goto("/settings");
  await save(
    form(page, "Run operations check"),
    "Run operations check",
    false,
    /Operations checked\./,
  );
  await page.goto("/maintenance");
  await expect(
    page.getByRole("link", { name: "E2E weekly pump inspection", exact: true }).first(),
  ).toBeVisible();
  await page.goto("/chemicals");
  f = form(page, "Add chemical item");
  await f.getByLabel("Chemical / supply name").fill("E2E Wash Soap");
  await f.getByLabel("Stock unit", { exact: false }).selectOption("ML");
  await f.getByLabel("Low-stock threshold · chosen units").fill("500");
  await f.getByLabel("Change reason").fill("E2E stock settings");
  await save(f, "Add chemical item");
  f = form(page, "Record chemical movement");
  await f.getByLabel("Quantity", { exact: false }).fill("1000");
  await f.getByLabel("Unique chemical movement reference").fill("e2e-soap-opening");
  await f.getByLabel("Stock movement reason").fill("E2E physical opening count");
  await save(f, "Record chemical movement");
  await f.getByRole("combobox", { name: /^Stock movement/ }).selectOption("USAGE");
  await f.getByLabel("Quantity", { exact: false }).fill("600");
  await f.getByLabel("Unique chemical movement reference").fill("e2e-soap-used");
  await f.getByLabel("Stock movement reason").fill("E2E soap consumed");
  await save(f, "Record chemical movement");
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "E2E Wash Soap · 400 ml", exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Low recorded stock", { exact: false })).toBeVisible();
  await page.goto("/rentals");
  f = form(page, "Authorize rental agreement");
  await f.getByLabel(/^Detailing\ bay/).selectOption({ label: "E2E Bay 4" });
  await f.getByLabel("Tenant / business name").fill("E2E Detailing Tenant");
  await f.getByLabel("Verified tenant contact").fill("Fixture contact");
  await f.getByLabel("Unique agreement reference").fill("e2e-rental-agreement");
  await f.getByLabel("Agreement start date").fill("2026-01-01");
  await f.getByLabel("Monthly rent · integer USD cents").fill("10000");
  await f.getByLabel("Monthly payment due day").fill("31");
  await f
    .getByLabel("Verified maintenance responsibilities")
    .fill("E2E tenant cleans; owner repairs property");
  await f
    .getByLabel("Agreement authorization reference / reason")
    .fill("E2E checked contract terms");
  await save(f, "Authorize rental agreement");
  await page.getByRole("link", { name: "E2E Detailing Tenant", exact: true }).click();
  await expect(page).toHaveURL(/\/rentals\/[^/]+$/);
  const rentalUrl = page.url();
  await book.goto(rentalUrl);
  f = form(book, "Record monthly rental charge");
  await f.getByLabel("Rental month", { exact: true }).fill("2026-02");
  await f.getByLabel("Change reason").fill("E2E February charge");
  await save(f, "Record monthly rental charge");
  f = form(book, "Record rental payment");
  await f.getByLabel("Payment amount · integer USD cents").fill("4000");
  await f.getByLabel("Unique external payment reference").fill("e2e-rental-payment");
  await f.getByLabel("Payment verification / reason").fill("E2E received externally");
  await save(f, "Record rental payment");
  await book.reload();
  await expect(book.getByText(/Remaining \$60\.00 USD/)).toBeVisible();
  await expect(
    book.getByRole("button", { name: "Reverse rental payment", exact: true }),
  ).toHaveCount(0);
  await page.goto(rentalUrl);
  await page.getByText("Reverse this recorded payment", { exact: true }).click();
  f = form(page, "Reverse rental payment");
  await f.getByLabel("Unique reversal reference").fill("e2e-rental-reversal");
  await f.getByLabel("Change reason").fill("E2E correction; payment returned");
  await save(f, "Reverse rental payment", true);
  await page.reload();

  await expect(page.getByText("-$40.00 USD", { exact: false })).toBeVisible();
  await page.goto("/carwash");
  await expect(page.getByRole("heading", { name: "E2E Bay 1", exact: true })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await expect(page.getByRole("heading", { name: "E2E Bay 1", exact: true })).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))
    .toBe(true);
  await employee.goto(ticketUrl);
  await employee.setViewportSize({ width: 390, height: 844 });
  await expect(employee.getByRole("heading", { name: "E2E hose leak", exact: true })).toBeVisible();
  await expect
    .poll(() => employee.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))
    .toBe(true);
  await employeeContext.close();
  await bookContext.close();
});
