import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import path from "node:path";
import { mkdir } from "node:fs/promises";
import {
  CERTIFICATE_BALANCE_ACTION,
  CERTIFICATE_PORTAL_SCOPE,
  CERTIFICATE_THRESHOLD_ACTION,
} from "../../src/modules/certificates/portal";
import { CERTIFICATE_ANALYZER, CERTIFICATE_STATION, CERTIFICATE_ORDER_URL } from "../../src/modules/certificates/portal-types";

const db = new PrismaClient();
const directory = process.env.E2E_PRIVATE_DIR!;
const screenshotDir = path.resolve("../../generated-artifacts/certificate-portal-ux");

async function resetPortalSnapshot() {
  await db.auditLog.deleteMany({
    where: {
      entityId: CERTIFICATE_PORTAL_SCOPE,
      action: {
        in: [
          CERTIFICATE_BALANCE_ACTION,
          CERTIFICATE_THRESHOLD_ACTION,
          "CERTIFICATE_PORTAL_LOOKUP_STARTED",
          "CERTIFICATE_PORTAL_LOOKUP_FAILED",
        ],
      },
    },
  });
  await db.auditLog.createMany({
    data: [
      {
        entityId: CERTIFICATE_PORTAL_SCOPE,
        action: CERTIFICATE_BALANCE_ACTION,
        createdAt: new Date(Date.now() - 20_000),
        details: {
          balance: 29,
          checkedAt: new Date().toISOString(),
          station: CERTIFICATE_STATION,
          analyzer: CERTIFICATE_ANALYZER,
        },
      },
      {
        entityId: CERTIFICATE_PORTAL_SCOPE,
        action: CERTIFICATE_THRESHOLD_ACTION,
        details: { threshold: 30 },
      },
    ],
  });
}

test.beforeAll(async () => {
  await mkdir(screenshotDir, { recursive: true });
});
test.beforeEach(resetPortalSnapshot);
test.afterAll(async () => db.$disconnect());

