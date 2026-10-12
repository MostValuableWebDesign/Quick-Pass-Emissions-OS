import { test, expect } from "@playwright/test";
import { login, privatePassword } from "./workflow-helpers";

test("unauthenticated access and public signup are denied", async ({ page, request }) => {
  await page.context().clearCookies();
  await page.goto("/employees");
  await expect(page).toHaveURL(/login/);
  const response = await request.post("/api/auth/sign-up/email", {
    headers: { Origin: new URL(process.env.E2E_BASE_URL ?? "http://localhost:3000").origin },
    data: {
      name: "Unauthorized",
      email: "intruder@example.test",
      password: await privatePassword(),
    },
  });
  expect(response.ok()).toBe(false);
  const job = await request.post("/api/jobs");
  expect(job.status()).toBe(401);
});
test("owner can provision, schedule, assign, complete and audit work", async ({
  page,
  browser,
}) => {
  await login(page, "owner@example.test");
  await expect(page.getByText("DEMONSTRATION WORKSPACE", { exact: false })).toBeVisible();
  await page.goto("/employees");
  await page.getByText("+ Add an employee", { exact: true }).click();
  const suffix = Date.now();
  const name = `E2E Employee ${suffix}`;
  const email = `e2e-${suffix}@example.test`;
  await page.getByLabel("Full name").fill(name);
  await page.getByLabel("Contact email", { exact: false }).fill(email);
  await page.getByRole("button", { name: "Create employee", exact: true }).click();
  await expect(page.getByRole("status")).toHaveText("Saved successfully.");
  await page.getByRole("link", { name, exact: true }).click();
  await expect(page.getByRole("button", { name: "Issue private invitation" })).toHaveCount(0);
  await expect(
    page.getByText("Staff record · No app access", { exact: false }).first(),
  ).toBeVisible();
  // Owner provisions another manager; staff records never expose activation controls.
  await page.goto("/employees");
  await page.getByText("+ Add an employee", { exact: true }).click();
  const managerName = `E2E Manager ${suffix}`;
  await page.getByLabel("Full name").fill(managerName);
  await page.getByLabel("Contact email", { exact: false }).fill(`manager-${suffix}@example.test`);
  await page.getByLabel(/^App access/).selectOption("ADMIN");
  await page.getByRole("button", { name: "Create employee", exact: true }).click();
  await expect(page.getByRole("status")).toHaveText("Saved successfully.");
  await page.getByRole("link", { name: managerName, exact: true }).click();
  await page.getByRole("button", { name: "Issue private invitation" }).click();
  const invitation = page.getByLabel("Private invitation link");
  await expect(invitation).toBeVisible();
  const link = await invitation.inputValue();
  const context = await browser.newContext();
  try {
    const managerPage = await context.newPage();
    await managerPage.goto(link);
    await managerPage.getByLabel("New password").fill(await privatePassword());
    await managerPage.getByRole("button", { name: "Activate account" }).click();
    await expect(managerPage.getByRole("status")).toHaveText(/Account activated/);
    await managerPage.goto(link);
    await managerPage.getByLabel("New password").fill(await privatePassword());
    await managerPage.getByRole("button", { name: "Activate account" }).click();
    await expect(managerPage.getByRole("status")).toHaveText(/invalid or expired/);
  } finally {
    await context.close();
  }
  await page.goto("/schedule");
  await page.getByLabel(/^Employee/).selectOption({ label: name });
  await page.getByLabel("Start · Eastern").fill("08:00");
  await page.getByLabel("End · Eastern").fill("17:00");
  await page.getByLabel("Assigned duties").fill("E2E inspection");
  await page.getByRole("button", { name: "Save shift" }).click();
  await expect(page.getByRole("status")).toHaveText("Saved successfully.");
  await page.goto("/tasks/templates");
  const title = `E2E task ${suffix}`;
  await page.getByLabel("Task title").fill(title);
  await page.getByLabel("Assigned employee").selectOption({ label: name });
  await page.getByLabel(/^Repeat/).selectOption("ONCE");
  await page.getByLabel("Require manager review").check();
  await page.getByRole("button", { name: "Create responsibility", exact: true }).click();
  await expect(page.getByRole("status")).toHaveText("Saved successfully.");
  await page.goto("/tasks");
  await page.getByRole("link", { name: title, exact: true }).click();
  await expect(page).toHaveURL(/\/tasks\/[^/]+$/);
  await page.getByLabel("Completion note / reason").fill("Management verified work in browser");
  await page.getByRole("button", { name: "Update task" }).click();
  await expect(page.getByRole("status").first()).toHaveText("Saved successfully.");
  await page.reload();
  await expect(page.getByText("Management verified work in browser")).toBeVisible();
  await page.getByRole("button", { name: "Approve completion review" }).click();
  await expect(page.getByText("Manager reviewed", { exact: false })).toBeVisible();
  await page.goto("/employees");
  await page.getByRole("link", { name, exact: true }).click();
  const prompt = page.waitForEvent("dialog");
  await page.getByRole("button", { name: "Remove from active staff", exact: true }).click();
  const confirmation = await prompt;
  expect(confirmation.type()).toBe("confirm");
  await confirmation.accept();
  await expect(page.getByRole("status")).toHaveText("Saved successfully.");
});
test("manager mobile workspace contains team operations", async ({ page }) => {
  await login(page, "manager@example.test");
  await page.setViewportSize({ width: 390, height: 844 });
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))
    .toBe(true);
  await page.getByRole("button", { name: /^(open|close|toggle) navigation( menu)?$/i }).click();
  await expect(page.getByRole("link", { name: "Tasks", exact: true })).toBeVisible();
});
