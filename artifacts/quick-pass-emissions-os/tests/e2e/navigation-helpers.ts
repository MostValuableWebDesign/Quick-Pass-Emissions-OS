import type { Page } from "@playwright/test";

export async function expandGroups(page: Page) {
  const navigation = page.getByRole("navigation", { name: "Main navigation" });
  const collapsedLabels = await navigation
    .locator('button[aria-expanded="false"]')
    .evaluateAll((buttons) =>
      buttons
        .map((button) => button.getAttribute("aria-label"))
        .filter((label): label is string => Boolean(label)),
    );
  for (const label of collapsedLabels) {
    const button = navigation.getByRole("button", { name: label, exact: true });
    if ((await button.getAttribute("aria-expanded")) === "false") await button.click();
  }
  for (const summary of await navigation.locator("details:not([open]) > summary").all())
    await summary.click();
  return navigation;
}
