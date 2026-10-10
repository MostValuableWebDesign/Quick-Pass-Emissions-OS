import { test, expect, type Page } from "@playwright/test";
const password = process.env.DEMO_PASSWORD;
test.skip(!password, "Set DEMO_PASSWORD and point E2E_BASE_URL at a freshly seeded local demo.");
async function login(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password!);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/dashboard/);
}
test("unauthenticated access and public signup are denied", async ({ page, request }) => {
  await page.goto("/employees");
  await expect(page).toHaveURL(/login/);
  const response = await request.post("/api/auth/sign-up/email", {
    headers: { Origin: new URL(process.env.E2E_BASE_URL ?? "http://localhost:3000").origin },
    data: { name: "Unauthorized", email: "intruder@example.test", password: password! },
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
  await page.getByLabel("Account email", { exact: false }).fill(email);
  await page.getByRole("button", { name: "Create employee", exact: true }).click();
  await expect(page.getByRole("status")).toHaveText("Saved successfully.");
  await page.getByRole("link", { name, exact: true }).click();
  await page.getByRole("button", { name: "Issue private invitation" }).click();
  const invite = page.getByLabel("Private invitation link");
  await expect(invite).toBeVisible();
  const link = await invite.inputValue();
  const ctx = await browser.newContext();
  const employeePage = await ctx.newPage();
  await employeePage.goto(link);
  await employeePage.getByLabel("New password").fill(password!);
  await employeePage.getByRole("button", { name: "Activate account" }).click();
  await expect(employeePage.getByRole("status")).toHaveText(/Account activated/);
  await employeePage.goto(link);
  await employeePage.getByLabel("New password").fill(password!);
  await employeePage.getByRole("button", { name: "Activate account" }).click();
  await expect(employeePage.getByRole("status")).toHaveText(/invalid or expired/);
  await page.goto("/schedule");
  await page.getByLabel("Employee", { exact: true }).selectOption({ label: name });
  await page.getByLabel("Start · Eastern").fill("08:00");
  await page.getByLabel("End · Eastern").fill("17:00");
  await page.getByLabel("Assigned duties").fill("E2E inspection");
  await page.getByRole("button", { name: "Save shift" }).click();
  await expect(page.getByRole("status")).toHaveText("Saved successfully.");
  await page.goto("/tasks/templates");
  const title = `E2E task ${suffix}`;
  await page.getByLabel("Task title").fill(title);
  await page.getByLabel("Assigned employee").selectOption({ label: name });
  await page.getByLabel("Repeat", { exact: true }).selectOption("ONCE");
  await page.getByLabel("Require manager review").check();
  await page.getByRole("button", { name: "Create responsibility", exact: true }).click();
  await expect(page.getByRole("status")).toHaveText("Saved successfully.");
  await page.goto("/tasks");
  await page.getByRole("link", { name: title, exact: true }).click();
  await expect(page).toHaveURL(/\/tasks\/[^/]+$/);
  const taskUrl = page.url();
  await login(employeePage, email);
  await employeePage.goto("/tasks");
  await expect(
    employeePage.getByRole("link", { name: "Inspect emissions analyzer", exact: true }),
  ).toHaveCount(0);
  await employeePage.getByRole("link", { name: title, exact: true }).click();
  await employeePage.getByLabel("Completion note / reason").fill("Verified in browser");
  await employeePage.getByRole("button", { name: "Update task" }).click();
  await expect(employeePage.getByText("Completed", { exact: false }).first()).toBeVisible();
  await employeePage.reload();
  await expect(employeePage.getByText("Verified in browser")).toBeVisible();
  await page.goto(taskUrl);
  await page.getByRole("button", { name: "Approve completion review" }).click();
  await expect(page.getByText("Manager reviewed", { exact: false })).toBeVisible();
  await employeePage.goto("/employees");
  await expect(employeePage.getByText("The people behind Quick Pass")).toHaveCount(0);
  await employeePage.goto("/settings");
  await expect(employeePage.getByText("Business settings & accountability")).toHaveCount(0);
  await page.goto("/tasks?filter=completed");
  const other = page.getByRole("link", { name: "Inspect emissions analyzer", exact: true }).first();
  await other.click();
  await expect(page).toHaveURL(/\/tasks\/[^/]+$/);
  await employeePage.goto(page.url());
  await expect(employeePage.getByText("Page not available", { exact: true })).toBeVisible();
  await page.goto("/employees");
  await page.getByRole("link", { name, exact: true }).click();
  await page.getByRole("button", { name: "Deactivate employee", exact: true }).click();
  await expect(page.getByRole("status")).toHaveText("Saved successfully.");
  await employeePage.goto("/dashboard");
  await expect(employeePage).toHaveURL(/login/);
  await ctx.close();
});
test("bookkeeper has no operations data and mobile layout fits", async ({ page }) => {
  await login(page, "bookkeeper@example.test");
  await expect(
    page.getByRole("heading", { name: "Payroll preparation", exact: true }),
  ).toBeVisible();
  await page.goto("/tasks");
  await expect(page.locator("tbody tr")).toHaveCount(0);
  await page.getByRole("button", { name: "Sign out" }).click();
  await login(page, "al@example.test");
  await page.goto("/payroll");
  await expect(
    page.getByRole("heading", { name: "Payroll & commissions", exact: true }),
  ).toHaveCount(0);
  await page.goto("/certificates");
  await expect(
    page.getByRole("heading", { name: "Certificate inventory", exact: true }),
  ).toHaveCount(0);
  expect((await page.request.get("/api/payroll/unknown/export")).status()).toBe(403);
  await page.goto("/dashboard");
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole("button", { name: "Toggle navigation" })).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))
    .toBe(true);
  await page.getByRole("button", { name: "Toggle navigation" }).click();
  await expect(page.getByRole("link", { name: "My tasks", exact: true })).toBeVisible();
});
