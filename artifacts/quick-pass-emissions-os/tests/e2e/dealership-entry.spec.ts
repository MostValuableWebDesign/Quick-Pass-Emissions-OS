import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { login } from "./workflow-helpers";

test("management can add a dealership from the right-aligned card-free control", async ({
  page,
}) => {
  await login(page, "owner@example.test");
  await page.goto("/dealerships");

  const addDetails = page.locator("details.directory-add-details");
  const addSummary = addDetails.locator("summary");
  await expect(addSummary).toHaveText("Add dealership");
  expect(await addDetails.getAttribute("class")).not.toContain("card");

  const addBox = await addSummary.boundingBox();
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

  await addSummary.click();
  const form = page.locator("form").filter({
    has: page.getByRole("button", { name: "Add dealership", exact: true }),
  });
  const name = `Layout dealer ${randomUUID()}`;
  await form.getByLabel("Dealership name").fill(name);
  await form.getByLabel("Phone", { exact: true }).fill("555-0100");
  await form.getByLabel("Email", { exact: true }).fill(`${randomUUID()}@example.test`);
  await form.getByLabel("Street address", { exact: true }).fill("100 Test Street");
  await form.getByRole("button", { name: "Add dealership", exact: true }).click();

  await expect(form.getByRole("status")).toHaveText("Saved successfully.");
  await expect(page.getByRole("link", { name, exact: true })).toBeVisible();
});
