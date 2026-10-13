import { expect, test } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import path from "node:path";

test("signed-in owner can drag, resize, persist and reset performance panels", async ({ page }) => {
  await page.goto("/performance");
  await expect(page.getByRole("heading", { name: "Performance" })).toBeVisible();
  await expect(page.getByTestId("text-inspection-interval")).toHaveText("5.0 min");
  await expect(page.getByTestId("text-employee-interval-inspector:Fixture%20One")).toContainText(
    "5.0 min",
  );
  await expect(page.getByTestId("text-employee-interval-inspector:Fixture%20Two")).toContainText(
    "8.0 min",
  );
  await expect(page.getByText("Typical time between tests", { exact: true }).first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Pace settings", exact: true })).toHaveCount(0);
  await expect(page.getByRole("dialog", { name: "Pace settings" })).toHaveCount(0);
  await expect(page.getByText(/gaps used|excluded long gaps|overnight excluded/i)).toHaveCount(0);
  await expect(page.getByTestId("text-inspection-interval").locator("..")).toHaveAttribute(
    "title",
    /free retests included/i,
  );
  const toolbar = page.getByTestId("performance-toolbar");
  const toolbarBox = await toolbar.boundingBox();
  const headlineBox = await page.getByRole("region", { name: "Headline numbers" }).boundingBox();
  expect(toolbarBox && headlineBox && toolbarBox.y + toolbarBox.height <= headlineBox.y).toBe(true);
  await toolbar.getByTestId("button-save-panel-layout").click();
  await expect(page.getByTestId("performance-layout-save-status")).toHaveText(
    "Layout saved to your account",
  );
  await expect(page.getByTestId("select-trend")).toHaveCount(0);
  await expect(page.getByTestId("text-trend-period")).toContainText("1 day");
  await page.getByTestId("button-sort-inspectionCadence").click();
  await expect(page.locator(".pd-table tbody tr").first()).toContainText("Fixture Two");
  await page.getByTestId("button-sort-inspectionCadence").click();
  await expect(page.locator(".pd-table tbody tr").first()).toContainText("Fixture One");
  const screenshotDir = path.resolve("../../generated-artifacts/performance-inspection");
  await mkdir(screenshotDir, { recursive: true });
  await page.screenshot({
    path: path.join(screenshotDir, "performance-interval.jpg"),
    fullPage: true,
  });

  await page.getByTestId("button-reset-panel-layout").click();
  await expect(page.getByTestId("performance-layout-save-status")).toHaveText(
    "Layout saved to your account",
  );
  const trend = page.getByTestId("panel-trend");
  const employees = page.getByTestId("panel-employees");
  await expect(
    page.getByTestId("performance-panel-grid").locator(".pd-widget").first(),
  ).toHaveAttribute("data-testid", "panel-trend");

  await employees.getByRole("button", { name: "Drag to move Employees panel" }).dragTo(trend);
  await expect(
    page.getByTestId("performance-panel-grid").locator(".pd-widget").first(),
  ).toHaveAttribute("data-testid", "panel-employees");

  await page.getByRole("button", { name: "Move Trend panel up" }).click();
  await expect(
    page.getByTestId("performance-panel-grid").locator(".pd-widget").first(),
  ).toHaveAttribute("data-testid", "panel-trend");
  await page.getByRole("button", { name: "Move Employees panel up" }).click();
  await expect(
    page.getByTestId("performance-panel-grid").locator(".pd-widget").first(),
  ).toHaveAttribute("data-testid", "panel-employees");

  const initialRows = await employees.locator('tbody tr[data-testid^="row-employee-"]').count();
  const minimumHeight =
    initialRows > 0 && initialRows < 7 ? Math.min(720, 250 + initialRows * 80) : 0;
  const resize = employees.getByRole("button", { name: /Resize Employees panel/ });
  await resize.focus();
  await resize.press("ArrowLeft");
  await resize.press("ArrowUp");
  await expect
    .poll(() =>
      employees.evaluate((element) => ({
        columns: getComputedStyle(element).gridColumnStart,
        height: (element as HTMLElement).style.height,
      })),
    )
    .toEqual({ columns: "span 11", height: `${Math.max(380, minimumHeight)}px` });

  // Resize by grabbing the actual corner, rather than a header toolbar control.
  await expect(resize.locator("..")).toHaveAttribute("data-testid", "panel-employees");
  await resize.scrollIntoViewIfNeeded();
  const corner = await resize.boundingBox();
  if (!corner) throw new Error("Panel resize corner was not visible.");
  const columnPitch = await page
    .getByTestId("performance-panel-grid")
    .evaluate(
      (element) =>
        ((element as HTMLElement).clientWidth +
          (parseFloat(getComputedStyle(element).columnGap) || 0)) /
        12,
    );
  const x = corner.x + corner.width / 2;
  const y = corner.y + corner.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x - columnPitch, y - 80, { steps: 10 });
  await page.mouse.up();
  await expect(employees).toHaveCSS("grid-column-start", "span 10");
  const visibleRows = await employees.locator('tbody tr[data-testid^="row-employee-"]').count();
  const visibleHeight = Math.max(
    300,
    visibleRows > 0 && visibleRows < 7 ? Math.min(720, 250 + visibleRows * 80) : 300,
  );
  await expect(employees).toHaveCSS("height", `${visibleHeight}px`);
  await expect(page.getByTestId("performance-layout-save-status")).toHaveText(
    "Layout saved to your account",
  );

  await page.reload();
  await expect(
    page.getByTestId("performance-panel-grid").locator(".pd-widget").first(),
  ).toHaveAttribute("data-testid", "panel-employees");
  await expect(page.getByTestId("panel-employees")).toHaveCSS("grid-column-start", "span 10");
  await expect(page.getByTestId("panel-employees")).toHaveCSS("height", `${visibleHeight}px`);

  const browser = page.context().browser();
  if (!browser) throw new Error("A browser instance is required for account layout persistence.");
  const otherDevice = await browser.newContext({ baseURL: new URL(page.url()).origin });
  await otherDevice.addCookies(await page.context().cookies());
  await otherDevice.addInitScript(() => {
    localStorage.clear();
  });
  const otherDevicePage = await otherDevice.newPage();
  await otherDevicePage.goto("/performance");
  await expect(otherDevicePage.getByTestId("performance-layout-save-status")).toHaveText(
    "Layout saved to your account",
  );
  await expect(
    otherDevicePage.getByTestId("performance-panel-grid").locator(".pd-widget").first(),
  ).toHaveAttribute("data-testid", "panel-employees");
  await expect(otherDevicePage.getByTestId("panel-employees")).toHaveCSS(
    "grid-column-start",
    "span 10",
  );
  await otherDevice.close();

  await page.getByTestId("button-reset-panel-layout").click();
  await expect(page.getByTestId("performance-layout-save-status")).toHaveText(
    "Layout saved to your account",
  );
  await expect(
    page.getByTestId("performance-panel-grid").locator(".pd-widget").first(),
  ).toHaveAttribute("data-testid", "panel-trend");
  await expect(page.getByTestId("panel-employees")).toHaveCSS("grid-column-start", "span 12");

  // Panels whose combined spans fit the grid must share a row.
  const trendCorner = trend.getByRole("button", { name: /Resize Trend panel/ });
  const employeeCorner = employees.getByRole("button", { name: /Resize Employees panel/ });
  for (const handle of [trendCorner, employeeCorner]) {
    await handle.focus();
    for (let step = 0; step < 6; step++) await handle.press("ArrowLeft");
  }
  async function expectSideBySide() {
    await expect
      .poll(async () => {
        const left = await trend.boundingBox();
        const right = await employees.boundingBox();
        const grid = await page.getByTestId("performance-panel-grid").boundingBox();
        return (
          !!left &&
          !!right &&
          !!grid &&
          Math.abs(left.y - right.y) < 1 &&
          left.x + left.width <= right.x &&
          right.x + right.width <= grid.x + grid.width + 1
        );
      })
      .toBe(true);
  }
  await expect(trend).toHaveCSS("grid-column-start", "span 6");
  await expect(employees).toHaveCSS("grid-column-start", "span 6");
  await expectSideBySide();
  await expect(page.getByTestId("performance-layout-save-status")).toHaveText(
    "Layout saved to your account",
  );
  await page.reload();
  await expectSideBySide();

  await page.setViewportSize({ width: 700, height: 900 });
  await expectSideBySide();
  // An oversized pair wraps rather than overlapping; reducing it fits again.
  await employeeCorner.press("ArrowRight");
  await expect
    .poll(async () => {
      const left = await trend.boundingBox();
      const right = await employees.boundingBox();
      return !!left && !!right && right.y >= left.y + left.height;
    })
    .toBe(true);
  await employeeCorner.press("ArrowLeft");
  await expectSideBySide();

  await page.setViewportSize({ width: 390, height: 900 });
  await expect(trend).toHaveCSS("grid-column-start", "1");
  await expect(employees).toHaveCSS("grid-column-start", "1");
  await page.setViewportSize({ width: 1280, height: 720 });
  await expectSideBySide();
  await expect(page.getByTestId("performance-layout-save-status")).toHaveText(
    "Layout saved to your account",
  );

  // Cached VIN history: one repeat yesterday is free; another at day 31 is paid.
  // These are synthetic fixtures, not external portal calls or payroll writes.
  await page.goto("/performance?start=2026-01-15&end=2026-01-15");
  await expect(page.getByTestId("text-cars")).toHaveText("94");
  await expect(page.getByTestId("text-revenue")).toHaveText("$1,840");
  await expect(page.getByTestId("text-pay")).toHaveText("$548");
  await expect(page.locator(".pd-today")).toContainText("1 free retests excluded");
  await page.reload();
  await expect(page.getByTestId("text-cars")).toHaveText("94");
  await page.goto(
    "/performance?start=2026-01-15&end=2026-01-15&employee=inspector%3AFixture%2520One",
  );
  await expect(page.getByTestId("text-cars")).toHaveText("69");
  await expect(page.getByTestId("text-revenue")).toHaveText("$1,340");
  await expect(page.getByTestId("text-pay")).toHaveText("$274");
});

