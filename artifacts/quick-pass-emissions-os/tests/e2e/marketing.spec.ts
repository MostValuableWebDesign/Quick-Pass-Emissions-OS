import { expect, test } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { businessDate } from "../../src/lib/time";

test("owner creates, edits, reports and archives a persistent campaign", async ({ page }) => {
  const suffix = randomUUID().slice(0, 8);
  const title = `Fixture campaign ${suffix}`;
  const renamed = `${title} revised`;
  const today = businessDate();
  await page.goto("/marketing");
  await expect(page.getByRole("heading", { name: "Marketing", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "New campaign", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "New campaign", exact: true });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel("Campaign name", { exact: true }).fill(title);
  await dialog.getByLabel("Channel", { exact: true }).selectOption("FLYERS");
  await dialog.getByLabel("Start date", { exact: true }).fill(today);
  await dialog.getByLabel("End date", { exact: true }).fill(today);
  await dialog.getByLabel("Planned budget · USD", { exact: true }).fill("100.00");
  await dialog.getByLabel("Status", { exact: true }).selectOption("ACTIVE");
  await dialog.getByRole("button", { name: "Create campaign", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await page.getByRole("link", { name: title, exact: true }).click();
  await expect(page.getByRole("heading", { name: title, exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Edit campaign", exact: true }).click();
  const edit = page.getByRole("dialog", { name: "Edit campaign", exact: true });
  await edit.getByLabel("Campaign name", { exact: true }).fill(renamed);
  await edit.getByRole("button", { name: "Save campaign", exact: true }).click();
  await expect(edit).not.toBeVisible();
  await expect(page.getByRole("heading", { name: renamed, exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Record expense", exact: true }).click();
  const expense = page.getByRole("dialog", { name: "Record expense", exact: true });
  await expense.locator('[name="date"]').fill(today);
  await expense.locator('[name="amount"]').fill("25.00");
  await expense.locator('[name="description"]').fill("Fixture flyer printing");
  await expense.locator('[name="reference"]').fill(`fixture-expense-${suffix}`);
  await expense.getByRole("button", { name: "Record expense", exact: true }).click();
  await expect(expense).not.toBeVisible();
  await expect(page.getByText("Fixture flyer printing", { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.locator(".mk-metric").filter({ hasText: "Spending in period" })).toContainText(
    "25.00",
  );
  await expect(
    page.locator(".mk-metric").filter({ hasText: "Attributed paid inspections" }),
  ).toContainText("0");
  await expect(
    page.locator(".mk-metric").filter({ hasText: "Receipt-linked collected revenue" }),
  ).toContainText("0.00");
  await page.getByRole("button", { name: "New material draft", exact: true }).click();
  const material = page.getByRole("dialog", { name: "New material draft", exact: true });
  await material.locator('[name="title"]').fill("Fixture flyer copy");
  await material.locator('[name="copy"]').fill("A draft offer for review, not published.");
  await material.getByRole("button", { name: "Save draft", exact: true }).click();
  await expect(material).not.toBeVisible();
  await expect(page.getByText("Fixture flyer copy", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Archive campaign", exact: true }).click();
  await expect(
    page.getByText("Archived. History is kept read-only.", { exact: false }),
  ).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: renamed, exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Edit campaign", exact: true })).toHaveCount(0);
  await expect(page.getByText("Fixture flyer printing", { exact: true })).toBeVisible();
  const out = path.resolve("../../generated-artifacts");
  await mkdir(out, { recursive: true });
  await page.screenshot({
    path: path.join(out, "marketing-campaign-verified.png"),
    fullPage: true,
  });
});
