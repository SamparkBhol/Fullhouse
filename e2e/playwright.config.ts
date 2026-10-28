import { defineConfig, devices } from "playwright/test";

const baseURL = process.env.E2E_BASE_URL;
if (!baseURL) throw new Error("E2E_BASE_URL is not set. Run the specs through npm run e2e.");

export default defineConfig({
  testDir: "specs",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  forbidOnly: true,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  reporter: [["list"]],
  use: {
    baseURL,
    headless: true,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    timezoneId: "Europe/London",
    locale: "en-GB",
  },
  projects: [
    { name: "app", testIgnore: /key_missing\.spec\.ts$/, outputDir: "../.tmp/e2e/results/app", use: { ...devices["Desktop Chrome"] } },
    { name: "nokey", testMatch: /key_missing\.spec\.ts$/, outputDir: "../.tmp/e2e/results/nokey", use: { ...devices["Desktop Chrome"] } },
  ],
});
