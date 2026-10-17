import { test, expect } from "@playwright/test";
import { Temporal } from "@js-temporal/polyfill";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { businessDate } from "../../src/lib/time";
const today = businessDate(),
  month = Temporal.PlainDate.from(today).with({ day: 1 }).toString();
const earlier = Temporal.PlainDate.from(month).subtract({ months: 1 }).toString();
const csv = (prior: boolean) =>
  [
    "Inspection ID,VIN,Test Date,Result,Payment Status,Retest Status,Status",
    `${prior ? "prior" : "current"},1HGCM82633A004352,${prior ? earlier : month}T10:00:00,Pass,PAID,INITIAL,COMPLETED`,
    ...(prior
      ? []
      : [
          `first,1M8GDM9AXKP042788,${month}T11:00:00,Fail,PAID,INITIAL,COMPLETED`,
          `bad,,not-a-date,Pass,UNKNOWN,UNKNOWN,UNKNOWN`,
        ]),
  ].join("\n");

test("owner imports bounded history, pauses/reopens, resumes, and reviews returning vehicles", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/performance/history");
  await expect(
    page.getByRole("heading", { name: "Inspection history", exact: true }),
  ).toBeVisible();
  const form = page.getByRole("form", { name: "Create historical import" });
  await form.getByLabel("From", { exact: true }).fill(earlier);
  await form.getByLabel("Through", { exact: true }).fill(today);
  await form.getByRole("checkbox", { name: /I confirm source-local/ }).check();
  await form.getByRole("button", { name: "Create import", exact: true }).click();
  const upload = page.getByRole("form", { name: "Upload monthly source" });
  await expect(upload).toBeVisible();
  const uploadFile = async (prior: boolean) => {
    await upload.getByLabel("Station and window").selectOption({ index: prior ? 0 : 1 });
    await upload.getByLabel("Export file").setInputFiles({
      name: "synthetic-inspection-history.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(csv(prior)),
    });
    await upload.getByLabel("Source total", { exact: false }).fill(prior ? "1" : "3");
    await upload
      .getByLabel("Source / total evidence reference")
      .fill("Synthetic browser fixture; not business data");
    await upload.getByRole("button", { name: "Save source & checkpoint" }).click();
    await expect(page.getByRole("button", { name: "Start / Resume" })).toBeEnabled();
  };
  await uploadFile(true);
  await page.getByRole("button", { name: "Start / Resume" }).click();
  await expect(page.getByText(/Upload a source file for the pending windows/)).toBeVisible();
  await expect(page.getByText(/Fetched 1 · Imported 1/)).toBeVisible();
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  await page.reload();
  await expect(page.getByText(/Fetched 1 · Imported 1/)).toBeVisible();
  await expect(page.getByText(/Not processing in this browser/)).toBeVisible();
  await uploadFile(false);
  await page.getByRole("button", { name: "Start / Resume" }).click();
  await expect(page.getByText(/Fetched 4 · Imported 3 · Duplicates 0 · Rejected 1/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Start / Resume" })).toBeEnabled();
  await page
    .getByRole("form", { name: "Returning vehicle report filters" })
    .getByRole("button", { name: "Apply report filters" })
    .click();
  await expect(page.getByTestId("returning-count")).toHaveText("1");
  await expect(page.getByTestId("first-observed-count")).toHaveText("1");
  await expect(page.getByTestId("returning-rate")).toHaveText("50.0%");
  await expect(page.getByRole("link", { name: "Download row errors" })).toBeVisible();
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
    if (process.env.E2E_HISTORY_CAPTURE_DIR) {
      await mkdir(process.env.E2E_HISTORY_CAPTURE_DIR, { recursive: true });
      await page.screenshot({
        path: path.join(process.env.E2E_HISTORY_CAPTURE_DIR, `${name}.png`),
        fullPage: true,
        animations: "disabled",
      });
    }
  }
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
