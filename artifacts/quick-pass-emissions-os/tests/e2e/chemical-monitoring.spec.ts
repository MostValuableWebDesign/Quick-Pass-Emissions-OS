import { test, expect } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import path from "node:path";
test("chemical sensors persist, isolate demo/tests and process protected refill transitions", async ({
  page,
  baseURL,
}) => {
  test.setTimeout(180000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const command = async (command: string, extra = {}) => {
    const response = await page.request.post("/api/chemical-monitoring", {
      headers: { Origin: baseURL! },
      data: { command, ...extra },
    });
    expect(response.ok()).toBe(true);
    return response.json();
  };
  await page.goto("/chemicals");
  const panel = page.getByRole("region", { name: "Chemical Level Monitoring", exact: true });
  await expect(panel.getByRole("heading", { name: "Chemical Level Monitoring" })).toBeVisible();
  await panel.getByRole("button", { name: "Demo Preview", exact: true }).click();
  await expect(
    panel.getByText("Demo preview — sample levels, no live sensors connected", { exact: true }),
  ).toBeVisible();
  for (const label of [
    "Foam soap: 75 percent",
    "Tire cleaner: 40 percent",
    "High-pressure soap: 15 percent",
    "Clear wax: 60 percent",
  ])
    await expect(panel.getByRole("img", { name: new RegExp(label) })).toBeVisible();
  expect((await command("LIST")).data.sensors).toHaveLength(0);
  if (process.env.E2E_CHEMICAL_CAPTURE_DIR) {
    await mkdir(process.env.E2E_CHEMICAL_CAPTURE_DIR, { recursive: true });
    for (const [name, width, height] of [
      ["desktop", 1440, 1100],
      ["phone", 390, 844],
    ] as const) {
      await page.setViewportSize({ width, height });
      await panel
        .getByRole("heading", { name: "Chemical Level Monitoring" })
        .scrollIntoViewIfNeeded();
      await expect
        .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1))
        .toBe(true);
      await page.screenshot({
        path: path.join(process.env.E2E_CHEMICAL_CAPTURE_DIR, `demo-${name}.png`),
        animations: "disabled",
      });
    }
  }
  await page.setViewportSize({ width: 1440, height: 1100 });
  await panel.getByRole("button", { name: "Actual Sensor Status", exact: true }).click();
  await panel
    .locator("summary")
    .filter({ hasText: /^Register a sensor$/ })
    .click();
  const form = panel.getByRole("form", { name: "Register sensor", exact: true });
  await form.getByLabel("Sensor name", { exact: true }).fill("Fixture foam sensor");
  const resources = (await command("LIST")).data;
  expect(
    resources.chemicals.some((c: { name: string }) => c.name === "Monitoring fixture soap"),
  ).toBe(true);
  await form
    .locator('select[name="chemicalId"]')
    .selectOption({ label: "Monitoring fixture soap" });
  await form.getByLabel("Container size", { exact: false }).fill("5-gallon jug");
  await form.getByLabel("Location note", { exact: true }).fill("Synthetic fixture bay");
  await form.getByRole("button", { name: "Register sensor", exact: true }).click();
  await expect(panel.getByRole("status")).toHaveText("Sensor settings saved.");
  await page.reload();
  const card = panel.getByRole("article", { name: "Sensor Fixture foam sensor", exact: true });
  await expect(card.getByText("Not connected", { exact: true })).toBeVisible();
  await expect(card).not.toContainText("%");
  await card
    .locator("summary")
    .filter({ hasText: /^Connection setup/ })
    .click();
  await card.getByRole("button", { name: "Generate credential", exact: true }).click();
  const first = await card
    .getByRole("textbox", { name: "Receiver credential shown once" })
    .inputValue();
  await card.getByRole("button", { name: "Rotate credential", exact: true }).click();
  const token = await card
    .getByRole("textbox", { name: "Receiver credential shown once" })
    .inputValue();
  expect(first).not.toBe(token);
  await card.getByRole("button", { name: "Hide credential" }).click();
  const before = (await command("LIST")).data.sensors[0],
    sensorId = before.id;
  const send = async (state: string, observedAt: string, eventId: string, credential = token) =>
    page.request.post("/api/integrations/proteus/events", {
      headers: { Authorization: `Bearer ${credential}` },
      data: { schemaVersion: 1, sensorId, eventId, state, observedAt },
    });
  const timestamp = new Date(Date.now() - 2000).toISOString();
  expect((await send("LOW", timestamp, "rotated-fixture", first)).status()).toBe(401);
  await card
    .getByRole("form", { name: "Synthetic test Fixture foam sensor" })
    .getByRole("button", { name: "Send synthetic test" })
    .click();
  await expect(panel.getByRole("status")).toContainText("Synthetic test saved separately");
  expect((await command("LIST")).data.sensors[0].lastReceivedAt).toBeNull();
  expect((await send("LOW", timestamp, "live-contract-fixture")).status()).toBe(200);
  const duplicate = await send("LOW", timestamp, "live-contract-fixture");
  expect((await duplicate.json()).duplicate).toBe(true);
  await panel.getByRole("button", { name: "Refresh sensor status" }).click();
  await expect(card.locator("strong.cm-low")).toBeVisible();
  await expect(card.getByRole("link", { name: "Open refill task" })).toBeVisible();
  const low = (await command("LIST")).data.sensors[0];
  expect(low.incidents).toHaveLength(1);
  await card.getByRole("button", { name: "Record Refilled", exact: true }).click();
  const refill = (await command("LIST")).data.sensors[0];
  expect(refill.lastState).toBe("LOW");
  expect(refill.lastObservedAt).toBe(low.lastObservedAt);
  expect(refill.incidents).toHaveLength(0);
  expect(
    (await send("LOW", new Date(Date.now() + 1000).toISOString(), "new-low-after-refill")).status(),
  ).toBe(200);
  expect((await command("LIST")).data.sensors[0].incidents).toHaveLength(1);
  expect(
    (
      await send(
        "ABOVE_THRESHOLD",
        new Date(Date.now() + 3000).toISOString(),
        "restored-contract-fixture",
      )
    ).status(),
  ).toBe(200);
  await panel.getByRole("button", { name: "Refresh sensor status" }).click();
  await expect(card.locator("strong.cm-good")).toBeVisible();
  await expect(card.getByRole("link", { name: "Open refill task" })).toHaveCount(0);
  if (process.env.E2E_CHEMICAL_CAPTURE_DIR)
    for (const [name, width, height] of [
      ["desktop", 1440, 1100],
      ["phone", 390, 844],
    ] as const) {
      await page.setViewportSize({ width, height });
      await card.getByRole("heading").scrollIntoViewIfNeeded();
      await expect
        .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1))
        .toBe(true);
      await page.screenshot({
        path: path.join(process.env.E2E_CHEMICAL_CAPTURE_DIR, `actual-${name}.png`),
        animations: "disabled",
      });
    }
  expect(errors).toEqual([]);
});
test("chemical monitoring enforces owner controls, station grants and origin authentication", async ({
  page,
  browser,
  baseURL,
}) => {
  const directory = process.env.E2E_PRIVATE_DIR!;
  const context = await browser.newContext({ storageState: path.join(directory, "ADMIN.json") });
  try {
    const manager = await context.newPage();
    await manager.goto("/chemicals");
    const panel = manager.getByRole("region", { name: "Chemical Level Monitoring", exact: true });
    await expect(panel.getByRole("button", { name: "Actual Sensor Status" })).toBeVisible();
    await expect(panel.getByRole("button", { name: "Register sensor", exact: true })).toHaveCount(
      0,
    );
    const response = await context.request.post(`${baseURL}/api/chemical-monitoring`, {
      headers: { Origin: baseURL! },
      data: { command: "ROTATE", sensorId: "unknown" },
    });
    expect(response.status()).toBe(403);
  } finally {
    await context.close();
  }
  expect(
    (
      await page.request.post("/api/chemical-monitoring", {
        headers: { Origin: "https://untrusted.example" },
        data: { command: "LIST" },
      })
    ).status(),
  ).toBe(403);
  expect(
    (
      await page.request.post("/api/integrations/proteus/events", {
        data: { schemaVersion: 1, sensorId: "unknown", state: "LOW" },
      })
    ).status(),
  ).toBe(401);
  const anonymous = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  try {
    const guest = await anonymous.newPage();
    await guest.goto("/chemicals");
    await expect(guest).toHaveURL(/\/login$/);
  } finally {
    await anonymous.close();
  }
});
