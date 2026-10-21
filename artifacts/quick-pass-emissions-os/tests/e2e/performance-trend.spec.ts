import { test, expect } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import path from "node:path";

test("one calendar controls the shared Performance date range", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const year = new Date().getFullYear();
  const reportDate = `${year}-01-15`;
  const today = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "America/New_York",
  }).format(new Date());
  const captures = path.resolve("../../generated-artifacts/performance-trend");
  await mkdir(captures, { recursive: true });
  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.goto(`/performance?start=${reportDate}&end=${reportDate}&trendDays=custom`);
  const scope = page.getByRole("form", { name: "Reporting dates" });
  const trend = page.getByRole("region", { name: "Trend", exact: true });
  const choosePeriod = async (period: string) => {
    await page.getByTestId("button-date-range").click();
    await page.getByTestId("select-report-period").selectOption(period);
  };

  await page.getByTestId("button-date-range").click();
  await expect(page.getByTestId("button-date-range")).toHaveAttribute("aria-expanded", "true");
  await expect(page.locator("#performance-date-popover")).toBeVisible();
  await scope.getByTestId("button-mode-range").click();
  await page.screenshot({ path: path.join(captures, "date-controls-desktop.jpg"), fullPage: true });
  await expect(scope).toBeVisible();
  await expect(scope).toContainText("From");
  await expect(scope.getByTestId("select-report-period")).toBeVisible();
  await expect(trend.getByTestId("select-report-period")).toHaveCount(0);
  await expect(page.getByTestId("select-trend")).toHaveCount(0);
  await expect(scope.getByTestId("select-report-period").locator("option")).toHaveText([
    "Selected dates",
    "Past 7 Days",
    "Past 30 Days",
    "Year to Date",
    "Past 2 Years",
    "Past 3 Years",
    "Past 4 Years",
    "Past 5 Years",
    "Past 6 Years",
    "All Time",
  ]);
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("button-date-range")).toHaveAttribute("aria-expanded", "false");

  await choosePeriod("365");
  await expect(page).toHaveURL(/period=365/);
  expect(new URL(page.url()).searchParams.get("start")).toBe(`${year}-01-01`);
  expect(new URL(page.url()).searchParams.get("end")).toBe(today);
  await expect(trend).toContainText(`${year} to date · monthly totals`);
  await expect(trend.locator(".recharts-wrapper")).toBeVisible();
  await expect(trend.locator(".recharts-wrapper").getByText("Jan", { exact: true })).toBeVisible();

  await choosePeriod("730");
  await expect(page).toHaveURL(/period=730/);
  expect(new URL(page.url()).searchParams.get("start")).toBe(`${year - 1}-01-01`);
  expect(new URL(page.url()).searchParams.get("end")).toBe(today);
  await expect(trend).toContainText("2 years · monthly totals");

  for (const [value, years] of [
    ["1095", 3],
    ["1460", 4],
    ["1825", 5],
    ["2190", 6],
  ] as const) {
    await choosePeriod(value);
    await expect(page).toHaveURL(new RegExp(`period=${value}`));
    expect(new URL(page.url()).searchParams.get("start")).toBe(`${year - years + 1}-01-01`);
    expect(new URL(page.url()).searchParams.get("end")).toBe(today);
    await expect(trend).toContainText(`${years} years · monthly totals`);
  }

  await choosePeriod("all");
  await expect(page).toHaveURL(/period=all/);
  await expect(page.getByRole("alert")).toContainText(
    "oldest available report has not been verified",
  );

  await page.goto(`/performance?start=${reportDate}&end=${reportDate}&trendDays=custom`);
  await choosePeriod("730");
  await page.getByTestId("select-employee").selectOption({ label: "Fixture Two" });
  await expect(page).toHaveURL(/trendDays=730/);
  expect(new URL(page.url()).searchParams.get("start")).toBe(`${year - 1}-01-01`);
  expect(new URL(page.url()).searchParams.get("end")).toBe(today);
  await expect(trend).toContainText("Fixture Two");

  await page.setViewportSize({ width: 402, height: 874 });
  await page.getByTestId("button-date-range").click();
  const selectBox = await page.getByTestId("select-report-period").boundingBox();
  expect(selectBox).not.toBeNull();
  expect(selectBox!.x).toBeGreaterThanOrEqual(0);
  expect(selectBox!.x + selectBox!.width).toBeLessThanOrEqual(402);
  await page.screenshot({ path: path.join(captures, "date-controls-mobile.jpg"), fullPage: true });
  expect(errors).toEqual([]);
});
