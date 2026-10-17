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
  const chooseTheme = async (dark: boolean, returnTo: string) => {
    await page.goto("/settings/account");
    const setting = page.locator(".settings-appearance-row button");
    await expect(setting).toBeVisible();
    await expect
      .poll(async () => {
        const currentDark = await page
          .locator("html")
          .evaluate((html) => html.classList.contains("dark"));
        return (await setting.getAttribute("aria-pressed")) === String(currentDark);
      })
      .toBe(true);
    const current = await page.locator("html").evaluate((html) => html.classList.contains("dark"));
    if (current !== dark)
      await page
        .getByRole("button", { name: `Switch to ${dark ? "dark" : "light"} theme`, exact: true })
        .click();
    await expect(page.locator("html")).toHaveClass(dark ? /dark/ : /light/);
    await expect
      .poll(() => page.evaluate(() => localStorage.getItem("theme")))
      .toBe(dark ? "dark" : "light");
    await page.goto(returnTo);
    await expect(page.locator("html")).toHaveClass(dark ? /dark/ : /light/);
  };
  const setVisualTheme = async (dark: boolean) => {
    await page.evaluate(
      (theme) => {
        localStorage.setItem("theme", theme);
        document.documentElement.classList.remove("dark", "light");
        document.documentElement.classList.add(theme);
      },
      dark ? "dark" : "light",
    );
    await expect(page.locator("html")).toHaveClass(dark ? /dark/ : /light/);
  };
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/settings/account");
  const sidebarLogo = page.locator(".brand-logo");
  await expect(sidebarLogo).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Quick Pass Emissions dashboard", exact: true }),
  ).toBeVisible();
  await expect
    .poll(() => sidebarLogo.evaluate((image) => (image as HTMLImageElement).naturalWidth))
    .toBe(2172);
  const initialDark = await page
    .locator("html")
    .evaluate((html) => html.classList.contains("dark"));
  // Exercise the real control in both directions and verify persistence across navigation.
  await chooseTheme(!initialDark, "/dashboard");
  await chooseTheme(true, "/dashboard");
  await chooseTheme(false, "/dashboard");
  await expect(page.locator("html")).toHaveClass(/light/);
  await page.evaluate(() => document.fonts.ready);
  await expect(page.locator("body")).toHaveCSS("background-color", "rgb(248, 250, 252)");
  await expect(page.locator(".sidebar")).toHaveCSS("background-color", "rgb(0, 52, 91)");
  await expect(page.locator("main#main h1").first()).toHaveCSS("color", "rgb(52, 59, 63)");
  expect(
    await page
      .locator("main#main h1")
      .first()
      .evaluate((heading) => getComputedStyle(heading).fontFamily),
  ).toContain("Barlow Condensed");
  expect(await page.evaluate(() => document.fonts.check('700 16px "Barlow Condensed"'))).toBe(true);
  await expect(page.locator(".nav-link.active")).toHaveCSS("background-color", "rgb(0, 120, 189)");
  await expect(page.locator(".nav-link.active")).toHaveCSS("color", "rgb(255, 255, 255)");
  // Check the browser's resolved theme colors, including readable dark-mode variants.
  for (const dark of [false, true]) {
    if (dark) await setVisualTheme(true);
    const contrast = await page.evaluate(() => {
      const style = getComputedStyle(document.documentElement);
      const luminance = (variable: string) => {
        const value = style.getPropertyValue(variable).trim().slice(1);
        const hex = value.length === 3 ? [...value].map((digit) => digit + digit).join("") : value;
        return [0.2126, 0.7152, 0.0722].reduce((sum, weight, index) => {
          const channel = parseInt(hex.slice(index * 2, index * 2 + 2), 16) / 255;
          return (
            sum +
            weight * (channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4)
          );
        }, 0);
      };
      return [
        ["--text", "--bg", 4.5],
        ["--muted", "--surface", 4.5],
        ["--muted", "--soft", 4.5],
        ["--nav-text", "--nav-bg", 4.5],
        ["--nav-muted", "--nav-bg", 4.5],
        ["--nav-active-text", "--nav-active", 4.5],
        ["--on-action", "--action", 4.5],
        ["--link", "--bg", 4.5],
        ["--link", "--soft", 4.5],
        ["--success", "--success-bg", 4.5],
        ["--warning", "--warning-bg", 4.5],
        ["--danger", "--danger-bg", 4.5],
        ["--action", "--surface", 3],
        ["--chart-blue", "--surface", 3],
        ["--chart-green", "--surface", 3],
        ["--chart-neutral", "--surface", 3],
        ["--focus", "--surface", 3],
        ["--input-line", "--surface", 3],
      ].map(([foreground, background, minimum]) => {
        const values = [luminance(String(foreground)), luminance(String(background))].sort(
          (a, b) => a - b,
        );
        return {
          foreground,
          background,
          minimum: Number(minimum),
          ratio: (values[1] + 0.05) / (values[0] + 0.05),
        };
      });
    });
    for (const pair of contrast)
      expect(
        pair.ratio,
        `${dark ? "dark" : "light"} ${pair.foreground} on ${pair.background}`,
      ).toBeGreaterThanOrEqual(pair.minimum);
    if (dark) {
      await expect(page.locator("body")).toHaveCSS("background-color", "rgb(13, 27, 41)");
      await expect(page.locator(".sidebar")).toHaveCSS("background-color", "rgb(7, 29, 50)");
      await expect(page.locator("main#main h1").first()).toHaveCSS("color", "rgb(244, 247, 250)");
    }
  }
  await setVisualTheme(false);
  const links = await page
    .getByRole("navigation", { name: "Main navigation", exact: true })
    .locator("a[href]")
    .evaluateAll((anchors) => anchors.map((a) => a.getAttribute("href")!));
  expect(links).toContain("/payroll");
  expect(links).toContain("/performance");
  expect(links).toContain("/invoices");
  for (const href of [...new Set([...links, "/reports"])]) {
    const response = await page.goto(href);
    expect(response?.status(), href).toBe(200);
    await expect(page.locator("main#main h1").first()).toBeVisible();
    await expect(page.getByText("Loading your workspace…", { exact: true })).toHaveCount(0);
    await expect(page.locator("html")).toHaveClass(/light/);
    await expect(page.getByText("Something went wrong", { exact: true })).toHaveCount(0);
    await expect(
      page.locator('nav[aria-label="Main navigation"] [aria-current="page"]'),
    ).toHaveCount(href === "/reports" ? 0 : 1);
    if (href === "/performance") {
      const selected = page.locator('.pd-seg button[aria-pressed="true"]').first();
      await expect(selected).toHaveCSS("background-color", "rgb(0, 120, 189)");
      await expect(selected).toHaveCSS("color", "rgb(255, 255, 255)");
    }
    for (const [name, width, height, dark] of [
      ["desktop", 1440, 1000, false],
      ["tablet", 768, 1024, false],
      ["phone", 390, 844, false],
      ["phone-dark", 390, 844, true],
      ["desktop-dark", 1440, 1000, true],
    ] as const) {
      await page.setViewportSize({ width, height });
      const isDark = await page.locator("html").evaluate((html) => html.classList.contains("dark"));
      if (isDark !== dark) await setVisualTheme(dark);
      await expect(page.locator("html")).toHaveClass(dark ? /dark/ : /light/);
      await expect
        .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), {
          message: `${href} fits ${name}`,
        })
        .toBe(true);
      if (
        ["/dashboard", "/payroll", "/performance", "/invoices", "/reports"].includes(href) &&
        ["desktop", "phone", "desktop-dark"].includes(name)
      )
        await capture(`${href.slice(1)}-${name}`);
    }
    await setVisualTheme(false); // Return to light before testing the next route.
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/dealerships");
  await page.getByRole("button", { name: "Add dealership", exact: true }).click();
  const addDialog = page.getByRole("dialog", { name: "Add dealership", exact: true });
  await expect(addDialog).toBeVisible();
  await expect(addDialog).toHaveCSS("background-color", "rgb(255, 255, 255)");
  const dealerName = addDialog.getByLabel("Dealership name", { exact: true });
  await expect(dealerName).toHaveCSS("background-color", "rgb(255, 255, 255)");
  await expect(dealerName).toHaveCSS("border-top-color", "rgb(113, 128, 138)");
  expect(
    await addDialog.locator("form").evaluate((form) => (form as HTMLFormElement).checkValidity()),
  ).toBe(false);
  await capture("dealership-form-dialog");
  await page.setViewportSize({ width: 390, height: 844 });
  await expect
    .poll(() =>
      addDialog.evaluate((dialog) => {
        const rect = dialog.getBoundingClientRect();
        return rect.left >= 0 && rect.right <= innerWidth;
      }),
    )
    .toBe(true);
  await capture("dealership-form-dialog-phone");
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/invite#synthetic-invite");
  await expect(page.getByRole("heading", { name: "Your workspace is ready." })).toBeVisible();
  const invitePassword = page.getByLabel("New password", { exact: true });
  await expect(invitePassword).toHaveCSS("background-color", "rgb(255, 255, 255)");
  await capture("invite-form-desktop");
  await page.setViewportSize({ width: 390, height: 844 });
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1))
    .toBe(true);
  await capture("invite-form-phone");
  await setVisualTheme(true);
  await expect(page.locator("body")).toHaveCSS("background-color", "rgb(13, 27, 41)");
  await expect(invitePassword).toHaveCSS("background-color", "rgb(20, 38, 56)");
  await capture("invite-form-dark");
  await setVisualTheme(false);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/settings/account");
  await capture("account-settings-desktop");
  const password = page.getByLabel("Current password", { exact: true });
  await password.focus();
  await expect(password).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.getByLabel("New password", { exact: true })).toBeFocused();
  await expect(page.getByLabel("New password", { exact: true })).toHaveCSS(
    "outline-color",
    "rgb(0, 120, 189)",
  );
  await page.getByRole("button", { name: "Collapse navigation", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Expand navigation", exact: true }),
  ).toHaveAttribute("aria-expanded", "false");
  await expect(sidebarLogo).toBeHidden();
  await expect(page.locator(".brand-icon")).toBeVisible();
  await page.getByRole("button", { name: "Expand navigation", exact: true }).click();
  await expect(sidebarLogo).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  const menu = page.getByRole("button", { name: "Open navigation menu", exact: true });
  await menu.click();
  await expect(page.locator("#primary-navigation a").first()).toBeFocused();
  await capture("mobile-navigation-open");
  await page.keyboard.press("Escape");
  await expect(menu).toBeFocused();
  await expect(menu).toHaveAttribute("aria-expanded", "false");
  expect(errors).toEqual([]);
});
