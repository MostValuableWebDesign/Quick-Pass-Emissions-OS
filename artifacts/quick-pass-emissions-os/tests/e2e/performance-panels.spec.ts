import { expect, test } from "@playwright/test";

test("signed-in owner can drag, resize, persist and reset performance panels", async ({ page }) => {
  await page.goto("/performance");
  await expect(page.getByRole("heading", { name: "Performance" })).toBeVisible();

  await page.getByTestId("button-reset-panel-layout").click();
  const trend = page.getByTestId("panel-trend");
  const employees = page.getByTestId("panel-employees");
  await expect(page.getByTestId("performance-panel-grid").locator(".pd-widget").first()).toHaveAttribute("data-testid", "panel-trend");

  await employees.getByRole("button", { name: "Drag to move Employees panel" }).dragTo(trend);
  await expect(page.getByTestId("performance-panel-grid").locator(".pd-widget").first()).toHaveAttribute("data-testid", "panel-employees");

  await page.getByRole("button", { name: "Move Trend panel up" }).click();
  await expect(page.getByTestId("performance-panel-grid").locator(".pd-widget").first()).toHaveAttribute("data-testid", "panel-trend");
  await page.getByRole("button", { name: "Move Employees panel up" }).click();
  await expect(page.getByTestId("performance-panel-grid").locator(".pd-widget").first()).toHaveAttribute("data-testid", "panel-employees");

  const resize = employees.getByRole("button", { name: /Resize Employees panel/ });
  await resize.focus();
  await resize.press("ArrowLeft");
  await resize.press("ArrowUp");
  await expect.poll(() => employees.evaluate((element) => ({
    columns: getComputedStyle(element).gridColumnEnd,
    height: (element as HTMLElement).style.height,
  }))).toEqual({ columns: "span 11", height: "380px" });

  await page.reload();
  await expect(page.getByTestId("performance-panel-grid").locator(".pd-widget").first()).toHaveAttribute("data-testid", "panel-employees");
  await expect(page.getByTestId("panel-employees")).toHaveCSS("grid-column-end", "span 11");
  await expect(page.getByTestId("panel-employees")).toHaveCSS("height", "380px");

  await page.getByTestId("button-reset-panel-layout").click();
  await expect(page.getByTestId("performance-panel-grid").locator(".pd-widget").first()).toHaveAttribute("data-testid", "panel-trend");
  await expect(page.getByTestId("panel-employees")).toHaveCSS("grid-column-end", "span 12");
});
