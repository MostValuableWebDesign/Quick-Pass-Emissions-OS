import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import path from "node:path";
import { mkdir } from "node:fs/promises";
test("owner reviewed references persist on desktop/mobile without transactions or privileged bypass", async ({
  page,
  browser,
}) => {
  test.setTimeout(240000);
  const id = randomUUID();
  const name = `Import fixture supplier ${id}`;
  const chemical = `Import fixture chemical ${id}`;
  const manifest = JSON.stringify({
    sourceName: "Synthetic browser operations",
    sourceFingerprint: "c".repeat(64),
    items: [
      {
        entity: "VENDOR",
        key: "vendor",
        section: "Synthetic supplier section",
        values: {
          name,
          contact: "",
          phone: "555-fixture",
          email: "",
          services: "Fixture parts",
          reference: `fixture-${id}`,
          notes: "",
        },
      },
      {
        entity: "CHEMICAL",
        key: "chemical",
        section: "Synthetic catalog section",
        values: { name: chemical, notes: "Synthetic, no unit or stock inferred." },
      },
      {
        entity: "CERTIFICATES",
        key: "certificates",
        section: "Synthetic order minimum",
        values: { minimumOrder: 300 },
      },
      {
        entity: "REVIEW",
        key: "review",
        section: "Synthetic compensation section",
        values: {
          title: "Identity/effective date missing",
          details: "No pay or shifts authorized.",
          required: "Owner identity mapping and effective date",
        },
      },
    ],
  });
  const db = new PrismaClient();
  const screenshots = path.resolve("../../generated-artifacts/business-import");
  await mkdir(screenshots, { recursive: true });
  const item = page.locator("section").filter({
    has: page.getByRole("heading", { name: `${chemical} · Unknown stock`, exact: true }),
  });
  try {
    const history = () =>
      Promise.all([
        db.certificateMovement.findMany(),
        db.chemicalMovement.findMany(),
        db.payArrangement.findMany(),
        db.payrollDraft.findMany(),
        db.dealerInvoice.findMany(),
        db.employeeSchedule.findMany(),
        db.bayRentalAgreement.findMany(),
        db.taskInstance.findMany(),
      ]);
    const before = JSON.stringify(await history());
    await page.goto("/settings/import");
    await page
      .getByLabel("Reviewed structured manifest · private business information")
      .fill(manifest);
    await page.getByRole("button", { name: "Preview without writing" }).click();
    await expect(page.getByText("Dry run only. No business data was written.")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Proposed field-level changes" })).toBeVisible();
    expect(await db.vendor.count({ where: { name } })).toBe(0);
    await page.getByRole("checkbox").check();
    await page.getByRole("button", { name: "Back up and apply reviewed changes" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Import committed:" })).toContainText(
      "3 created",
    );
    await page.reload();
    await page.getByText("Synthetic browser operations", { exact: false }).click();
    await expect(page.getByText("review · skipped", { exact: true })).toBeVisible();
    await expect(page.getByText("No pay or shifts authorized.", { exact: true })).toBeVisible();
    await page.goto("/chemicals");
    await expect(item).toHaveCount(1);
    await item.getByText("Edit item settings", { exact: true }).click();
    await expect(item.locator('select[name="unit"]')).toHaveValue("");
    await expect(item.locator('input[name="reorderPoint"]')).toHaveValue("");
    await expect(item.getByRole("button", { name: "Record chemical movement" })).toHaveCount(0);
    expect(await item.locator('select[name="vendorId"] option').allTextContents()).not.toContain(
      name,
    );
    await page.screenshot({ path: path.join(screenshots, "desktop.jpg") });
    await page.goto("/certificates");
    await expect(page.locator('input[name="minimumOrder"]')).toHaveValue("300");
    await expect(page.locator('input[name="reorderPoint"]')).toHaveValue("");
    await page.goto("/vendors");
    const vendor = page
      .locator("section")
      .filter({ has: page.getByRole("heading", { name: new RegExp(`^${name} ·`) }) });
    await vendor.getByText("Edit verified details", { exact: true }).click();
    await expect(vendor.locator('input[name="verifiedDate"]')).toHaveValue("");
    // A separate owner verification action is necessary before operational choices.
    await vendor.locator('input[name="contact"]').fill("Fixture verified department");
    await vendor.locator('input[name="verifiedDate"]').fill("2026-01-01");
    await vendor
      .locator('textarea[name="reason"]')
      .fill("Synthetic independent contact verification");
    await vendor.getByRole("button", { name: "Update vendor", exact: true }).click();
    await expect(vendor.getByRole("status")).toHaveText("Saved successfully.");
    await page.goto("/chemicals");
    await item.getByText("Edit item settings", { exact: true }).click();
    expect(await item.locator('select[name="vendorId"] option').allTextContents()).toContain(name);
    await item.locator('select[name="unit"]').selectOption("ML");
    await item.locator('input[name="reorderPoint"]').fill("10");
    await item.locator('textarea[name="reason"]').fill("Synthetic staff configuration");
    await item.getByRole("button", { name: "Update chemical item" }).click();
    await expect(item.getByRole("status")).toHaveText("Saved successfully.");
    await page.reload();
    await item.getByText("Edit item settings", { exact: true }).click();
    await expect(item.locator('select[name="unit"]')).toHaveValue("ML");
    await expect(item.locator('input[name="reorderPoint"]')).toHaveValue("10");
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/settings/import");
    await page
      .getByLabel("Reviewed structured manifest · private business information")
      .fill(manifest);
    await page.getByRole("button", { name: "Preview without writing" }).click();
    await expect(page.getByRole("heading", { name: "Proposed field-level changes" })).toBeVisible();
    await page.getByRole("checkbox").check();
    await page.getByRole("button", { name: "Back up and apply reviewed changes" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Import committed:" })).toContainText(
      "2 conflicted",
    );
    await page.reload();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 2),
    ).toBe(true);
    await page.screenshot({ path: path.join(screenshots, "mobile.jpg") });
    expect(await db.vendor.count({ where: { name } })).toBe(1);
    expect(await db.chemicalItem.count({ where: { name: chemical } })).toBe(1);
    expect(JSON.stringify(await history())).toBe(before);
    for (const role of ["ADMIN", "BOOKKEEPER", "EMPLOYEE"]) {
      const context = await browser.newContext({
        storageState: path.join(process.env.E2E_PRIVATE_DIR!, `${role}.json`),
      });
      const restricted = await context.newPage();
      await restricted.goto("/settings/import");
      await expect(
        restricted.getByLabel("Reviewed structured manifest · private business information"),
      ).toHaveCount(0);
      await expect(
        restricted.getByText("Synthetic browser operations", { exact: false }),
      ).toHaveCount(0);
      await context.close();
    }
  } finally {
    await db.$disconnect();
  }
});
