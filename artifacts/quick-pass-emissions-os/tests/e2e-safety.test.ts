import { describe, expect, it } from "vitest";
import { browserSuite, assertSuiteReport } from "../scripts/e2e-suites.mjs";
import {
  assertOwnedDatabase,
  assertCompleteReport,
  isolatedDatabaseEnvironment,
} from "../scripts/e2e-safety.mjs";

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
  it("includes every main workflow and checks per-file coverage, not smoke totals alone", () => {
    const suite = browserSuite({});
    expect(Object.keys(suite)).toEqual(
      expect.arrayContaining([
        "analytics.spec.ts",
        "door-access.spec.ts",
        "addresses.spec.ts",
        "login.spec.ts",
        "theme.spec.ts",
        "security.spec.ts",
        "performance-panels.spec.ts",
        "operations.spec.ts",
        "phase2.spec.ts",
        "phase3.spec.ts",
        "phase4.spec.ts",
        "phase5.spec.ts",
        "inspection-history.spec.ts",
      ]),
    );
    expect(Object.values(suite).reduce((sum, n) => sum + n, 0)).toBe(41);
    const suites = Object.entries(suite).map(([file, count]) => ({
      file,
      specs: Array.from({ length: count }, () => ({ tests: [{}] })),
    }));
    expect(() => assertSuiteReport({ suites }, suite)).not.toThrow();
    expect(() =>
      assertSuiteReport({ suites: suites.filter((s) => s.file !== "phase5.spec.ts") }, suite),
    ).toThrow();
  });
  it("allows explicit local isolation without a Replit preview domain", () => {
    expect(() =>
      assertOwnedDatabase({ ...env, REPLIT_DEV_DOMAIN: "", E2E_DIRECT: "1" }),
    ).not.toThrow();
  });
  it("requires the full expanded navigation suite, not just the original checks", () => {
    const stats = { expected: 9, skipped: 0, flaky: 0, unexpected: 0 };
    expect(() => assertCompleteReport({ stats, errors: [] }, 9)).not.toThrow();
    expect(() =>
      assertCompleteReport({ stats: { ...stats, expected: 3 }, errors: [] }, 10),
    ).toThrow();
  });
  it("keeps business storage pins, backups and recovery targets out of isolated verification", () => {
    const business = {
      ...env,
      DATABASE_URL: "postgresql://localhost/business",
      EXPECTED_DATABASE_ID: "business-id",
      DATA_BACKUP_DIR: "/private/business-backups",
      RESTORE_DATABASE_URL: "postgresql://localhost/recovery",
      GOOGLE_BUSINESS_CLIENT_ID: "private-google-client",
      GOOGLE_BUSINESS_CLIENT_SECRET: "must-not-connect-google",
      GOOGLE_BUSINESS_ENCRYPTION_KEY: "private-google-key",
      SEAM_API_KEY: "must-not-touch-doors",
      SEAM_CONNECTED_ACCOUNT_ID: "private-account",
      DOOR_CODE_HMAC_KEY: "private-key",
      RESEND_API_KEY: "must-not-send",
      OWNER_SUMMARY_FROM_EMAIL: "private@example.test",
      OWNER_SUMMARY_APP_URL: "https://private.example.test",
    };
    const isolated = isolatedDatabaseEnvironment(business, url);
    expect(isolated).toMatchObject({
      DATABASE_URL: url,
      TEST_DATABASE_URL: url,
      EXPECTED_DATABASE_ID: "",
      DATA_BACKUP_DIR: "",
      RESTORE_DATABASE_URL: "",
      GOOGLE_BUSINESS_CLIENT_ID: "",
      GOOGLE_BUSINESS_CLIENT_SECRET: "",
      GOOGLE_BUSINESS_ENCRYPTION_KEY: "",
      SEAM_API_KEY: "",
      SEAM_CONNECTED_ACCOUNT_ID: "",
      DOOR_CODE_HMAC_KEY: "",
      RESEND_API_KEY: "",
      OWNER_SUMMARY_FROM_EMAIL: "",
      OWNER_SUMMARY_APP_URL: "",
    });
    expect(business.EXPECTED_DATABASE_ID).toBe("business-id");
    expect(() => isolatedDatabaseEnvironment(business, business.DATABASE_URL)).toThrow();
    expect(() =>
      isolatedDatabaseEnvironment(business, "postgresql://localhost/other_business"),
    ).toThrow();
  });
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
    expect(() => assertCompleteReport({ stats, errors: [] }, 3)).not.toThrow();
    for (const change of [
      { expected: 0 },
      { expected: 2 },
      { skipped: 1 },
      { flaky: 1 },
      { unexpected: 1 },
    ]) {
      expect(() => assertCompleteReport({ stats: { ...stats, ...change } }, 3)).toThrow();
    }
    expect(() => assertCompleteReport({ stats, errors: [{}] }, 3)).toThrow();
  });
});
