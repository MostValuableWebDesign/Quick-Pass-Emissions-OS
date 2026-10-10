import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { mkdir } from "node:fs/promises";
import { CATEGORIES } from "../../src/modules/support/rules";
test("service support directory persists role-safe contacts and separate maintenance associations on desktop/mobile", async ({
  page,
  browser,
}) => {
  test.setTimeout(240000);
  const db = new PrismaClient();
  const directory = process.env.E2E_PRIVATE_DIR!;
  const name = `Support fixture ${randomUUID()}`;
  const shots = path.resolve("../../generated-artifacts/support");
  await mkdir(shots, { recursive: true });
  try {
    const owner = await db.user.findFirstOrThrow({ where: { role: "OWNER" } });
    const employee = await db.user.findFirstOrThrow({
      where: { role: "EMPLOYEE" },
      include: { employee: true },
    });
    const vendor = await db.vendor.create({
      data: {
        name,
        contact: "Synthetic support team",
        phone: "(800) 555-0123",
        email: "support@example.test",
        services: "Service",
        reference: "PRIVATE-VERIFICATION",
        notes: "PRIVATE-NOTES",
        verifiedDate: "2026-01-01",
        categories: [CATEGORIES[0], CATEGORIES[2]],
        accountReference: "PRIVATE-ACCOUNT",
        extension: "123",
        website: "https://example.test",
      },
    });
    const unconfirmed = await db.vendor.create({
      data: {
        name: `${name} unconfirmed`,
        contact: "",
        phone: "",
        email: "",
        services: "Unknown",
        reference: "",
        categories: [CATEGORIES[1]],
      },
    });
    const equipment = await db.equipment.create({
      data: { code: randomUUID(), name: "Support fixture pump", category: "PUMP" },
    });
    const ticket = await db.maintenanceTicket.create({
      data: {
        title: "Support fixture owned report",
        description: "Synthetic issue",
        priority: "NORMAL",
        equipmentId: equipment.id,
        assignedId: employee.employee!.id,
        reportedBy: employee.id,
        targetDate: "2026-01-01",
        dueAt: new Date("2026-01-01T22:00:00Z"),
        repairCostCents: 9876,
      },
    });
    await page.goto("/vendors");
    await page.getByRole("searchbox").fill(name);
    await page.getByRole("button", { name: "Apply filters" }).click();
    await expect(page.getByRole("link", { name, exact: true })).toHaveCount(1);
    await page.locator('select[name="category"]').selectOption(CATEGORIES[0]);
    await page.getByRole("button", { name: "Apply filters" }).click();
    await expect(page.getByRole("link", { name: `${name} unconfirmed`, exact: true })).toHaveCount(
      0,
    );
    const pref = page
      .locator("form")
      .filter({ has: page.getByRole("heading", { name: CATEGORIES[0], exact: true }) });
    await pref.locator('select[name="vendorId"]').selectOption(vendor.id);
    await pref.locator('[name="reason"]').fill("Explicit synthetic preference");
    await pref.getByRole("button", { name: "Save preference" }).click();
    await expect(pref.getByRole("status")).toHaveText("Saved successfully.");
    await page.getByRole("link", { name, exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/vendors/${vendor.id}$`));
    await expect(page.locator('a[href="tel:8005550123"]')).toHaveCount(1);
    await expect(page.getByText("Extension 123:", { exact: false })).toBeVisible();
    await expect(page.locator('a[href="mailto:support@example.test"]')).toHaveCount(1);
    await expect(
      page.getByRole("link", { name: "Website (external site, opens new tab)" }),
    ).toHaveAttribute("rel", "noopener noreferrer");
    const edit = page
      .locator("form")
      .filter({ has: page.getByRole("button", { name: "Save directory details" }) });
    await edit.locator('[name="hours"]').fill("Synthetic hours only");
    await edit.locator('[name="reason"]').fill("Synthetic support metadata");
    await edit.getByRole("button", { name: "Save directory details" }).click();
    await expect(edit.getByRole("status")).toHaveText("Saved successfully.");
    const associate = page
      .locator("form")
      .filter({ has: page.getByRole("button", { name: "Add equipment", exact: true }) });
    await associate.locator('select[name="equipmentId"]').selectOption(equipment.id);
    await associate.locator('[name="reason"]').fill("Synthetic target support");
    await associate.getByRole("button", { name: "Add equipment", exact: true }).click();
    await expect(associate.getByRole("status")).toHaveText("Saved successfully.");
    await page.reload();
    await expect(page.getByText("Synthetic hours only", { exact: false }).first()).toBeVisible();
    const employeeContext = await browser.newContext({
      storageState: path.join(directory, "ADMIN.json"),
    });
    const staff = await employeeContext.newPage();
    await staff.goto(`/vendors/${vendor.id}`);
    const staffHtml = await staff.content();
    expect(staffHtml).toContain("PRIVATE-");

    await expect(staff.getByRole("button", { name: "Save directory details" })).toBeVisible();
    await staff.getByText("Log a contact (self-reported)", { exact: true }).click();
    const log = staff
      .locator("form")
      .filter({ has: staff.getByRole("button", { name: "Log self-reported contact" }) });
    await log.locator('input[type="datetime-local"]').fill("2026-01-01T12:00");
    await log.locator('select[name="ticketId"]').selectOption(ticket.id);
    await log.locator('[name="outcome"]').fill("Synthetic conversation outcome");
    await log.locator('[name="reference"]').fill("Synthetic case reference");
    await log.getByRole("button", { name: "Log self-reported contact" }).click();
    await expect(log.getByRole("status")).toHaveText("Saved successfully.");
    await staff.reload();
    await expect(staff.getByText("Synthetic conversation outcome", { exact: true })).toBeVisible();
    await staff.goto(`/maintenance/${ticket.id}`);
    const select = staff
      .locator("form")
      .filter({ has: staff.getByRole("button", { name: "Associate provider only" }) });
    await select.locator('select[name="vendorId"]').selectOption(vendor.id);
    await select.locator('[name="reason"]').fill("Synthetic staff provider selection");
    await select.getByRole("button", { name: "Associate provider only" }).click();
    await expect(select.getByRole("status")).toHaveText("Saved successfully.");
    await staff.reload();
    await expect(staff.getByRole("link", { name, exact: true }).first()).toBeVisible();
    const saved = await db.maintenanceTicket.findUniqueOrThrow({ where: { id: ticket.id } });
    expect(saved.vendorId).toBe(vendor.id);
    expect(saved.status).toBe("OPEN");
    expect(saved.repairCostCents).toBe(9876);
    expect(saved.assignedId).toBe(employee.employee!.id);
    await staff.setViewportSize({ width: 390, height: 844 });
    await staff.goto(`/vendors/${vendor.id}`);
    expect(await staff.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await staff.screenshot({ path: path.join(shots, "manager-mobile.jpg") });
    await staff.goto(`/vendors?search=${encodeURIComponent(name)}`);
    await staff.getByRole("searchbox").focus();
    await staff.keyboard.press("Tab");
    expect(
      await staff.locator("select[name=category]").evaluate((el) => el === document.activeElement),
    ).toBe(true);
    expect(await staff.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await staff.screenshot({ path: path.join(shots, "directory-mobile.jpg") });
    const book = await browser.newContext({
      storageState: path.join(directory, "BOOKKEEPER.json"),
    });
    const denied = await book.request.get("/vendors");
    expect(await denied.text()).not.toContain(name);
    await book.close();
    await page.goto(`/vendors/${vendor.id}`);
    const archive = page
      .locator("form")
      .filter({ has: page.getByRole("button", { name: "Archive provider" }) });
    await archive.locator('[name="reason"]').fill("Synthetic archival");
    await archive.getByRole("button", { name: "Archive provider" }).click();
    await expect(page.getByRole("button", { name: "Reactivate provider" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Log self-reported contact" })).toHaveCount(0);
    expect(await db.supportContactHistory.count({ where: { vendorId: vendor.id } })).toBe(1);
    expect(
      (await db.maintenanceTicket.findUniqueOrThrow({ where: { id: ticket.id } })).vendorId,
    ).toBe(vendor.id);
    await page.goto(`/vendors/${unconfirmed.id}`);
    await expect(page.getByText("No contact method recorded for this provider.")).toBeVisible();
    await expect(page.locator('a[href^="tel:"]')).toHaveCount(0);
    await page.setViewportSize({ width: 390, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await employeeContext.close();
    expect(owner.active).toBe(true);
  } finally {
    await db.$disconnect();
  }
});
