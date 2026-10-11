import { test, expect } from "@playwright/test";
import { mkdir } from "node:fs/promises";

// Uses only runner-owned synthetic data and authenticated management state.
test("workspace pages remain usable in light, dark, tablet and phone layouts", async ({ page }) => {
  test.setTimeout(600000);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const capture = async (name: string) => {
    if (!process.env.E2E_THEME_CAPTURE_DIR) return;
    await mkdir(process.env.E2E_THEME_CAPTURE_DIR, { recursive: true });
    await page.evaluate(async () => {
      await document.fonts.ready;
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      );
    });
    await page.screenshot({
      path: `${process.env.E2E_THEME_CAPTURE_DIR}/${name}.png`,
      animations: "disabled",
    });
  };
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/dashboard");
  // Exercise the real theme control; the preference must survive navigation.
  const toggle = page.getByRole("button", { name: "Toggle theme", exact: true });
  if (await page.locator("html").evaluate((html) => html.classList.contains("dark")))
    await toggle.click();
  await expect(page.locator("html")).toHaveClass(/light/);
  const links = await page
    .getByRole("navigation", { name: "Main navigation", exact: true })
    .locator("a[href]")
    .evaluateAll((anchors) => anchors.map((a) => a.getAttribute("href")!));
  expect(links).toContain("/payroll");
  expect(links).toContain("/performance");
  expect(links).toContain("/finance");
  for (const href of links) {
    const response = await page.goto(href);
    expect(response?.status(), href).toBe(200);
    await expect(page.locator("main#main h1").first()).toBeVisible();
    await expect(page.getByText("Loading your workspace…", { exact: true })).toHaveCount(0);
    await expect(page.locator("html")).toHaveClass(/light/);
    await expect(page.getByText("Something went wrong", { exact: true })).toHaveCount(0);
    await expect(
      page.locator('nav[aria-label="Main navigation"] [aria-current="page"]'),
    ).toHaveCount(1);
    for (const [name, width, height, dark] of [
      ["desktop", 1440, 1000, false],
      ["tablet", 768, 1024, false],
      ["phone", 390, 844, false],
      ["phone-dark", 390, 844, true],
      ["desktop-dark", 1440, 1000, true],
    ] as const) {
      await page.setViewportSize({ width, height });
      const isDark = await page.locator("html").evaluate((html) => html.classList.contains("dark"));
      if (isDark !== dark) await toggle.click();
      await expect(page.locator("html")).toHaveClass(dark ? /dark/ : /light/);
      await expect
        .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), {
          message: `${href} fits ${name}`,
        })
        .toBe(true);
      if (
        ["/dashboard", "/payroll", "/performance", "/finance"].includes(href) &&
        ["desktop", "phone", "desktop-dark"].includes(name)
      )
        await capture(`${href.slice(1)}-${name}`);
    }
    await toggle.click(); // Return to light and verify the next navigation preserves it.
  }
  await page.goto("/account/password");
  const password = page.getByLabel("Current password", { exact: true });
  await password.focus();
  await expect(password).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.getByLabel("New password", { exact: true })).toBeFocused();
  await page.getByRole("button", { name: "Collapse navigation", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Expand navigation", exact: true }),
  ).toHaveAttribute("aria-expanded", "false");
  await page.getByRole("button", { name: "Expand navigation", exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  const menu = page.getByRole("button", { name: "Open navigation menu", exact: true });
  await menu.click();
  await expect(page.locator("#primary-navigation a").first()).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(menu).toBeFocused();
  await expect(menu).toHaveAttribute("aria-expanded", "false");
  expect(errors).toEqual([]);
});
