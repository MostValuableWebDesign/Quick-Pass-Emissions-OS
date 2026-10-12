import { test, expect } from "@playwright/test";
import path from "node:path";
const directory = process.env.E2E_PRIVATE_DIR!;
for (const role of ["OWNER", "ADMIN"] as const) {
  test.describe(`${role} door access`, () => {
    test.use({
      storageState: path.join(directory, role === "OWNER" ? "session.json" : "ADMIN.json"),
    });
    test("secure setup page is truthful and responsive with no live credentials", async ({
      page,
    }) => {
      await page.goto("/dashboard");
      const security = page
        .getByRole("navigation", { name: "Main navigation", exact: true })
        .getByRole("list", { name: /^security$/i });
      await security.getByRole("link", { name: "Door access", exact: true }).click();
      await expect(page).toHaveURL(/\/security\/doors$/);
      const main = page.locator("main");
      await expect(main.getByRole("heading", { name: "Door access", exact: true })).toBeVisible();
      await expect(main.getByText("Not connected", { exact: true })).toBeVisible();
      await expect(main.getByText(/Schlage Encode BE489WB/)).toBeVisible();
      await expect(main.locator("input[type=password], iframe")).toHaveCount(0);
      await expect(main.getByRole("heading", { name: "Register a door" })).toHaveCount(
        role === "OWNER" ? 1 : 0,
      );
      for (const width of [1440, 768, 390]) {
        await page.setViewportSize({ width, height: 900 });
        await expect
          .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1))
          .toBe(true);
      }
      await page.reload();
      await expect(main.getByText("Not connected", { exact: true })).toBeVisible();
    });
  });
}
test("door page rejects anonymous and legacy sessions", async ({ browser }) => {
  for (const role of [null, "EMPLOYEE", "BOOKKEEPER"]) {
    const context = await browser.newContext({
      storageState: role ? path.join(directory, `${role}.json`) : { cookies: [], origins: [] },
    });
    try {
      const page = await context.newPage();
      await page.goto("/security/doors");
      await expect(page).toHaveURL(/\/login$/);
    } finally {
      await context.close();
    }
  }
});
