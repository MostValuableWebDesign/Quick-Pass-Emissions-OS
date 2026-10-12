import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ currentUser: vi.fn(), lookup: vi.fn(), quota: vi.fn() }));
vi.mock("@/lib/access", () => ({ currentUser: mocks.currentUser }));
vi.mock("@/lib/address-lookup", () => ({ lookupAddresses: mocks.lookup }));
vi.mock("@/lib/db", () => ({ db: { $queryRaw: mocks.quota } }));
import { POST } from "@/app/api/addresses/route";
const request = (query: unknown, origin = "https://quickpass.example") =>
  new Request("https://quickpass.example/api/addresses", {
    method: "POST",
    headers: { Origin: origin, "Content-Type": "application/json" },
    body: JSON.stringify({ query }),
  });
describe("protected address endpoint", () => {
  afterEach(() => vi.unstubAllEnvs());
  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubEnv("GEOAPIFY_API_KEY", "synthetic");
    mocks.currentUser.mockResolvedValue({ id: "owner" });
    mocks.quota.mockResolvedValue([{ count: 1 }]);
    mocks.lookup.mockResolvedValue([]);
  });
  it("denies cross-origin and denied identities before spending provider quota", async () => {
    expect((await POST(request("100 Street", "https://untrusted.example"))).status).toBe(403);
    expect(mocks.currentUser).not.toHaveBeenCalled();
    mocks.currentUser.mockRejectedValue(new Error("NEXT_REDIRECT"));
    await expect(POST(request("100 Street"))).rejects.toThrow("NEXT_REDIRECT");
    expect(mocks.lookup).not.toHaveBeenCalled();
  });
  it("validates query bounds, enforces shared quota and returns uncached suggestions", async () => {
    for (const query of ["", "ab", "a".repeat(201), null, false])
      expect((await POST(request(query))).status).toBe(400);
    expect(mocks.lookup).not.toHaveBeenCalled();
    mocks.quota.mockResolvedValueOnce([{ count: 31 }]);
    expect((await POST(request("100 Street"))).status).toBe(429);
    expect(mocks.lookup).not.toHaveBeenCalled();
    const response = await POST(request("100 Street"));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({ suggestions: [] });
  });
  it("allows manual fallback when unconfigured or provider fails with private diagnostics", async () => {
    vi.stubEnv("GEOAPIFY_API_KEY", "");
    expect((await POST(request("100 Street"))).status).toBe(503);
    expect(mocks.quota).not.toHaveBeenCalled();
    vi.stubEnv("GEOAPIFY_API_KEY", "synthetic");
    mocks.lookup.mockRejectedValue(new Error("private diagnostic"));
    const response = await POST(request("100 Street"));
    expect(response.status).toBe(503);
    expect(JSON.stringify(await response.json())).not.toContain("private diagnostic");
  });
});
