import { test, expect } from "@playwright/test";
import path from "node:path";
import { mkdir } from "node:fs/promises";

const directory = process.env.E2E_PRIVATE_DIR!;
for (const role of ["OWNER", "ADMIN"] as const) {
  test.describe(`${role} security viewing`, () => {
    test.use({
      storageState: path.join(directory, role === "OWNER" ? "session.json" : "ADMIN.json"),
    });
    test("future camera page has its own category and works on desktop and phone", async ({
      page,
    }) => {
      await page.goto("/dashboard");
      const navigation = page.getByRole("navigation", { name: "Main navigation", exact: true });
      const security = navigation.getByRole("list", { name: /^security$/i });
      const cameraLink = security.getByRole("link", { name: "Camera viewing", exact: true });
      await cameraLink.click();
      await expect(page).toHaveURL(/\/security$/);
      const main = page.locator("main");
      await expect(
        main.getByRole("heading", { name: "Camera viewing", exact: true }),
      ).toBeVisible();
      await expect(main.getByText("Coming soon", { exact: true })).toBeVisible();
      await expect(main.getByText("Not connected", { exact: true })).toBeVisible();
      await expect(main.getByRole("heading", { name: "Reolink camera system" })).toBeVisible();
      await expect(main).toContainText("Compatibility has not been confirmed yet.");
      await expect(main.locator("input, iframe, video")).toHaveCount(0);
      await expect(page.getByRole("navigation", { name: "Breadcrumb", exact: true })).toContainText(
        "Security",
      );
      await expect(cameraLink).toHaveAttribute("aria-current", "page");
      const theme = page.getByRole("button", { name: "Toggle theme", exact: true });
      for (const [name, width, height, dark] of [
        ["desktop", 1440, 1000, false],
        ["desktop-dark", 1440, 1000, true],
        ["tablet", 768, 1024, false],
        ["phone", 390, 844, false],
        ["phone-dark", 390, 844, true],
      ] as const) {
        await page.setViewportSize({ width, height });
        if (
          (await page.locator("html").evaluate((html) => html.classList.contains("dark"))) !== dark
        )
          await theme.click();
        await expect(
          main.getByRole("heading", { name: "Camera viewing", exact: true }),
        ).toBeVisible();
        await expect
          .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1))
          .toBe(true);
        if (role === "OWNER" && process.env.E2E_SECURITY_CAPTURE_DIR) {
          await mkdir(process.env.E2E_SECURITY_CAPTURE_DIR, { recursive: true });
          await page.evaluate(async () => {
            await document.fonts.ready;
            await new Promise<void>((resolve) =>
              requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
            );
          });
          await page.screenshot({
            path: `${process.env.E2E_SECURITY_CAPTURE_DIR}/security-${name}.png`,
            animations: "disabled",
          });
        }
      }
      await page.getByRole("button", { name: "Open navigation menu", exact: true }).click();
      await cameraLink.click();
      await expect(
        page.getByRole("button", { name: "Open navigation menu", exact: true }),
      ).toHaveAttribute("aria-expanded", "false");
      await page.reload();
      await expect(main.getByText("Coming soon", { exact: true })).toBeVisible();
    });
  });
}

test("camera page rejects anonymous and legacy non-management sessions", async ({ browser }) => {
  for (const role of [null, "EMPLOYEE", "BOOKKEEPER"] as const) {
    const context = await browser.newContext({
      storageState: role ? path.join(directory, `${role}.json`) : { cookies: [], origins: [] },
    });
    try {
      const page = await context.newPage();
      await page.goto("/security");
      await expect(page).toHaveURL(/\/login$/);
      await expect(page.getByRole("heading", { name: "Camera viewing", exact: true })).toHaveCount(
        0,
      );
    } finally {
      await context.close();
    }
  }
});