test("busy hours and commission progress follow reports, employee filters and saved panel controls", async ({
  page,
  browser,
}) => {
  await page.goto("/performance?start=2026-01-15&end=2026-01-15");
  // Account-backed layouts include all four panels and preserve the chosen order.
  await page.getByTestId("button-reset-panel-layout").click();
  await page.getByRole("button", { name: "Move Employees panel up", exact: true }).click();
  const employeeResize = page
    .getByTestId("panel-employees")
    .getByRole("button", { name: /Resize Employees panel/ });
  for (let step = 0; step < 6; step++) await employeeResize.press("ArrowLeft");
  await expect(page.getByTestId("performance-layout-save-status")).toHaveText(
    "Layout saved to your account",
  );
  await page.reload();
  const grid = page.getByTestId("performance-panel-grid");
  const busy = page.getByTestId("panel-busy-hours");
  const commission = page.getByTestId("panel-commission-progress");
  await expect(grid.locator(".pd-widget")).toHaveCount(4);
  await expect(grid.locator(".pd-widget").first()).toHaveAttribute("data-panel-id", "employees");
  const migratedEmployees = page.getByTestId("panel-employees");
  const migratedRows = await migratedEmployees
    .locator('tbody tr[data-testid^="row-employee-"]')
    .count();
  const migratedHeight = Math.max(
    420,
    migratedRows > 0 && migratedRows < 7 ? Math.min(720, 250 + migratedRows * 80) : 0,
  );
  await expect(migratedEmployees).toHaveCSS("height", `${migratedHeight}px`);
  await expect(migratedEmployees).toHaveCSS("grid-column-start", "span 6");
  await expect(busy.getByTestId("text-busy-tests")).toHaveText("94");
  // Pace includes all 95 physical tests, including the free retest.
  await expect(page.getByTestId("text-inspection-interval")).toHaveText("5.0 min");
  await expect(page.getByText(/gaps used|excluded long gaps|overnight excluded/i)).toHaveCount(0);

  await expect(busy.getByTestId("text-busy-peak")).toHaveText("11 AM");
  const hourlyBars = busy.getByRole("list", { name: "Counted cars by report hour" }).locator("li");
  await expect(hourlyBars).toHaveCount(24);
  const elevenAm = busy.getByTestId("hour-11");
  await expect(elevenAm).toHaveAttribute("aria-label", /20 cars/);
  await elevenAm.hover();
  await expect(elevenAm.locator(".pd-hour-tooltip")).toContainText("20 cars");
  await expect(elevenAm.locator(".pd-hour-tooltip")).toBeVisible();
  for (const panelId of ["busy-hours", "commission-progress", "trend", "employees"]) {
    const card = page.getByTestId(`panel-${panelId}`).locator(".pd-card");
    const controls = card.locator(".pd-card-actions");
    const cardBox = await card.boundingBox();
    const controlsBox = await controls.boundingBox();
    expect(
      cardBox &&
        controlsBox &&
        controlsBox.x + controlsBox.width / 2 > cardBox.x + cardBox.width / 2,
    ).toBe(true);
  }
  await expect(busy).not.toContainText("loaded days have complete timing");
  await expect(commission).not.toContainText("The selected estimate follows Pay setup");
  await expect(commission).not.toContainText("Performance estimates only, not approved payroll.");
  await expect(commission.getByTestId("text-progress-commission")).toHaveText("$88.00");
  await expect(commission.getByRole("progressbar")).toHaveAttribute(
    "aria-valuetext",
    "94 shop tests, 44 commission tests",
  );
  await expect(commission).toContainText("$44.00 / eligible worker");
  await expect(commission).not.toContainText("not approved payroll");

  // New IDs participate in the same pointer/keyboard layout system.
  await commission
    .getByRole("button", { name: "Drag to move Commission progress panel" })
    .dragTo(page.getByTestId("panel-employees"));
  await expect(grid.locator(".pd-widget").first()).toHaveAttribute(
    "data-panel-id",
    "commission-progress",
  );
  const corner = busy.getByRole("button", { name: /Resize Busy hours panel/ });
  await corner.focus();
  await corner.press("ArrowRight");
  await corner.press("ArrowDown");
  await expect(busy).toHaveCSS("grid-column-start", "span 7");
  await expect(busy).toHaveCSS("height", "460px");
  await expect(page.getByTestId("performance-layout-save-status")).toHaveText(
    "Layout saved to your account",
  );
  await page.reload();
  await expect(grid.locator(".pd-widget").first()).toHaveAttribute(
    "data-panel-id",
    "commission-progress",
  );
  await expect(busy).toHaveCSS("height", "460px");

  await page.goto(
    "/performance?start=2026-01-15&end=2026-01-15&employee=inspector%3AFixture%2520One",
  );
  await expect(busy.getByTestId("text-busy-tests")).toHaveText("69");
  await expect(commission.getByTestId("text-progress-commission")).toHaveText("$44.00");
  await expect(commission.getByRole("progressbar")).toHaveAttribute(
    "aria-valuetext",
    "94 shop tests, 44 commission tests",
  );
  await expect(busy).toContainText("Selected employee");
  await expect(commission).toContainText("Selected employee commission (est.)");

  await expect(page.getByTestId("text-trend-period")).toContainText("1 day · 2026-01-15");
  await expect(
    page.getByTestId("panel-employees").locator('tbody tr[data-testid^="row-employee-"]'),
  ).toHaveCount(1);
  // Apply the date range through the shared top toolbar, retaining employee focus.
  await page.getByTestId("button-date-range").click();
  await page.getByTestId("input-start").fill("2026-01-14");
  await page.getByTestId("button-apply-range").click();
  await expect(page).toHaveURL(/start=2026-01-14/);
  await expect(page.getByTestId("select-employee")).toHaveValue("inspector:Fixture%20One");
  await expect(page.getByTestId("text-trend-period")).toContainText(
    "2 days · 2026-01-14 – 2026-01-15",
  );
  await expect(commission.getByRole("progressbar")).toHaveCount(2);
  await expect(busy).toContainText("Selected employee");
  await page.getByTestId("select-employee").selectOption("");
  await expect(page).toHaveURL(/start=2026-01-14&end=2026-01-15/);
  await expect(
    page.getByTestId("panel-employees").locator('tbody tr[data-testid^="row-employee-"]'),
  ).toHaveCount(2);
  await page.goto("/performance?start=2026-01-11&end=2026-01-11");
  await expect(page.getByTestId("text-trend-period")).toContainText("1 day · 2026-01-11");

  await page.goto("/performance?start=2025-12-30&end=2026-01-15");
  await expect(commission.getByTestId("text-progress-commission")).toHaveText("$1,528.00");
  await expect(commission.getByRole("progressbar")).toHaveCount(15);
  await commission.getByRole("button", { name: "Next", exact: true }).click();
  await expect(commission.getByRole("progressbar")).toHaveCount(2);
  await expect(commission).toContainText("Page 2 of 2");

  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByTestId("button-date-range").click();
  await expect(page.getByTestId("input-start")).toBeVisible();
  const pickerBox = await page.locator(".pd-date-popover").boundingBox();
  expect(pickerBox && pickerBox.x >= 0 && pickerBox.x + pickerBox.width <= 390).toBe(true);
  await page.getByTestId("input-start").press("Escape");
  await expect(page.getByTestId("input-start")).toBeHidden();
  await expect(page.getByTestId("button-date-range")).toBeFocused();

  await expect(busy).toHaveCSS("grid-column-start", "1");
  await expect(commission).toHaveCSS("grid-column-start", "1");
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1))
    .toBe(true);
  await page.goto("/settings/account");
  await page.getByRole("button", { name: "Switch to dark theme", exact: true }).click();
  await expect(page.locator("html")).toHaveClass(/dark/);
  await page.goto("/performance?start=2025-12-30&end=2026-01-15");
  await expect(
    commission.getByRole("heading", { name: "Commission progress", exact: true }),
  ).toBeVisible();
  if (process.env.E2E_INSIGHTS_CAPTURE_DIR) {
    await mkdir(process.env.E2E_INSIGHTS_CAPTURE_DIR, { recursive: true });
    await commission.screenshot({
      path: path.join(process.env.E2E_INSIGHTS_CAPTURE_DIR, "commission-phone.png"),
    });
    await busy.screenshot({
      path: path.join(process.env.E2E_INSIGHTS_CAPTURE_DIR, "busy-phone.png"),
    });
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByTestId("button-reset-panel-layout").click();
  await expect(page.getByTestId("performance-layout-save-status")).toHaveText(
    "Layout saved to your account",
  );
  await page.goto("/performance?start=2026-01-15&end=2026-01-15");
  if (process.env.E2E_INSIGHTS_CAPTURE_DIR) {
    await busy.screenshot({
      path: path.join(process.env.E2E_INSIGHTS_CAPTURE_DIR, "busy-desktop.png"),
    });
    await commission.screenshot({
      path: path.join(process.env.E2E_INSIGHTS_CAPTURE_DIR, "commission-desktop.png"),
    });
  }
  await page.goto("/performance?start=2020-01-01&end=2020-01-01");
  await expect(busy).toContainText("No hourly data");
  await expect(commission).toContainText("Count unavailable");
  await expect(commission.getByRole("progressbar")).toHaveCount(0);

  const manager = await browser.newContext({
    baseURL: new URL(page.url()).origin,
    storageState: path.join(process.env.E2E_PRIVATE_DIR!, "ADMIN.json"),
  });
  try {
    const managerPage = await manager.newPage();
    await managerPage.goto("/performance");
    await expect(managerPage).toHaveURL(/\/dashboard$/);
    await expect(
      managerPage.getByRole("heading", { name: "Commission progress", exact: true }),
    ).toHaveCount(0);
  } finally {
    await manager.close();
  }
});
