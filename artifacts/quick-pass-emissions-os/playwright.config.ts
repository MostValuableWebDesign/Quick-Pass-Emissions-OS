import { browserSuite } from "./scripts/e2e-suites.mjs";
import { assertOwnedDatabase } from "./scripts/e2e-safety.mjs";
import { defineConfig, devices } from "@playwright/test";
assertOwnedDatabase(process.env);
if (!process.env.E2E_STORAGE_STATE || !process.env.E2E_PRIVATE_DIR || !process.env.E2E_BASE_URL) {
  throw new Error("Run pnpm test:e2e; private authentication setup is required.");
}
export default defineConfig({
  ...(process.env.E2E_DAY_ONLY === "1"
    ? { grep: /selecting a date loads that single-day station count/ }
    : {}),
  ...(process.env.E2E_STATION_ONLY === "1"
    ? { grep: /removed station and configuration pages redirect/ }
    : {}),
  testDir: "tests/e2e",
  testMatch: Object.keys(browserSuite(process.env)),
  timeout: 120000,
  workers: 1,
  fullyParallel: false,
  retries: 0,
  forbidOnly: true,
  outputDir: `${process.env.E2E_PRIVATE_DIR}/results`,
  use: {
    actionTimeout: 15000,
    baseURL: process.env.E2E_BASE_URL,
    storageState: process.env.E2E_STORAGE_STATE,
    trace: "off",
    screenshot: "off",
    video: "off",
    launchOptions: {
      ...(process.env.E2E_CHROMIUM_PATH ? { executablePath: process.env.E2E_CHROMIUM_PATH } : {}),
    },
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  reporter: [["json", { outputFile: `${process.env.E2E_PRIVATE_DIR}/report.json` }]],
});
