import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { login } from "./workflow-helpers";

test("management can add a dealership in a popup without shifting the directory", async ({
  page,
}) => {
  await login(page, "owner@example.test");
  await page.goto("/dealerships");

  const addTrigger = page.getByRole("button", { name: "Add dealership", exact: true });
  await expect(addTrigger).toBeVisible();
  expect(await addTrigger.getAttribute("class")).not.toContain("card");

  const addBox = await addTrigger.boundingBox();
  const directoryBox = await page
    .locator("section.card")
    .filter({ has: page.getByRole("heading", { name: "Active dealership partners" }) })
    .boundingBox();
  expect(addBox).not.toBeNull();
  expect(directoryBox).not.toBeNull();
  expect(addBox!.x).toBeGreaterThan(directoryBox!.x);
  expect(addBox!.x + addBox!.width).toBeGreaterThanOrEqual(
    directoryBox!.x + directoryBox!.width - 2,
  );

  await addTrigger.click();
  const dialog = page.getByRole("dialog", { name: "Add dealership" });
  await expect(dialog).toBeVisible();
  const form = dialog.locator("form").filter({
    has: page.getByRole("button", { name: "Add dealership", exact: true }),
  });
  const name = `Layout dealer ${randomUUID()}`;
  await form.getByLabel("Dealership name").fill(name);
  await form.getByLabel("Phone", { exact: true }).fill("555-0100");
  await form.getByLabel("Email", { exact: true }).fill(`${randomUUID()}@example.test`);
  await form.getByLabel("Street address", { exact: true }).fill("100 Test Street");
  await form.getByRole("button", { name: "Add dealership", exact: true }).click();

  await expect(dialog).not.toBeVisible();
  await expect(page.getByRole("link", { name, exact: true })).toBeVisible();
});
