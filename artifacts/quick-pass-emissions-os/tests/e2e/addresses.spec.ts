import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { test, expect, type Locator } from "@playwright/test";
import { login, form, save } from "./workflow-helpers";

for (const kind of ["employee", "dealership", "vendor"] as const) {
  test(`${kind} address selection, manual fallback and create/edit persistence`, async ({
    page,
  }) => {
    await login(page, kind === "vendor" ? "manager@example.test" : "owner@example.test");
    const route =
      kind === "employee" ? "/employees" : kind === "dealership" ? "/dealerships" : "/vendors";
    const name = `Address ${kind} ${randomUUID()}`;
    const create =
      kind === "employee"
        ? "Create employee"
        : kind === "dealership"
          ? "Add dealership"
          : "Add vendor";
    const edit =
      kind === "employee"
        ? "Save changes"
        : kind === "dealership"
          ? "Save dealership"
          : "Save vendor address";
    const fixture = await readFile(
      path.join(process.env.E2E_PRIVATE_DIR!, "address-suggestions.json"),
      "utf8",
    );
    await page.route("**/api/addresses", (r) =>
      r.fulfill({ status: 200, contentType: "application/json", body: fixture }),
    );
    await page.goto(route);
    await page.locator("details.directory-add-details > summary").click();
    let fields = form(page, create);
    await fields.locator('[name="name"]').fill(name);
    await fields.locator('[name="phone"]').fill("555-0100");
    if (kind === "employee") await fields.locator('[name="jobRole"]').fill("Inspector");
    await fields.getByLabel("Apartment, suite or unit (optional)").fill("Suite 12B");
    const search = fields.getByRole("combobox");
    await search.fill("100 Fixture");
    await expect(fields.getByRole("option")).toHaveCount(1);
    await search.press("Escape");
    await expect(fields.getByRole("option")).toHaveCount(0);
    await search.fill("100 Fixture Street");
    await expect(fields.getByRole("option")).toHaveCount(1);
    await search.press("ArrowDown");
    await expect(search).toHaveAttribute("aria-activedescendant", /option-0$/);
    await search.press("Enter");
    await expect(fields.locator(".address-source")).toContainText("Provider selected");
    async function check(f: Locator, street = "100 Fixture Street", unit = "Suite 12B") {
      await expect(f.locator('[name="streetAddress"]')).toHaveValue(street);
      await expect(f.locator('[name="addressLine2"]')).toHaveValue(unit);
      await expect(f.locator('[name="city"]')).toHaveValue("Atlanta");
      await expect(f.locator('[name="state"]')).toHaveValue("GA");
      await expect(f.locator('[name="postalCode"]')).toHaveValue("30303");
    }
    await check(fields);
    await save(fields, create);
    await page.reload();
    await page.getByRole("link", { name, exact: true }).click();
    async function openEditor() {
      if (kind === "dealership") await page.getByText("Edit account", { exact: true }).click();
      return form(page, edit);
    }
    fields = await openEditor();
    await check(fields);
    await expect(fields.locator(".address-source")).toContainText("Provider selected");
    // Units included in search text survive selection too, including pointer selection.
    await fields.locator('[name="addressLine2"]').fill("");
    await fields.getByRole("combobox").fill("100 Fixture Street Apt 4C");
    await expect(fields.getByRole("option")).toHaveCount(1);
    if (kind === "vendor") await fields.getByRole("option").click();
    else {
      await fields.getByRole("combobox").press("ArrowUp");
      await fields.getByRole("combobox").press("Enter");
    }
    await check(fields, "100 Fixture Street", "Apt 4C");
    await save(fields, edit);
    await page.reload();
    fields = await openEditor();
    await check(fields, "100 Fixture Street", "Apt 4C");
    // Unit-only updates retain selected street provenance without claiming unit validation.
    await fields.locator('[name="addressLine2"]').fill("Apartment 4C");
    await save(fields, edit);
    await page.reload();
    fields = await openEditor();
    await check(fields, "100 Fixture Street", "Apartment 4C");
    await expect(fields.locator(".address-source")).toContainText("Provider selected");
    // Provider failure does not block manual corrections or saving/reopening.
    await page.unroute("**/api/addresses");
    await fields.getByRole("combobox").fill("Unavailable address");
    await expect(
      fields.getByText("Address lookup unavailable. You can enter and save the address manually."),
    ).toBeVisible();
    await fields.locator('[name="streetAddress"]').fill("102 Manual Street");
    await expect(fields.locator(".address-source")).toContainText("Manually entered");
    await save(fields, edit);
    await page.reload();
    fields = await openEditor();
    await check(fields, "102 Manual Street", "Apartment 4C");
    await expect(fields.locator(".address-source")).toContainText("Manually entered");
    await page.setViewportSize({ width: 390, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  });
}
