import { describe, expect, it } from "vitest";
import { assertOwnedDatabase, assertCompleteReport } from "../scripts/e2e-safety.mjs";

const name = `quick_pass_verify_${"a".repeat(32)}_test`;
const url = `postgresql://localhost/${name}`;
const env = {
  DATABASE_URL: url,
  TEST_DATABASE_URL: url,
  E2E_OWNED_DATABASE: name,
  REPLIT_DEV_DOMAIN: "example.replit.dev",
  NODE_ENV: "development",
};
describe("Browser isolation gates", () => {
  it("accepts only matching runner-owned database URLs", () => {
    expect(() => assertOwnedDatabase(env)).not.toThrow();
    for (const change of [
      { DATABASE_URL: "postgresql://localhost/business" },
      { TEST_DATABASE_URL: "postgresql://localhost/another_test" },
      { E2E_OWNED_DATABASE: "business_test" },
      { NODE_ENV: "production" },
      { REPLIT_DEV_DOMAIN: "" },
    ])
      expect(() => assertOwnedDatabase({ ...env, ...change })).toThrow();
  });
  it("fails empty, skipped, flaky and failed reports explicitly", () => {
    const stats = { expected: 3, skipped: 0, flaky: 0, unexpected: 0 };
    expect(() => assertCompleteReport({ stats, errors: [] })).not.toThrow();
    for (const change of [
      { expected: 0 },
      { expected: 2 },
      { skipped: 1 },
      { flaky: 1 },
      { unexpected: 1 },
    ]) {
      expect(() => assertCompleteReport({ stats: { ...stats, ...change } })).toThrow();
    }
    expect(() => assertCompleteReport({ stats, errors: [{}] })).toThrow();
  });
});
