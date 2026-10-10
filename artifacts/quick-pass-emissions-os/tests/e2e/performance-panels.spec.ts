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
    columns: getComputedStyle(element).gridColumnStart,
    height: (element as HTMLElement).style.height,
  }))).toEqual({ columns: "span 11", height: "380px" });

  // Resize by grabbing the actual corner, rather than a header toolbar control.
  await expect(resize.locator("..")).toHaveAttribute("data-testid", "panel-employees");
  await resize.scrollIntoViewIfNeeded();
  const corner = await resize.boundingBox();
  if (!corner) throw new Error("Panel resize corner was not visible.");
  const columnPitch = await page.getByTestId("performance-panel-grid").evaluate((element) =>
    ((element as HTMLElement).clientWidth + (parseFloat(getComputedStyle(element).columnGap) || 0)) / 12);
  const x = corner.x + corner.width / 2;
  const y = corner.y + corner.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x - columnPitch, y - 80, { steps: 10 });
  await page.mouse.up();
  await expect(employees).toHaveCSS("grid-column-start", "span 10");
  await expect(employees).toHaveCSS("height", "300px");

  await page.reload();
  await expect(page.getByTestId("performance-panel-grid").locator(".pd-widget").first()).toHaveAttribute("data-testid", "panel-employees");
  await expect(page.getByTestId("panel-employees")).toHaveCSS("grid-column-start", "span 10");
  await expect(page.getByTestId("panel-employees")).toHaveCSS("height", "300px");

  await page.getByTestId("button-reset-panel-layout").click();
  await expect(page.getByTestId("performance-panel-grid").locator(".pd-widget").first()).toHaveAttribute("data-testid", "panel-trend");
  await expect(page.getByTestId("panel-employees")).toHaveCSS("grid-column-start", "span 12");
});
