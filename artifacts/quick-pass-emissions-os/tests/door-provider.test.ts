import { afterEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { checkPin, doorConfig, getDevice, seam, type SeamDevice } from "../src/lib/security/seam";
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
const config = () => {
  const account = randomUUID();
  vi.stubEnv("SEAM_API_KEY", "fixture-key");
  vi.stubEnv("SEAM_CONNECTED_ACCOUNT_ID", account);
  vi.stubEnv("DOOR_CODE_HMAC_KEY", "b".repeat(64));
  return account;
};
describe("Door provider boundary", () => {
  it("rejects incomplete connection secrets and malformed account IDs", () => {
    config();
    vi.stubEnv("SEAM_CONNECTED_ACCOUNT_ID", "wrong");
    expect(doorConfig()).toBeNull();
    config();
    vi.stubEnv("DOOR_CODE_HMAC_KEY", "short");
    expect(doorConfig()).toBeNull();
  });
  it("keeps keys server-side, forbids redirects, and does not put the PIN in a URL", async () => {
    config();
    const mock = vi.fn().mockResolvedValue(Response.json({}));
    vi.stubGlobal("fetch", mock);
    await seam("/access_codes/create", "POST", { code: "684921" }, Date.now() + 10000);
    const [url, init] = mock.mock.calls[0];
    expect(String(url)).not.toContain("684921");
    expect(init.redirect).toBe("error");
    expect(init.cache).toBe("no-store");
    expect(init.headers.Authorization).toBe("Bearer fixture-key");
    expect(init.body).toBe('{"code":"684921"}');
  });
  it("does not send network requests after the transaction deadline", async () => {
    config();
    const mock = vi.fn();
    vi.stubGlobal("fetch", mock);
    await expect(seam("/devices/get", "GET", {}, Date.now() - 1)).rejects.toThrow("timed out");
    expect(mock).not.toHaveBeenCalled();
  });
  it("rejects another origin before sending any server credential", async () => {
    config();
    const mock = vi.fn();
    vi.stubGlobal("fetch", mock);
    await expect(seam("https://example.test/steal", "GET", {}, Date.now() + 10000)).rejects.toThrow(
      "origin",
    );
    expect(mock).not.toHaveBeenCalled();
  });
  it("sanitizes HTTP and transport failures without exposing provider payloads", async () => {
    config();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("private code 684921", { status: 429 })),
    );
    await expect(seam("/devices/get", "GET", {}, Date.now() + 10000)).rejects.toThrow(
      "could not confirm",
    );
    vi.mocked(fetch).mockRejectedValue(new Error("private code 684921"));
    try {
      await seam("/devices/get", "GET", {}, Date.now() + 10000);
    } catch (e) {
      expect(String(e)).not.toContain("684921");
    }
  });
  it("verifies account binding, management, model and code capability", async () => {
    const account = config(),
      id = randomUUID();
    const d = {
      device_id: id,
      connected_account_id: account,
      device_type: "schlage_lock",
      is_managed: true,
      can_program_online_access_codes: true,
      properties: {
        online: true,
        schlage_metadata: { model: "BE489WB CAM 619" },
        supported_code_lengths: [6],
      },
    };
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async () => Response.json({ device: d })),
    );
    expect((await getDevice(id, account, Date.now() + 10000)).properties.online).toBe(true);
    d.properties.schlage_metadata.model = "Encode Plus BE499";
    await expect(getDevice(id, account, Date.now() + 10000)).rejects.toThrow("BE489WB");
    d.properties.schlage_metadata.model = "BE489WB";
    d.is_managed = false;
    await expect(getDevice(id, account, Date.now() + 10000)).rejects.toThrow("managed");
    d.is_managed = true;
    d.can_program_online_access_codes = false;
    await expect(getDevice(id, account, Date.now() + 10000)).rejects.toThrow("support");
  });
  it("honors actual code lengths and restrictions without guessing unknown constraints", () => {
    const d = {
      properties: {
        supported_code_lengths: [6],
        code_constraints: [{ constraint_type: "no_zeros" }],
      },
    } as SeamDevice;
    expect(() => checkPin("684921", d)).not.toThrow();
    expect(() => checkPin("684920", d)).toThrow("zero");
    d.properties.code_constraints = [{ constraint_type: "unrecognized" }];
    expect(() => checkPin("684921", d)).toThrow("unsupported");
  });
});
