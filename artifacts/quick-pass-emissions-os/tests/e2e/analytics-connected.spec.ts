import { PrismaClient } from "@prisma/client";
import { test, expect } from "@playwright/test";
import { login, form, save } from "./workflow-helpers";
import { assertOwnedDatabase } from "../../scripts/e2e-safety.mjs";
test("synthetic Google OAuth, mapping, queued sync and reports persist across reloads", async ({
  page,
}) => {
  assertOwnedDatabase(process.env);
  await login(page, "owner@example.test");
  await page.goto("/analytics");
  await page.route("https://accounts.google.com/o/oauth2/v2/auth?*", async (route) => {
    const url = new URL(route.request().url());
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("scope")).toBe("https://www.googleapis.com/auth/business.manage");
    const callback = new URL(url.searchParams.get("redirect_uri")!);
    callback.searchParams.set("state", url.searchParams.get("state")!);
    callback.searchParams.set("code", "synthetic-authorization-code");
    await route.fulfill({ status: 302, headers: { Location: callback.href }, body: "" });
  });
  await page.getByRole("button", { name: "Connect Google", exact: true }).click();
  await expect(page.getByText(/Google authorized\. Refresh authorized locations/)).toBeVisible();
  await save(form(page, "Refresh authorized locations"), "Refresh authorized locations");
  await page.getByText("Station mapping & manager access", { exact: true }).click();
  const station = form(page, "Save Analytics station");
  await station.getByLabel("Station display name").fill("Synthetic Analytics station");
  await station.getByRole("checkbox").check();
  await save(station, "Save Analytics station");
  const map = form(page, "Map authorized location");
  await map.getByLabel("Google business location").selectOption({
    label:
      "Synthetic Google verification business · locations/synthetic-location · accounts/synthetic-account",
  });
  await save(map, "Map authorized location");
  await page.getByRole("link", { name: "May 2026", exact: true }).click();
  // Advance only the owned fixture cooldown; production waits the shared 60 seconds.
  const fixtureDb = new PrismaClient();
  try {
    await fixtureDb.googleBusinessConnection.updateMany({ data: { cooldownUntil: new Date(0) } });
  } finally {
    await fixtureDb.$disconnect();
  }
  await page.getByRole("button", { name: "Sync now", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "Completed ·" })).toBeVisible({
    timeout: 120000,
  });
  await page.reload();
  await expect(
    page.getByText("Synthetic fixture: a long wait for service", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Unanswered review", { exact: true })).toBeVisible();
  await expect(page.getByText("Below 15", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: /Publish|Post reply/ })).toHaveCount(0);
  const callRow = page
    .getByRole("row")
    .filter({ has: page.getByRole("cell", { name: "Call clicks", exact: true }) });
  await expect(callRow).toContainText("0 · partial");
  await save(form(page, "Disconnect Google"), "Disconnect Google", true);
  await page.reload();
  await expect(page.getByRole("button", { name: "Connect Google", exact: true })).toBeVisible();
  await expect(
    page.getByText("Synthetic fixture: a long wait for service", { exact: true }),
  ).toHaveCount(0);
});
