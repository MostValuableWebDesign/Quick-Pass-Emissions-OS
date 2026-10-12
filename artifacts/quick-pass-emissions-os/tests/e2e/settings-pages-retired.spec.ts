import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import path from "node:path";

async function fixture() {
  return JSON.parse(
    await readFile(path.join(process.env.E2E_PRIVATE_DIR!, "navigation.json"), "utf8"),
  ) as {
    station: { date: string };
  };
}

test("removed station and configuration pages redirect, while performance export stays private", async ({
  browser,
  baseURL,
}) => {
  const { station } = await fixture();
  const ownerContext = await browser.newContext({
    baseURL,
    storageState: path.join(process.env.E2E_PRIVATE_DIR!, "OWNER.json"),
  });
  try {
    const ownerPage = await ownerContext.newPage();
    for (const route of ["/settings/station-data", "/settings/import"]) {
      await ownerPage.goto(route);
      await expect(ownerPage).toHaveURL(/\/settings$/);
      await expect(ownerPage.getByRole("heading", { name: "Business settings" })).toBeVisible();
    }
    await expect(ownerPage.getByRole("heading", { name: "Station settings" })).toBeVisible();
    await expect(
      ownerPage.getByRole("heading", { name: "Business configuration import & review" }),
    ).toHaveCount(0);
    const navigation = ownerPage.getByRole("navigation", { name: "Main navigation" });
    await navigation.getByRole("button", { name: "Settings" }).hover();
    await expect(navigation.locator('a[href="/settings/station-data"]')).toHaveCount(0);
    await expect(navigation.locator('a[href="/settings/import"]')).toHaveCount(0);
  } finally {
    await ownerContext.close();
  }

  for (const role of ["EMPLOYEE", "ADMIN", "BOOKKEEPER", "PUBLIC"]) {
    const context = await browser.newContext({
      baseURL,
      storageState:
        role === "PUBLIC"
          ? { cookies: [], origins: [] }
          : path.join(process.env.E2E_PRIVATE_DIR!, `${role}.json`),
    });
    try {
      const page = await context.newPage();
      await page.goto("/performance");
      await expect(page).not.toHaveURL(/\/performance$/);
      for (const route of ["/settings/station-data", "/settings/import", "/performance/settings"]) {
        await page.goto(route);
        await expect(page).not.toHaveURL(/\/settings\/(station-data|import)$|\/performance\/settings$/);
      }
      await page.goto("/performance/tests/not-real");
      await expect(page).not.toHaveURL(/\/performance\/tests\//);
      const response = await context.request.get(
        `/api/performance/export?start=${station.date}&end=${station.date}`,
        { maxRedirects: 0 },
      );
      expect(response.status()).not.toBe(200);
      expect(await response.text()).not.toContain("source_timestamp");
    } finally {
      await context.close();
    }
  }
});
