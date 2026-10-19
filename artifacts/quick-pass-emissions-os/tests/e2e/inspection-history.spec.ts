import { test, expect } from "@playwright/test";
import { Temporal } from "@js-temporal/polyfill";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { businessDate } from "../../src/lib/time";
const today = businessDate(),
  month = Temporal.PlainDate.from(today).with({ day: 1 }).toString();
test("owner retrieves structured VIRs, resumes checkpoints, and reviews extraction coverage", async ({
  page,
  baseURL,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/performance/history");
  const form = page.getByRole("form", { name: "Retrieve historical VIRs" });
  await expect(form.getByLabel("From", { exact: true })).toHaveValue(
    Temporal.PlainDate.from(today).subtract({ months: 24 }).toString(),
  );
  await expect(page.locator('input[type="file"]')).toHaveCount(0);
  await form.getByLabel("From", { exact: true }).fill(month);
  await form.getByLabel("Through", { exact: true }).fill(today);
  await form.getByLabel("Records per batch").fill("25");
  await form.getByRole("checkbox", { name: /I confirm source-local/ }).check();
  await form.getByRole("button", { name: "Save retrieval job", exact: true }).click();
  await expect(page.getByRole("button", { name: "Start / Resume" })).toBeEnabled();
  const jobId = new URL(page.url()).searchParams.get("job")!;
  const command = async (command: string) => {
    const res = await page.request.post("/api/inspection-history", {
      headers: { Origin: baseURL! },
      data: { command, jobId },
    });
    expect(res.ok()).toBe(true);
    return res.json();
  };
  await command("START");
  await command("NEXT");
  const batch = await command("NEXT");
  expect(batch.data.windows[0].cursor).toBe(25);
  await command("PAUSE");
  await page.reload();
  await expect(page.getByText(/Not processing in this browser/)).toBeVisible();
  await expect(page.getByText("25/26 extraction decisions saved")).toBeVisible();
  await page.getByRole("button", { name: "Start / Resume" }).click();
  await expect(page.getByText("26/26 extraction decisions saved")).toBeVisible();
  await expect(page.getByText("All-page retrieval reconciled")).toBeVisible();
  await expect(page.getByText("0 failed · 1 needing review")).toBeVisible();
  await page
    .getByRole("form", { name: "Returning vehicle report filters" })
    .getByRole("button", { name: "Apply report filters" })
    .click();
  await expect(page.getByTestId("returning-count")).toHaveText("0");
  await expect(page.getByTestId("first-observed-count")).toHaveText("1");
  await expect(page.getByTestId("returning-rate")).toHaveText("0.0%");
  await expect(page.getByRole("region", { name: "Returning vehicles" })).toContainText(
    "partial coverage",
  );
  for (const [name, width, height] of [
    ["desktop", 1440, 1100],
    ["phone", 390, 844],
  ] as const) {
    await page.setViewportSize({ width, height });
    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1))
      .toBe(true);
    await page
      .getByRole("heading", { name: "Retrieve historical VIRs", exact: true })
      .scrollIntoViewIfNeeded();
    if (process.env.E2E_HISTORY_CAPTURE_DIR) {
      await mkdir(process.env.E2E_HISTORY_CAPTURE_DIR, { recursive: true });
      await page.screenshot({
        path: path.join(process.env.E2E_HISTORY_CAPTURE_DIR, `${name}.png`),
        fullPage: false,
        animations: "disabled",
      });
    }
  }
  const source = await page.request.get(
    (await page.getByRole("link", { name: "Original VIR source" }).getAttribute("href")) || "",
  );
  expect(source.headers()["content-type"]).toContain("text/plain");
  expect(source.headers()["content-disposition"]).toContain("attachment");
  expect(await source.text()).toContain("1HGCM82633A004352");
  const final = await page.request.post("/api/inspection-history", {
    headers: { Origin: baseURL! },
    data: { command: "DRAIN_REFRESH", query: { start: month, end: today, trendDays: 30 } },
  });
  expect(final.ok()).toBe(true);
  expect((await final.json()).dashboard.returningVehicles.firstObserved).toBe(1);
  const retired = await page.request.post("/api/inspection-history", {
    headers: { Origin: baseURL! },
    data: { command: "UPLOAD", jobId },
  });
  expect(retired.status()).toBe(400);
  await page.goto("/performance");
  await expect(page.getByRole("link", { name: "Retrieve historical VIRs" })).toHaveCount(0);
  await expect(page.getByTestId("button-refresh")).toBeVisible();
  expect(errors).toEqual([]);
});

test("historical imports reject manager, anonymous, and cross-origin access", async ({
  browser,
  page,
  baseURL,
}) => {
  const directory = process.env.E2E_PRIVATE_DIR!;
  const context = await browser.newContext({ storageState: path.join(directory, "ADMIN.json") });
  try {
    const manager = await context.newPage();
    await manager.goto("/performance/history");
    await expect(manager).toHaveURL(/\/dashboard$/);
    const forbidden = await context.request.post(`${baseURL}/api/inspection-history`, {
      headers: { Origin: baseURL! },
      data: { command: "LIST" },
    });
    expect(forbidden.status()).toBe(403);
  } finally {
    await context.close();
  }
  const anonymous = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  try {
    const guest = await anonymous.newPage();
    await guest.goto("/performance/history");
    await expect(guest).toHaveURL(/\/login$/);
  } finally {
    await anonymous.close();
  }
  const forbidden = await page.request.post("/api/inspection-history", {
    headers: { Origin: "https://untrusted.invalid" },
    data: { command: "LIST" },
  });
  expect(forbidden.status()).toBe(403);
});
