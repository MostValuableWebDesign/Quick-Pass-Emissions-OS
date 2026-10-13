import { PrismaClient } from "@prisma/client";
import { test, expect } from "@playwright/test";
import path from "node:path";
import { assertOwnedDatabase } from "../../scripts/e2e-safety.mjs";
import { form, save } from "./workflow-helpers";
test("owner adjusts each employee's dated base pay and commissions with persistent history", async ({
  page,
  browser,
}) => {
  assertOwnedDatabase(process.env);
  const db = new PrismaClient();
  let id: string, otherId: string;
  try {
    const first = await db.employee.create({
      data: {
        user: {
          create: {
            name: "AAA Payroll adjustment fixture",
            email: "pay-adjustment@example.test",
            role: "EMPLOYEE",
          },
        },
      },
    });
    const second = await db.employee.create({
      data: {
        user: {
          create: {
            name: "AAB Separate pay fixture",
            email: "pay-separate@example.test",
            role: "EMPLOYEE",
          },
        },
      },
    });
    id = first.id;
    otherId = second.id;
  } finally {
    await db.$disconnect();
  }
  await page.goto("/payroll");
  const panels = page.locator(
    'section[aria-label="Employee pay overview"], section[aria-label="Adjust pay and commissions"]',
  );
  await expect(panels).toHaveCount(2);
  expect(await panels.evaluateAll((nodes) => nodes.map((node) => node.getAttribute("aria-label"))))
    .toEqual(["Employee pay overview", "Adjust pay and commissions"]);
  const panel = page.getByRole("region", { name: "Adjust pay and commissions" });
  await panel.getByLabel("Employee to adjust").selectOption(id);
  const base = form(page, "Save base pay");
  await base.getByLabel("Pay basis").selectOption("DAILY");
  await base.getByLabel("Base rate ($)", { exact: true }).fill("125.50");
  await base.getByLabel("Scheduled days per week").fill("5");
  await base.getByLabel("Scheduled minutes per day").fill("480");
  await base.getByLabel("Effective date").fill("2026-01-01");
  await base.getByLabel("Reason for change").fill("Synthetic initial daily base");
  await save(base, "Save base pay");
  await expect(
    page
      .getByRole("table", { name: "Employee pay summary" })
      .getByRole("row")
      .filter({ hasText: "AAA Payroll adjustment fixture" }),
  ).toContainText("$125.50");
  const commission = form(page, "Save commission");
  await commission.getByLabel("Commission eligibility").selectOption("true");
  await commission.getByLabel("Commission basis").selectOption("PERSONAL_APPROVED_DAILY");
  await commission.getByLabel("Daily test threshold").fill("50");
  await commission.getByLabel("Commission per qualifying test ($)", { exact: true }).fill("1.25");
  await commission.getByLabel("Volume boost starts above tests/day").fill("80");
  await commission
    .getByLabel("Additional rate per test above volume threshold ($)", { exact: true })
    .fill("0.50");
  await commission.getByLabel("Effective date").fill("2026-01-01");
  await commission.getByLabel("Reason for change").fill("Synthetic volume incentive");
  await save(commission, "Save commission");
  await panel.getByLabel("Base pay change", { exact: true }).selectOption("PERCENT");
  await base.getByLabel("Percentage").fill("10");
  await base.getByLabel("Effective date").fill("2026-01-02");
  await base.getByLabel("Reason for change").fill("Synthetic base increase");
  await save(base, "Save base pay");
  await expect(panel.getByRole("region", { name: "Base pay adjustment" })).toContainText("$138.05");
  await panel.getByLabel("Commission change", { exact: true }).selectOption("PERCENT");
  await commission.getByLabel("Change direction").selectOption("DECREASE");
  await commission.getByLabel("Percentage").fill("20");
  await commission.getByLabel("Effective date").fill("2026-01-02");
  await commission.getByLabel("Reason for change").fill("Synthetic commission decrease");
  await save(commission, "Save commission");
  await expect(panel.getByRole("region", { name: "Commission adjustment" })).toContainText("$1.00");
  await page.reload();
  await panel.getByLabel("Employee to adjust").selectOption(id);
  await expect(panel).toContainText("$138.05");
  await expect(panel).toContainText("$1.00");
  await expect(page.getByRole("table", { name: "Pay transactions" })).toHaveCount(0);
  const auditDb = new PrismaClient();
  try {
    const audit = await auditDb.auditLog.findMany({
      where: {
        action: { in: ["PAY_ARRANGEMENT_CREATED", "COMMISSION_POLICY_CREATED"] },
      },
      select: { details: true },
    });
    const auditDetails = JSON.stringify(audit);
    expect(auditDetails).toContain("Synthetic base increase");
    expect(auditDetails).toContain("Synthetic commission decrease");
  } finally {
    await auditDb.$disconnect();
  }
  await panel.getByLabel("Employee to adjust").selectOption(otherId);
  await expect(panel.getByRole("region", { name: "Base pay adjustment" })).toContainText(
    "Not configured",
  );
  await panel.getByLabel("Employee to adjust").selectOption(id);
  await expect(panel).toContainText("$138.05");
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
    true,
  );
  const manager = await browser.newContext({
    baseURL: new URL(page.url()).origin,
    storageState: path.join(process.env.E2E_PRIVATE_DIR!, "ADMIN.json"),
  });
  try {
    const managerPage = await manager.newPage();
    await managerPage.goto("/payroll");
    await expect(managerPage.getByRole("heading", { name: "Employee pay overview" })).toBeVisible();
    await expect(
      managerPage.getByRole("button", { name: "Save base pay", exact: true }),
    ).toHaveCount(0);
    await expect(
      managerPage.getByRole("button", { name: "Save commission", exact: true }),
    ).toHaveCount(0);
  } finally {
    await manager.close();
  }
});
