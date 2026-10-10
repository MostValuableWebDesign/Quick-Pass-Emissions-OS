import { describe, expect, it } from "vitest";
import { previewTrustedOrigins } from "../src/lib/auth-origins";

const previewEnv = {
  NODE_ENV: "development",
  REPLIT_DEV_DOMAIN: "example.replit.dev",
  PORT: "24786",
};

describe("Development preview auth origin", () => {
  it("trusts only the exact upstream preview origin", () => {
    expect(previewTrustedOrigins(previewEnv)).toEqual(["https://0.0.0.0:24786"]);
  });

  it("does not add internal origins in production", () => {
    expect(previewTrustedOrigins({ ...previewEnv, NODE_ENV: "production" })).toEqual([]);
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