test.describe("owner certificate portal and alert settings", () => {
  test.use({ storageState: path.join(directory, "session.json") });

  test("direct portal, optional records, fullscreen, reload and fallback", async ({ page }) => {
    await page.context().route("https://gadashboard.com/**", (route) =>
      route.fulfill({ contentType: "text/html", body: "<h1>Official portal navigation fixture</h1>" }));
    await page.goto("/certificates");
    const frame = page.getByTitle("Georgia dashboard certificate purchasing portal");
    await expect(frame).toHaveCount(0);
    await expect(page.getByText("The Georgia portal requires a separate browser tab for sign-in.", { exact: false })).toBeVisible();
    const popupPromise = page.waitForEvent("popup");
    await page.getByTestId("link-open-portal").click();
    const popup = await popupPromise;
    await expect(popup).toHaveURL(CERTIFICATE_ORDER_URL);
    await popup.close();
    await page.getByTestId("button-toggle-embedded-portal").click();
    await expect(frame).toBeVisible();
    await expect(frame).toHaveAttribute("src", CERTIFICATE_ORDER_URL);
    await expect(page.getByTestId("text-station")).toHaveText(CERTIFICATE_STATION);
    await expect(page.getByTestId("text-analyzer")).toHaveText(CERTIFICATE_ANALYZER);
    await expect(page.getByTestId("status-portal-balance")).toContainText("29");
    await expect(page.getByRole("heading", { name: "Record opening physical count" })).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Record certificate consumption" })).toHaveCount(0);
    await expect(page.getByTestId("certificate-metric-stock")).toContainText("29");
    await expect(page.getByTestId("certificate-metric-reorder")).toContainText("30");
    await expect(page.getByTestId("certificate-metric-usage")).not.toContainText("Not enough orders");
    await expect(page.getByTestId("provider-order-table").locator("tbody tr")).toHaveCount(25);
    await page.getByRole("button", { name: "Next orders" }).click();
    await expect(page.getByTestId("provider-order-table").locator("tbody tr")).toHaveCount(2);
    await page.getByLabel("Show HT111411 only").uncheck();
    await expect(page.getByTestId("provider-order-table").locator("tbody tr")).toHaveCount(25);
    await expect(page.getByTestId("banner-low-certificates")).toBeVisible();
    const records = page.locator("details#records");
    await expect(records).not.toHaveAttribute("open", "");
    await expect(page.getByTestId("link-open-portal")).toHaveAttribute("href", CERTIFICATE_ORDER_URL);
    await expect(page.getByTestId("link-open-portal")).toHaveAttribute("target", "_blank");
    await expect(page.getByTestId("link-open-portal")).toHaveAttribute("rel", "noopener noreferrer");
    await page.screenshot({ path: path.join(screenshotDir, "owner-portal.png"), fullPage: true });

    await page.getByTestId("button-expand-portal").click();
    await expect(page.getByTestId("button-expand-portal")).toHaveAttribute("aria-pressed", "true");
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("button-expand-portal")).toHaveAttribute("aria-pressed", "false");

    await page.getByTestId("button-reload-portal").click();
    await expect(frame).toHaveAttribute("src", CERTIFICATE_ORDER_URL);
    await records.locator("summary").click();
    await expect(records).toHaveAttribute("open", "");
    await expect(records).toContainText("You do not need a request or approval here before buying on the portal");
  });

  test("low banner threshold persistence, strict comparison and invalid values", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page.getByTestId("banner-low-certificates")).toBeVisible();
    await page.goto("/settings");
    const input = page.locator('input[name="threshold"]');
    const save = page.getByRole("button", { name: "Save alert threshold" });

    await input.fill("10");
    await save.click();
    await expect(page.getByText("Certificate alert threshold saved.")).toBeVisible();
    await expect(page.getByTestId("banner-low-certificates")).toHaveCount(0);
    await page.reload();
    await expect(input).toHaveValue("10");
    await expect(page.getByTestId("banner-low-certificates")).toHaveCount(0);

    await input.fill("40");
    await save.click();
    await expect(page.getByTestId("banner-low-certificates")).toBeVisible();
    await page.goto("/certificates");
    await expect(page.getByTestId("banner-low-certificates")).toBeVisible();

    await page.goto("/settings");
    await input.fill("29");
    await save.click();
    await expect(page.getByTestId("banner-low-certificates")).toHaveCount(0);
    await page.reload();
    await expect(input).toHaveValue("29");
    await expect(page.getByTestId("banner-low-certificates")).toHaveCount(0);

    for (const invalid of ["29.5", "-1"]) {
      await input.fill(invalid);
      expect(await input.evaluate((node: HTMLInputElement) => node.checkValidity())).toBe(false);
      await save.click();
      await expect(input).toHaveValue(invalid);
    }
    await page.reload();
    await expect(input).toHaveValue("29");
    await expect(page.getByTestId("banner-low-certificates")).toHaveCount(0);
  });

  test("failed refresh retains the last known low balance and warning", async ({ page }) => {
    await page.goto("/certificates");
    await expect(page.getByTestId("status-portal-balance")).toContainText("29");
    await page.getByTestId("button-refresh-balance").click();
    await expect(page.getByTestId("status-portal-balance")).toContainText("29", { timeout: 30_000 });
    await expect(page.getByTestId("status-portal-balance")).not.toContainText("Unknown");
    await expect(page.getByTestId("status-portal-balance")).toContainText("Last check failed");
    await expect(page.getByTestId("banner-low-certificates")).toContainText("29 left on the portal");
    await page.screenshot({ path: path.join(screenshotDir, "owner-last-known-warning.png"), fullPage: true });
    await page.goto("/dashboard");
    await expect(page.getByTestId("banner-low-certificates")).toContainText("29 left on the portal");
  });
});

test.describe("certificate portal role access", () => {
  test.describe("bookkeeper", () => {
    test.use({ storageState: path.join(directory, "BOOKKEEPER.json") });
    test("can see the portal but cannot refresh or manage alert settings", async ({ page }) => {
      await page.goto("/certificates");
      await expect(page.getByTestId("link-open-portal")).toBeVisible();
      await expect(page.getByTitle("Georgia dashboard certificate purchasing portal")).toHaveCount(0);
      await expect(page.getByTestId("status-portal-balance")).toContainText("29");
      await expect(page.getByTestId("button-refresh-balance")).toHaveCount(0);
      await page.goto("/settings");
      await expect(page.getByLabel("Alert when portal balance is below")).toHaveCount(0);
    });
  });

  test.describe("employee", () => {
    test.use({ storageState: path.join(directory, "EMPLOYEE.json") });
    test("sees low balance without an inaccessible purchase link", async ({ page }) => {
      await page.goto("/dashboard");
      await expect(page.getByTestId("banner-low-certificates")).toContainText("29 left on the portal");
      await expect(page.getByTestId("banner-low-certificates").getByRole("link")).toHaveCount(0);
      await page.goto("/certificates");
      await expect(page.getByTestId("status-portal-balance")).toHaveCount(0);
    });
  });
});
