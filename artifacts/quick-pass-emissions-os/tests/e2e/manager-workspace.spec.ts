import { test, expect } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { Temporal } from "@js-temporal/polyfill";
import { businessDate, addDays } from "../../src/lib/time";
import { form, save } from "./workflow-helpers";
test("manager task checklist, independent review, schedule and supplies persist", async ({
  page,
  browser,
}) => {
  test.setTimeout(180000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/operations?area=WEBSITE");
  await expect(
    page.getByRole("heading", { name: "Operations manager", exact: true }),
  ).toBeVisible();
  await page.getByText("Create a task or recurring duty", { exact: true }).click();
  const title = `Synthetic website check ${Date.now()}`,
    future = addDays(businessDate(), 2);
  const create = form(page, "Create responsibility");
  await create.getByLabel("Task title", { exact: true }).fill(title);
  await create.getByLabel("Business area").selectOption("WEBSITE");
  await create.getByLabel("Due / start date").fill(future);
  await create.getByLabel("Checklist · one item per line").fill("Verify mobile preview");
  await save(create, "Create responsibility");
  await page.getByRole("link", { name: title, exact: true }).click();
  await expect(page).toHaveURL(/\/tasks\/[^/]+$/);
  const url = page.url();
  await page.getByText("Checklist, dependencies & completion evidence", { exact: true }).click();
  const details = form(page, "Save task plan");
  await details.getByLabel("Verify mobile preview", { exact: true }).check();
  await details
    .getByLabel("Completion evidence / preview link / service reference")
    .fill("Synthetic mobile preview checked; no public change");
  await save(details, "Save task plan");
  await page.reload();
  await expect(
    page.getByText("Completion evidence: Synthetic mobile preview checked; no public change"),
  ).toBeVisible();
  const update = form(page, "Update task");
  await update.getByLabel("New status").selectOption("COMPLETED");
  await save(update, "Update task");
  const review = form(page, "Approve completion review");
  await review.getByRole("button").click();
  await expect(review.getByRole("status")).toContainText("Another manager");
  const context = await browser.newContext({
    storageState: path.join(process.env.E2E_PRIVATE_DIR!, "ADMIN.json"),
  });
  try {
    const manager = await context.newPage();
    await manager.goto(url);
    await expect(manager.getByRole("heading", { name: title, exact: true })).toBeVisible();
    await save(form(manager, "Approve completion review"), "Approve completion review", true);
    await expect(manager.getByText(/^Manager reviewed /).first()).toBeVisible();
  } finally {
    await context.close();
  }
  await page.reload();
  await expect(page.getByText(/^Manager reviewed /).first()).toBeVisible();
  await page.goto("/operations/schedule");
  await expect(page.getByLabel("Proposed weekly operations schedule")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Opening review", exact: true })).toHaveCount(6);
  await page.getByText("Optional availability-aware task planner", { exact: true }).click();
  const weekday = Temporal.PlainDate.from(future).dayOfWeek,
    label = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"][
      weekday - 1
    ];
  const availability = form(page, "Save my availability");
  await availability.getByRole("checkbox", { name: label, exact: true }).check();
  await availability.getByLabel(`${label} start`, { exact: true }).fill("09:00");
  await availability.getByLabel(`${label} end`, { exact: true }).fill("17:00");
  await availability.getByLabel(`${label} breaks`, { exact: true }).fill("12:00-12:30");
  await save(availability, "Save my availability");
  const preview = form(page, "Generate schedule preview");
  await preview.getByLabel("Week starting").fill(future);
  await save(preview, "Generate schedule preview");
  await save(form(page, "Approve this schedule"), "Approve this schedule", true);
  await expect(
    page.getByRole("heading", { name: new RegExp(`APPROVED · ${future}`) }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: new RegExp(`APPROVED · ${future}`) }),
  ).toBeVisible();
  await page.goto("/operations/supplies");
  const supply = form(page, "Add supply");
  await supply.getByLabel("Supply name").fill(`Synthetic paper ${Date.now()}`);
  await supply.getByLabel("Stock unit").fill("rolls");
  await supply.getByLabel("Physical stock count · optional").fill("2");
  await supply.getByLabel("Reorder threshold · optional").fill("3");
  await supply.getByLabel("Preferred vendor").fill("Walmart");
  await save(supply, "Add supply");
  await page.goto("/operations");
  await expect(page.getByRole("link", { name: /^Reorder Synthetic paper/ })).toBeVisible();
  for (const [name, width, height] of [
    ["desktop", 1440, 1000],
    ["phone", 390, 844],
  ] as const) {
    await page.setViewportSize({ width, height });
    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1))
      .toBe(true);
    if (name === "phone")
      await page
        .getByRole("heading", { name: "Priorities & delegated work" })
        .scrollIntoViewIfNeeded();
    if (process.env.E2E_MANAGER_CAPTURE_DIR) {
      await mkdir(process.env.E2E_MANAGER_CAPTURE_DIR, { recursive: true });
      await page.screenshot({
        path: path.join(process.env.E2E_MANAGER_CAPTURE_DIR, `${name}.png`),
        fullPage: name !== "phone",
        animations: "disabled",
      });
    }
  }
  expect(errors).toEqual([]);
});
test("workspace allows management and rejects anonymous or legacy staff access", async ({
  browser,
}) => {
  const manager = await browser.newContext({
    storageState: path.join(process.env.E2E_PRIVATE_DIR!, "ADMIN.json"),
  });
  try {
    const p = await manager.newPage();
    for (const route of [
      "/operations",
      "/operations/schedule",
      "/operations/supplies",
      "/operations/registers",
    ]) {
      await p.goto(route);
      await expect(p).toHaveURL(new RegExp(`${route}$`));
      await expect(p.getByText("Application error", { exact: false })).toHaveCount(0);
    }
    await p.goto("/operations/registers");
    await expect(p.getByRole("button", { name: "Save configured bank limit" })).toHaveCount(0);
  } finally {
    await manager.close();
  }
  for (const role of ["ANONYMOUS", "EMPLOYEE"]) {
    const c = await browser.newContext({
      storageState:
        role === "ANONYMOUS"
          ? { cookies: [], origins: [] }
          : path.join(process.env.E2E_PRIVATE_DIR!, `${role}.json`),
    });
    try {
      const p = await c.newPage();
      await p.goto("/operations");
      await expect(p).toHaveURL(/\/login$/);
    } finally {
      await c.close();
    }
  }
});
