import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { lookupAddresses } from "@/lib/address-lookup";
import { addressProof, savedContactAddress } from "@/lib/address-provenance";
const address = {
  streetAddress: "100 Fixture Street",
  city: "Atlanta",
  state: "GA",
  postalCode: "30303",
};
const result = {
  place_id: "fixture-place",
  country_code: "us",
  housenumber: "100",
  street: "Fixture Street",
  city: "Atlanta",
  state_code: "GA",
  postcode: "30303",
  address_line2: "Atlanta GA 30303",
};
beforeEach(() => {
  vi.stubEnv("BETTER_AUTH_SECRET", "a".repeat(64));
  vi.stubEnv("GEOAPIFY_API_KEY", "synthetic-key");
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
describe("address lookup and durable provenance", () => {
  it("normalizes complete US building suggestions without mistaking locality display for a suite", async () => {
    const fetch = vi.fn().mockResolvedValue(
      Response.json({
        results: [result, { ...result, housenumber: undefined }, { ...result, country_code: "ca" }],
      }),
    );
    vi.stubGlobal("fetch", fetch);
    const suggestions = await lookupAddresses("100 Fixture");
    expect(suggestions).toHaveLength(1);
    expect(suggestions[0].address).toEqual(address);
    const [url, options] = fetch.mock.calls[0];
    expect(url.searchParams.get("filter")).toBe("countrycode:us");
    expect(url.searchParams.get("limit")).toBe("5");
    expect(options.cache).toBe("no-store");
    const selected = savedContactAddress({
      ...address,
      addressLine2: "Suite 12B",
      addressProof: suggestions[0].proof,
    });
    expect(selected).toMatchObject({
      addressLine2: "Suite 12B",
      addressSource: "GEOAPIFY_SELECTED",
      addressProviderId: "fixture-place",
    });
    expect(selected).not.toHaveProperty("addressProof");
  });
  it("rejects forged provenance, binds every base field and preserves selection across unit-only edits", () => {
    const proof = addressProof(address, "fixture-place");
    const selected = savedContactAddress({ ...address, addressProof: proof });
    for (const key of ["streetAddress", "city", "state", "postalCode"] as const)
      expect(
        savedContactAddress({ ...address, [key]: "changed", addressProof: proof }, selected)
          .addressSource,
      ).toBe("MANUAL");
    expect(savedContactAddress({ ...address, addressProof: `${proof}forged` }).addressSource).toBe(
      "MANUAL",
    );
    expect(savedContactAddress({ addressLine2: "Apt 7" }, selected)).toMatchObject({
      ...address,
      addressLine2: "Apt 7",
      addressSource: "GEOAPIFY_SELECTED",
    });
    expect(savedContactAddress({}, { ...address, addressSource: "VALIDATED" }).addressSource).toBe(
      "MANUAL",
    );
  });
  it("makes missing keys, upstream errors, malformed responses and aborts unavailable without leaking secrets", async () => {
    vi.stubEnv("GEOAPIFY_API_KEY", "");
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    await expect(lookupAddresses("100 Test")).rejects.toThrow("unavailable");
    expect(fetch).not.toHaveBeenCalled();
    vi.stubEnv("GEOAPIFY_API_KEY", "synthetic-key");
    fetch.mockResolvedValueOnce(new Response("private upstream error", { status: 429 }));
    await expect(lookupAddresses("100 Test")).rejects.toThrow("Address lookup unavailable.");
    fetch.mockResolvedValueOnce(Response.json({ results: null }));
    await expect(lookupAddresses("100 Test")).rejects.toThrow();
    fetch.mockImplementationOnce((_url, options) => {
      expect(options.signal.aborted).toBe(true);
      throw new Error("aborted");
    });
    await expect(lookupAddresses("100 Test", AbortSignal.abort())).rejects.toThrow("aborted");
  });
});
