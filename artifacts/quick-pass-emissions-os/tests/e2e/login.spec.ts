import { test, expect } from "@playwright/test";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

test.use({ storageState: { cookies: [], origins: [] } });
test("professional login branding, responsive form, keyboard access, errors and native sign-in", async ({
  page,
}) => {
  await page.goto("/login");
  await expect(page).toHaveTitle("Quick Pass Emissions");
  await expect(page.locator('meta[name="referrer"]')).toHaveAttribute("content", "same-origin");
  await expect(
    page.getByRole("region", { name: "Quick Pass Emissions", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: "Every detail. Under control." })).toBeVisible();
  const form = page.locator("form");
  await expect(form).toHaveAttribute("method", "post");
  await expect(form).toHaveAttribute("action", "/api/sign-in");
  const email = page.getByLabel("Email address", { exact: true });
  const password = page.getByLabel("Password", { exact: true });
  const submit = page.getByRole("button", { name: "Sign in", exact: true });
  await expect(email).toHaveAttribute("autocomplete", "username");
  await expect(password).toHaveAttribute("autocomplete", "current-password");
  await expect(password).toHaveAttribute("type", "password");
  await expect(password).toHaveValue("");
  await expect(page.locator(".login-service-art")).toHaveCount(0);
  expect(await submit.evaluate((button) => getComputedStyle(button).backgroundColor)).toBe(
    "rgb(48, 109, 41)",
  );
  await expect(page.locator(".login-professional")).toHaveCSS(
    "background-color",
    "rgb(251, 245, 221)",
  );
  await expect(page.locator(".login-brand")).toHaveCSS("background-color", "rgb(231, 225, 177)");
  await expect(page.locator(".login-form h2")).toHaveCSS("color", "rgb(13, 83, 14)");
  await expect(submit).toHaveCSS("color", "rgb(251, 245, 221)");
  for (const [name, width, height] of [
    ["desktop", 1440, 1000],
    ["tablet", 768, 1024],
    ["mobile", 390, 844],
  ] as const) {
    await page.setViewportSize({ width, height });
    await expect(email).toBeVisible();
    await expect(password).toBeVisible();
    await expect(submit).toBeVisible();
    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
      .toBe(true);
    if (name === "mobile")
      expect((await submit.boundingBox())!.y + (await submit.boundingBox())!.height).toBeLessThan(
        height,
      );
    await page.evaluate(async () => {
      await document.fonts.ready;
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      );
    });
    if (process.env.E2E_LOGIN_CAPTURE_DIR)
      await page.screenshot({
        path: `${process.env.E2E_LOGIN_CAPTURE_DIR}/login-${name}.png`,
        fullPage: name !== "desktop",
        animations: "disabled",
      });
  }
  await email.focus();
  await page.keyboard.press("Tab");
  await expect(password).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(submit).toBeFocused();
  await page.evaluate(() => document.documentElement.classList.add("dark"));
  expect(await submit.evaluate((button) => getComputedStyle(button).backgroundColor)).toBe(
    "rgb(48, 109, 41)",
  );
  for (const [error, text] of [
    ["rate_limit", "Too many sign-in attempts"],
    ["security", "browser security validation"],
    ["unavailable", "Cannot connect"],
    ["invalid", "Unable to sign in"],
  ]) {
    await page.goto(`/login?error=${error}`);
    await expect(page.locator(".error-text[role=alert]")).toContainText(text);
    await expect(password).toHaveValue("");
  }
  const fixture = JSON.parse(
    await readFile(path.join(process.env.E2E_PRIVATE_DIR!, "workflow.json"), "utf8"),
  ) as { password: string; accounts: Record<string, string> };
  await page.goto("/login");
  await email.fill(fixture.accounts["owner@example.test"]);
  await password.fill(fixture.password);
  const submitted = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" && new URL(response.url()).pathname === "/api/sign-in",
  );
  await submit.click();
  const response = await submitted;
  if (process.env.E2E_LOGIN_CAPTURE_DIR)
    await writeFile(
      path.join(process.env.E2E_LOGIN_CAPTURE_DIR, "login-result.json"),
      JSON.stringify({ status: response.status(), location: response.headers().location }),
      { mode: 0o600 },
    );
  expect(response.status()).toBe(303);
  expect(response.headers().location).toBe("/dashboard");
  await expect(page).toHaveURL(/\/dashboard$/);
  const protectedPage = await page.request.get("/dashboard");
  expect(protectedPage.headers()["referrer-policy"]).toBe("no-referrer");
  await protectedPage.dispose();
});
