import { describe, expect, it, vi } from "vitest";
import { previewServerActionHosts, previewTrustedOrigins } from "../src/lib/auth-origins";

const previewEnv = {
  NODE_ENV: "development",
  REPLIT_DEV_DOMAIN: "example.replit.dev",
  PORT: "24786",
};

describe("Development preview auth origin", () => {
  it("keeps the actual Next config production-safe and aligned with auth", async () => {
    for (const NODE_ENV of ["development", "production"]) {
      vi.stubEnv("NODE_ENV", NODE_ENV);
      vi.stubEnv("PORT", previewEnv.PORT);
      vi.stubEnv("REPLIT_DEV_DOMAIN", previewEnv.REPLIT_DEV_DOMAIN);
      vi.resetModules();
      try {
        const { default: config } = await import("../next.config");
        expect(config.experimental?.serverActions?.allowedOrigins).toEqual(
          NODE_ENV === "development" ? ["0.0.0.0:24786"] : [],
        );
      } finally { vi.unstubAllEnvs(); }
    }
  });
  it("uses the same exact development boundary for Next server actions", () => {
    expect(previewServerActionHosts(previewEnv)).toEqual(["0.0.0.0:24786"]);
    expect(previewServerActionHosts({ ...previewEnv, NODE_ENV: "production" })).toEqual([]);
  });
  it("trusts only the exact upstream preview origin", () => {
    expect(previewTrustedOrigins(previewEnv)).toEqual(["https://0.0.0.0:24786"]);
    for (const origin of [
      "https://unrelated.example", "http://0.0.0.0:24786",
      "https://0.0.0.0:24787", "https://localhost:24786",
    ]) expect(previewTrustedOrigins(previewEnv)).not.toContain(origin);
  });

  it("does not add internal origins in production", () => {
    expect(previewTrustedOrigins({ ...previewEnv, NODE_ENV: "production" })).toEqual([]);
    expect(previewServerActionHosts({ ...previewEnv, NODE_ENV: "production" })).toEqual([]);
  });

  it("does not add internal origins outside a Replit development preview", () => {
    expect(previewTrustedOrigins({ ...previewEnv, REPLIT_DEV_DOMAIN: undefined })).toEqual([]);
    expect(previewTrustedOrigins({ ...previewEnv, NODE_ENV: "test" })).toEqual([]);
  });

  it.each([undefined, "", "0", "65536", "24786/other", "not-a-port"])(
    "rejects invalid port %s",
    (PORT) => {
      expect(previewTrustedOrigins({ ...previewEnv, PORT })).toEqual([]);
    },
  );
});
