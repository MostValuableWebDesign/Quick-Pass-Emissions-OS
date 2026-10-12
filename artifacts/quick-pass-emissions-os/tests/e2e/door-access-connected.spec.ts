import { test, expect, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { assertOwnedDatabase } from "../../scripts/e2e-safety.mjs";
import { login, form } from "./workflow-helpers";
test.describe.configure({ mode: "serial" });
async function saveRequest(page: Page, button: string) {
  const f = form(page, button);
  const response = page.waitForResponse(
    (r) => r.request().method() === "POST" && !!r.request().headers()["next-action"],
  );
  await f.getByRole("button", { name: button, exact: true }).click();
  expect((await response).ok()).toBe(true);
  const statusForm =
    button === "Request code change" ? page.getByRole("form", { name: "Door code request" }) : f;
  await expect(statusForm.getByRole("status")).toContainText("Request saved");
}
async function refresh(page: Page) {
  assertOwnedDatabase(process.env);
  const db = new PrismaClient();
  try {
    // Advance only the runner-owned synthetic fixture's check cursor; no timer sleeps or live doors.
    await db.doorLock.updateMany({ data: { nextCheckAt: new Date(0) } });
    await db.doorAccessCode.updateMany({ data: { nextCheckAt: new Date(0) } });
  } finally {
    await db.$disconnect();
  }
  await saveRequest(page, "Refresh status");
}
async function fillCode(page: Page, label: string, pin: string) {
  const f = form(page, "Request new code");
  await f.getByLabel("Staff record").selectOption({ label: "Navigation Fixture EMPLOYEE" });
  await f.getByLabel("Access label").fill(label);
  await f.getByLabel("New keypad code").fill(pin);
  await saveRequest(page, "Request new code");
  await expect(f.getByLabel("New keypad code")).toHaveValue("");
}
test("owner registers, issues, changes and confirms removal of persisted staff access", async ({
  page,
}) => {
  await login(page, "owner@example.test");
  await page.goto("/security/doors");
  const fixture = JSON.parse(
    await readFile(path.join(process.env.E2E_PRIVATE_DIR!, "door-provider.json"), "utf8"),
  );
  const register = form(page, "Verify and register door");
  await register.getByLabel("Door name").fill("Fixture front door");
  await register.getByLabel("Seam device ID").fill(fixture.deviceId);
  await saveRequest(page, "Verify and register door");
  await fillCode(page, "Initial staff access", "684921");
  const row = page
    .getByRole("row")
    .filter({ has: page.getByText("Initial staff access", { exact: true }) });
  await expect(row).toContainText("Pending confirmation");
  await refresh(page);
  await expect(row).toContainText("Active · provider-confirmed");
  const issue = form(page, "Request new code");
  await issue
    .getByLabel("Access request", { exact: true })
    .selectOption({ label: "Change code · Initial staff access" });
  const change = form(page, "Request code change");
  await change.getByLabel("Access label").fill("Replacement staff access");
  await change.getByLabel("New keypad code").fill("684922");
  await saveRequest(page, "Request code change");
  await expect(row).toContainText("Active · provider-confirmed");
  await refresh(page);
  await expect(row).toContainText("Removal pending");
  await refresh(page);
  await refresh(page);
  await expect(row).toContainText("Removed · provider-confirmed");
  const replacement = page
    .getByRole("row")
    .filter({ has: page.getByText("Replacement staff access", { exact: true }) });
  await replacement.getByRole("button", { name: "Revoke", exact: true }).click();
  await replacement.getByRole("button", { name: "Confirm revocation" }).click();
  await expect(replacement).toContainText("Removal pending");
  await refresh(page);
  await refresh(page);
  await expect(replacement).toContainText("Removed · provider-confirmed");
  await page.reload();
  await expect(replacement).toContainText("Removed · provider-confirmed");
  await expect(page.locator("main")).not.toContainText("684921");
  await expect(page.locator("main")).not.toContainText("684922");
});
test("manager issues ordinary staff access and reviews saved history without owner setup controls", async ({
  page,
}) => {
  await login(page, "manager@example.test");
  await page.goto("/security/doors");
  await expect(page.getByRole("heading", { name: "Register a door" })).toHaveCount(0);
  await fillCode(page, "Manager staff access", "794831");
  await refresh(page);
  await page.reload();
  const row = page
    .getByRole("row")
    .filter({ has: page.getByText("Manager staff access", { exact: true }) });
  await expect(row).toContainText("Active · provider-confirmed");
  await expect(page.getByRole("heading", { name: "Access change history" })).toBeVisible();
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1))
      .toBe(true);
  }
});
