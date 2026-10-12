import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { addressProof } from "@/lib/address-provenance";
const session = vi.hoisted(() => ({ userId: "" }));
vi.mock("@/lib/auth", () => ({
  auth: {
    api: { getSession: async () => (session.userId ? { user: { id: session.userId } } : null) },
  },
}));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("next/navigation", () => ({
  redirect: () => {
    throw new Error("NEXT_REDIRECT");
  },
}));
const enabled = !!process.env.TEST_DATABASE_URL;
if (enabled) {
  if (!new URL(process.env.TEST_DATABASE_URL!).pathname.endsWith("_test"))
    throw new Error("Use an isolated _test database");
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
}
const address = {
  streetAddress: "100 Fixture Street",
  addressLine2: "Suite 12B",
  city: "Atlanta",
  state: "GA",
  postalCode: "30303",
};
function form(data: Record<string, string>) {
  const f = new FormData();
  for (const [k, v] of Object.entries(data)) f.set(k, v);
  return f;
}
(enabled ? describe : describe.skip)("contact address protected persistence", () => {
  let db: PrismaClient,
    actions: typeof import("@/app/actions"),
    dealers: typeof import("@/modules/finance/service"),
    vendors: typeof import("@/modules/maintenance/service");
  let owner: string, manager: string, staff: string;
  beforeAll(async () => {
    db = (await import("@/lib/db")).db;
    actions = await import("@/app/actions");
    dealers = await import("@/modules/finance/service");
    vendors = await import("@/modules/maintenance/service");
    vi.stubEnv("BETTER_AUTH_SECRET", "a".repeat(64));
    for (const role of ["OWNER", "ADMIN", "EMPLOYEE"] as const) {
      const user = await db.user.create({
        data: { name: role, role, email: `${randomUUID()}@example.test` },
      });
      if (role === "OWNER") owner = user.id;
      else if (role === "ADMIN") manager = user.id;
      else staff = user.id;
    }
  });
  afterAll(async () => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    await db?.$disconnect();
  });
  it("saves employee selection, retains units across reopen, and downgrades edited base fields", async () => {
    session.userId = manager;
    const name = `Address employee ${randomUUID()}`;
    const input = {
      name,
      phone: "",
      jobRole: "Inspector",
      ...address,
      addressProof: addressProof(address, "employee-fixture"),
    };
    expect((await actions.saveEmployee({}, form(input))).ok).toBe(true);
    let row = await db.employee.findFirstOrThrow({ where: { user: { name } } });
    expect(row).toMatchObject({
      ...address,
      addressSource: "GEOAPIFY_SELECTED",
      addressProviderId: "employee-fixture",
    });
    expect(
      (
        await actions.saveEmployee(
          {},
          form({ ...input, id: row.id, addressProof: "", addressLine2: "Apt 4C" }),
        )
      ).ok,
    ).toBe(true);
    row = await db.employee.findUniqueOrThrow({ where: { id: row.id } });
    expect(row).toMatchObject({ addressSource: "GEOAPIFY_SELECTED", addressLine2: "Apt 4C" });
    expect(
      (
        await actions.saveEmployee(
          {},
          form({ ...input, id: row.id, streetAddress: "102 Manual Street" }),
        )
      ).ok,
    ).toBe(true);
    expect(await db.employee.findUniqueOrThrow({ where: { id: row.id } })).toMatchObject({
      streetAddress: "102 Manual Street",
      addressSource: "MANUAL",
      addressProviderId: "",
    });
  });
  it("saves dealership structured billing and selection, preserves partial edits, and supports legacy addresses", async () => {
    const input = {
      id: "",
      version: 0,
      name: `Address dealer ${randomUUID()}`,
      ...address,
      addressProof: addressProof(address, "dealer-fixture"),
    };
    let row = await dealers.saveDealer(owner, input);
    expect(await db.dealership.findUniqueOrThrow({ where: { id: row.id } })).toMatchObject({
      ...address,
      addressSource: "GEOAPIFY_SELECTED",
      billingAddress: "100 Fixture Street\nSuite 12B\nAtlanta, GA 30303",
    });
    row = await dealers.saveDealer(owner, {
      id: row.id,
      version: row.version,
      name: row.name,
      addressLine2: "Suite 7",
    });
    expect(row).toMatchObject({
      streetAddress: address.streetAddress,
      addressLine2: "Suite 7",
      addressSource: "GEOAPIFY_SELECTED",
      billingAddress: "100 Fixture Street\nSuite 7\nAtlanta, GA 30303",
    });
    row = await dealers.saveDealer(owner, {
      id: row.id,
      version: row.version,
      name: row.name,
      billingAddress: "Legacy building\nUnit 2",
    });
    expect(row).toMatchObject({
      streetAddress: "Legacy building\nUnit 2",
      addressSource: "MANUAL",
      addressProviderId: "",
    });
  });
  it("saves and edits unconfirmed vendor addresses without asserting verified business contacts", async () => {
    const input = {
      name: `Address vendor ${randomUUID()}`,
      phone: "555-0100",
      ...address,
      addressProof: addressProof(address, "vendor-fixture"),
    };
    let row = await vendors.addUnverifiedVendor(manager, input);
    expect(await db.vendor.findUniqueOrThrow({ where: { id: row.id } })).toMatchObject({
      ...address,
      addressSource: "GEOAPIFY_SELECTED",
      verifiedDate: null,
    });
    const version = row.version;
    row = await vendors.saveVendorAddress(manager, { id: row.id, version, addressLine2: "Unit 5" });
    expect(row).toMatchObject({
      addressLine2: "Unit 5",
      addressSource: "GEOAPIFY_SELECTED",
      verifiedDate: null,
    });
    await expect(
      vendors.saveVendorAddress(manager, { id: row.id, version, streetAddress: "Stale" }),
    ).rejects.toThrow("changed");
    row = await vendors.saveVendorAddress(manager, {
      id: row.id,
      version: row.version,
      streetAddress: "102 Manual Street",
      addressSource: "VALIDATED",
    });
    expect(row).toMatchObject({
      streetAddress: "102 Manual Street",
      addressLine2: "Unit 5",
      addressSource: "MANUAL",
      addressProviderId: "",
      verifiedDate: null,
    });
    expect(
      await db.auditLog.count({ where: { entityId: row.id, action: "VENDOR_ADDRESS_UPDATED" } }),
    ).toBe(2);
  });
  it("shares an atomic provider quota across concurrent authenticated lookups", async () => {
    session.userId = owner;
    vi.stubEnv("GEOAPIFY_API_KEY", "synthetic-key");
    const upstream = vi.fn().mockImplementation(async () =>
      Response.json({
        results: [
          {
            place_id: "quota-fixture",
            country_code: "us",
            housenumber: "100",
            street: "Fixture Street",
            city: "Atlanta",
            state_code: "GA",
            postcode: "30303",
          },
        ],
      }),
    );
    vi.stubGlobal("fetch", upstream);
    const { POST } = await import("@/app/api/addresses/route");
    const responses = await Promise.all(
      Array.from({ length: 35 }, () =>
        POST(
          new Request("https://quickpass.example/api/addresses", {
            method: "POST",
            headers: { Origin: "https://quickpass.example" },
            body: JSON.stringify({ query: "100 Fixture" }),
          }),
        ),
      ),
    );
    expect(responses.filter((r) => r.status === 200)).toHaveLength(30);
    expect(responses.filter((r) => r.status === 429)).toHaveLength(5);
    expect(upstream).toHaveBeenCalledTimes(30);
    const body = await responses.find((r) => r.status === 200)!.json();
    expect(body.suggestions[0].address).toEqual({
      streetAddress: address.streetAddress,
      city: address.city,
      state: address.state,
      postalCode: address.postalCode,
    });
    expect(body.suggestions[0].proof).toBe(addressProof(address, "quota-fixture"));
    await db.rateLimit.update({
      where: { key: `contact-address:${owner}` },
      data: { lastRequest: BigInt(Date.now() - 61000) },
    });
    expect(
      (
        await POST(
          new Request("https://quickpass.example/api/addresses", {
            method: "POST",
            headers: { Origin: "https://quickpass.example" },
            body: JSON.stringify({ query: "100 Fixture" }),
          }),
        )
      ).status,
    ).toBe(200);
    expect(
      (await db.rateLimit.findUniqueOrThrow({ where: { key: `contact-address:${owner}` } })).count,
    ).toBe(1);
    vi.unstubAllGlobals();
  });
  it("rejects staff and deactivated management saves, without creating addresses", async () => {
    session.userId = staff;
    expect(
      (
        await actions.saveEmployee(
          {},
          form({ name: "Denied", phone: "", jobRole: "Inspector", ...address }),
        )
      ).ok,
    ).toBe(false);
    await expect(
      dealers.saveDealer(staff, { id: "", version: 0, name: "Denied", ...address }),
    ).rejects.toThrow("permission");
    await expect(
      vendors.addUnverifiedVendor(staff, { name: "Denied", phone: "555-555-0100", ...address }),
    ).rejects.toThrow("permission");
    await db.user.update({ where: { id: manager }, data: { active: false } });
    session.userId = manager;
    expect(
      (
        await actions.saveEmployee(
          {},
          form({ name: "Denied", phone: "", jobRole: "Inspector", ...address }),
        )
      ).ok,
    ).toBe(false);
    await expect(
      vendors.addUnverifiedVendor(manager, { name: "Denied", phone: "555-555-0100", ...address }),
    ).rejects.toThrow("permission");
  });
});
