import { expect, type Page, type Locator } from "@playwright/test";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { randomBytes } from "node:crypto";
const directory = () => {
  if (!process.env.E2E_PRIVATE_DIR) throw new Error("Run the isolated browser runner.");
  return process.env.E2E_PRIVATE_DIR;
};
export async function privatePassword() {
  return JSON.parse(await readFile(path.join(directory(), "workflow.json"), "utf8"))
    .password as string;
}
export async function login(page: Page, email: string) {
  const fixture = JSON.parse(await readFile(path.join(directory(), "workflow.json"), "utf8"));
  await page.context().clearCookies();
  // Each login is a distinct client. Signing out cannot invalidate another test's state.
  const octets = randomBytes(2);
  await page
    .context()
    .setExtraHTTPHeaders({ "x-forwarded-for": `198.18.${octets[0]}.${octets[1]}` });
  const response = await page.request.post("/api/sign-in", {
    form: { email: fixture.accounts[email] ?? email, password: fixture.password },
    headers: { Origin: process.env.E2E_BASE_URL! },
    maxRedirects: 0,
  });
  expect(response.status()).toBe(303);
  expect(response.headers().location).toBe("/dashboard");
  await response.dispose();
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/dashboard/);
}
export function form(page: Page, button: string) {
  return page
    .locator("form")
    .filter({ has: page.getByRole("button", { name: button, exact: true }) });
}
export async function save(f: Locator, button: string, disappears = false) {
  const response = f
    .page()
    .waitForResponse(
      (r) => r.request().method() === "POST" && !!r.request().headers()["next-action"],
    );
  await f.getByRole("button", { name: button, exact: true }).click();
  expect((await response).ok()).toBe(true);
  if (disappears) await expect(f).toHaveCount(0);
  else await expect(f.getByRole("status")).toHaveText("Saved successfully.");
}
