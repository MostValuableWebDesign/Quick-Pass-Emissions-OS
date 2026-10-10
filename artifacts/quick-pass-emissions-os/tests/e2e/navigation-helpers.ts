import type { Page } from "@playwright/test";

export async function expandGroups(page: Page) {
  const navigation = page.getByRole("navigation", { name: "Main navigation" });
  for (const button of await navigation.locator('button[aria-expanded="false"]').all())
    await button.click();
  for (const summary of await navigation.locator("details:not([open]) > summary").all())
    await summary.click();
  return navigation;
}
