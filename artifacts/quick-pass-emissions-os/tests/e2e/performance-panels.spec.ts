import { expect, test } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import path from "node:path";

test("signed-in owner can drag, resize, persist and reset performance panels", async ({ page }) => {
  await page.goto("/performance");
  await expect(page.getByRole("heading", { name: "Performance" })).toBeVisible();
  await expect(page.getByTestId("text-inspection-interval")).toHaveText("3.6 min/car");
  await expect(page.getByTestId("text-employee-interval-inspector:Fixture%20One")).toContainText(
    "4.9 min/car",
  );
  await expect(page.getByTestId("text-employee-interval-inspector:Fixture%20Two")).toContainText(
    "7.7 min/car",
  );
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
    .toEqual({ columns: "span 11", height: "380px" });

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
    visibleRows > 0 && visibleRows < 7 ? 200 + visibleRows * 80 : 300,
  );
  await expect(employees).toHaveCSS("height", `${visibleHeight}px`);

  await page.reload();
  await expect(
    page.getByTestId("performance-panel-grid").locator(".pd-widget").first(),
  ).toHaveAttribute("data-testid", "panel-employees");
  await expect(page.getByTestId("panel-employees")).toHaveCSS("grid-column-start", "span 10");
  await expect(page.getByTestId("panel-employees")).toHaveCSS("height", `${visibleHeight}px`);

  await page.getByTestId("button-reset-panel-layout").click();
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
  // An existing two-panel preference must survive adding the new panels.
  await page.evaluate(() =>
    localStorage.setItem(
      "quick-pass-performance-layout-v1",
      JSON.stringify([
        { id: "employees", columns: 6, height: 360 },
        { id: "trend", columns: 6, height: 360 },
      ]),
    ),
  );
  await page.reload();
  const grid = page.getByTestId("performance-panel-grid");
  const busy = page.getByTestId("panel-busy-hours");
  const commission = page.getByTestId("panel-commission-progress");
  await expect(grid.locator(".pd-widget")).toHaveCount(4);
  await expect(grid.locator(".pd-widget").first()).toHaveAttribute("data-panel-id", "employees");
  await expect(page.getByTestId("panel-employees")).toHaveCSS("height", "360px");
  await expect(busy.getByTestId("text-busy-tests")).toHaveText("94");
  await expect(busy.getByTestId("text-busy-peak")).toHaveText("11 AM");
  await expect(
    busy.getByRole("list", { name: "Counted tests by report hour" }).locator("li"),
  ).toHaveCount(24);
  await expect(busy.getByText("11 AM: 20 tests", { exact: true })).toHaveCount(1);
  await expect(commission.getByTestId("text-progress-commission")).toHaveText("$88.00");
  await expect(commission.getByRole("progressbar")).toHaveAttribute(
    "aria-valuetext",
    "94 shop tests, 44 commission tests",
  );
  await expect(commission).toContainText("$44.00 / eligible worker");
  await expect(commission).toContainText("not approved payroll");

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

  await page.goto("/performance?start=2025-12-30&end=2026-01-15");
  await expect(commission.getByTestId("text-progress-commission")).toHaveText("$1,528.00");
  await expect(commission.getByRole("progressbar")).toHaveCount(15);
  await commission.getByRole("button", { name: "Next", exact: true }).click();
  await expect(commission.getByRole("progressbar")).toHaveCount(2);
  await expect(commission).toContainText("Page 2 of 2");

  await page.setViewportSize({ width: 390, height: 844 });
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
