import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import path from "node:path";
async function fixture() {
  const { station } = JSON.parse(
    await readFile(path.join(process.env.E2E_PRIVATE_DIR!, "navigation.json"), "utf8"),
  );
  return station as { date: string; employeeId: string; employeeName: string };
}
test("Performance summaries and pointer/keyboard layout persist across reload and fit mobile", async ({
  page,
}) => {
  const s = await fixture();
  await page.setViewportSize({ width: 1440, height: 1400 });
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(`/performance?preset=custom&start=${s.date}&end=${s.date}`);
  for (const name of ["Test breakdown", "Daily trends", "Hourly trends", "Employee performance"])
    await expect(page.getByRole("heading", { name, exact: true })).toBeAttached();
  const panels = page.locator("[data-performance-panel]");
  await expect(panels).toHaveCount(13);
  if (process.env.E2E_PERFORMANCE_CAPTURE_DIR)
    await page.screenshot({
      path: path.join(process.env.E2E_PERFORMANCE_CAPTURE_DIR, "performance-desktop.png"),
    });
  const order = () =>
    panels.evaluateAll((nodes) => nodes.map((n) => n.getAttribute("data-performance-panel")));
  const initial = await order();
  await page.getByRole("button", { name: "Move Test breakdown earlier", exact: true }).click();
  expect((await order())[0]).toBe("breakdown");
  // Real pointer gesture, including pointer capture; DOM drag events alone do not exercise it.
  const handle = page.getByRole("button", { name: "Drag Test breakdown panel", exact: true });
  await handle.scrollIntoViewIfNeeded();
  const from = (await handle.boundingBox())!;
  const target = (await page.locator('[data-performance-panel="totals"]').boundingBox())!;
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(target.x + 50, target.y + 65, { steps: 8 });
  await page.mouse.up();
  expect((await order()).slice(0, 2)).toEqual(initial.slice(0, 2));
  await page.getByLabel("Test breakdown panel width", { exact: true }).selectOption("12");
  const panel = page.locator('[data-performance-panel="breakdown"]');
  const corner = page.getByRole("button", { name: "Resize Test breakdown panel", exact: true });
  await corner.scrollIntoViewIfNeeded();
  const sizeBefore = (await panel.boundingBox())!;
  const cornerBefore = (await corner.boundingBox())!;
  await page.mouse.move(cornerBefore.x + 12, cornerBefore.y + 12);
  await page.mouse.down();
  await page.mouse.move(cornerBefore.x + 12, cornerBefore.y + 112, { steps: 8 });
  await page.mouse.up();
  const sizeAfter = (await panel.boundingBox())!;
  expect(sizeAfter.height).toBeGreaterThan(sizeBefore.height + 70);
  await page.reload();
  await expect(page.getByLabel("Test breakdown panel width", { exact: true })).toHaveValue("12");
  await expect
    .poll(async () => (await panel.boundingBox())!.height)
    .toBeCloseTo(sizeAfter.height, 0);
  await corner.focus();
  await corner.press("ArrowUp");
  expect((await panel.boundingBox())!.height).toBeLessThan(sizeAfter.height);
  await page.getByRole("button", { name: "Auto height for Test breakdown", exact: true }).click();
  await expect(panel).toHaveAttribute("style", /--panel-height: auto/);
  await expect
    .poll(async () => (await panel.boundingBox())!.height)
    .toBeCloseTo(sizeBefore.height, 0);
  await page.getByRole("button", { name: "Reset panels", exact: true }).click();
  expect(await order()).toEqual(initial);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  const mobile = (await panel.boundingBox())!;
  expect(mobile.width).toBeLessThan(391);
  if (process.env.E2E_PERFORMANCE_CAPTURE_DIR) {
    await panel.scrollIntoViewIfNeeded();
    await page.screenshot({
      path: path.join(process.env.E2E_PERFORMANCE_CAPTURE_DIR, "performance-mobile.png"),
    });
  }
  await page.getByRole("button", { name: "Drag Test breakdown panel", exact: true }).focus();
  await page.keyboard.press("ArrowUp");
  expect((await order())[0]).toBe("breakdown");
  await page.reload();
  await expect.poll(async () => (await order())[0]).toBe("breakdown");
  await page.getByRole("button", { name: "Reset panels", exact: true }).click();
  expect(errors).toEqual([]);
});
test("Performance date/filter boundaries, malformed layout and role exclusions", async ({
  page,
  browser,
  baseURL,
}) => {
  const s = await fixture();
  await page.goto(`/performance?preset=custom&start=2026-02-30&end=2026-03-01`);
  await expect(page.locator('.notice[role="alert"]')).toContainText("Enter both custom dates");
  await page.goto(
    `/performance?preset=custom&start=${s.date}&end=${s.date}&employeeId=${s.employeeId}`,
  );
  await expect(
    page.getByRole("heading", { name: "Employee performance", exact: true }),
  ).toBeAttached();
  await expect(page.locator('[data-performance-panel="employees"]')).toContainText(s.employeeName);
  await expect(page.locator('[data-performance-panel="daily-trends"]')).toContainText(
    "Comparison unavailable",
  );
  await page.getByRole("button", { name: "Reset panels", exact: true }).click();
  await page.evaluate(() => {
    const key = Object.keys(localStorage).find((k) =>
      k.startsWith("quick-pass:performance-layout:"),
    );
    if (!key) throw new Error("Layout was not saved");
    localStorage.setItem(key, "broken JSON");
  });
  await page.reload();
  await expect(page.locator("[data-performance-panel]")).toHaveCount(13);
  await expect(page.locator("[data-performance-panel]").first()).toHaveAttribute(
    "data-performance-panel",
    "totals",
  );
  await page.addInitScript(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key.startsWith("quick-pass:performance-layout:"))
        throw new DOMException("Storage blocked", "SecurityError");
      return original.call(this, key, value);
    };
  });
  await page.reload();
  await page.getByRole("button", { name: "Move Test breakdown earlier", exact: true }).click();
  await expect(page.locator("[data-performance-panel]").first()).toHaveAttribute(
    "data-performance-panel",
    "breakdown",
  );
  await expect(
    page.getByRole("status").filter({ hasText: "Browser storage unavailable" }),
  ).toBeVisible();
  for (const role of ["ADMIN", "EMPLOYEE", "BOOKKEEPER", "PUBLIC"]) {
    const context = await browser.newContext({
      baseURL,
      storageState:
        role === "PUBLIC"
          ? { cookies: [], origins: [] }
          : path.join(process.env.E2E_PRIVATE_DIR!, `${role}.json`),
    });
    try {
      const denied = await context.newPage();
      await denied.goto("/performance");
      await expect(denied).not.toHaveURL(/\/performance$/);
      await expect(
        denied.getByRole("heading", { name: "Employee performance", exact: true }),
      ).toHaveCount(0);
    } finally {
      await context.close();
    }
  }
});
