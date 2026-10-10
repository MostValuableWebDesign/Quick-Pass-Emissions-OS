import "dotenv/config";
import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  testDir: "tests/e2e",
  timeout: 60000,
  workers: 1,
  fullyParallel: false,
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"], channel: "chromium" } }],
  reporter: [["list"], ["html", { open: "never" }]],
});
