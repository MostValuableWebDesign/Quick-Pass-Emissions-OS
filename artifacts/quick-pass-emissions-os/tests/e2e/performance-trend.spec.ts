import { test, expect } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import path from "node:path";

test("report scope stays stable when switching daily and yearly trends", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const year = new Date().getFullYear();
  const reportDate = `${year}-01-15`;
  const captures = path.resolve("../../generated-artifacts/performance-trend");
  await mkdir(captures, { recursive: true });
  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.goto(`/performance?start=${reportDate}&end=${reportDate}&trendDays=7`);
  const scope = page.getByRole("form", { name: "Reporting dates" });
  const employeeFocus = page.getByRole("form", { name: "Employee filter" });
  const trend = page.getByRole("region", { name: "Trend", exact: true });
  await page.getByTestId("button-date-range").click();
  await expect(page.getByTestId("button-date-range")).toHaveAttribute("aria-expanded", "true");
  await expect(page.locator("#performance-date-popover")).toBeVisible();
  await page.screenshot({ path: path.join(captures, "date-controls-desktop.jpg"), fullPage: true });
  await expect(scope).toBeVisible();
  await expect(scope).toContainText("From");
  await expect(scope.getByTestId("select-trend")).toHaveCount(0);
  await expect(trend.getByTestId("select-trend")).toBeVisible();
  const originalCars = await page.getByTestId("text-cars").textContent();
  const originalPay = await page.getByTestId("text-pay").textContent();
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("button-date-range")).toHaveAttribute("aria-expanded", "false");

  await trend.getByTestId("select-trend").selectOption("365");
  await expect(page).toHaveURL(/trendDays=365/);
  expect(new URL(page.url()).searchParams.get("start")).toBe(reportDate);
  expect(new URL(page.url()).searchParams.get("end")).toBe(reportDate);
  await expect(trend).toContainText(`${year} · monthly totals`);
  await expect(page.getByTestId("text-cars")).toHaveText(originalCars!);
  await expect(page.getByTestId("text-pay")).toHaveText(originalPay!);
  await expect(trend.locator(".recharts-wrapper")).toBeVisible();
  await expect(trend.locator(".recharts-wrapper").getByText("Jan", { exact: true })).toBeVisible();

  await trend.getByTestId("select-trend").selectOption("730");
  await expect(page).toHaveURL(/trendDays=730/);
  expect(new URL(page.url()).searchParams.get("start")).toBe(reportDate);
  expect(new URL(page.url()).searchParams.get("end")).toBe(reportDate);
  await expect(trend).toContainText(`2 years · monthly totals through`);
  await expect(page.getByTestId("text-cars")).toHaveText(originalCars!);
  await expect(page.getByTestId("text-pay")).toHaveText(originalPay!);

  await employeeFocus.getByTestId("select-employee").selectOption({ label: "Fixture Two" });
  await expect(page).toHaveURL(/trendDays=730/);
  expect(new URL(page.url()).searchParams.get("start")).toBe(reportDate);
  expect(new URL(page.url()).searchParams.get("end")).toBe(reportDate);
  await expect(page.getByTestId("text-cars")).toHaveText("25");
  await expect(
    page.getByRole("region", { name: "Employees", exact: true }).locator("tbody tr[data-testid]"),
  ).toHaveCount(1);
  await expect(trend).toContainText("Fixture Two");

  await page.screenshot({ path: path.join(captures, "year-desktop.jpg"), fullPage: true });
  await trend.getByTestId("select-trend").selectOption("30");
  await expect(page).toHaveURL(/trendDays=30/);
  await expect(trend).toContainText("Daily · 30 days");
  await expect(page.getByTestId("text-cars")).toHaveText("25");
  expect(new URL(page.url()).searchParams.get("start")).toBe(reportDate);

  await page.setViewportSize({ width: 402, height: 874 });
  await trend.scrollIntoViewIfNeeded();
  const selectBox = await trend.getByTestId("select-trend").boundingBox();
  expect(selectBox).not.toBeNull();
  expect(selectBox!.x).toBeGreaterThanOrEqual(0);
  expect(selectBox!.x + selectBox!.width).toBeLessThanOrEqual(402);
  await page.screenshot({ path: path.join(captures, "daily-mobile.jpg"), fullPage: true });
  expect(errors).toEqual([]);
});
