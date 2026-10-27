import { defineConfig, devices } from "@playwright/test";
import { requireTestDatabaseUrl } from "./test-database.config";

const databaseUrl = requireTestDatabaseUrl();
const baseURL = "http://127.0.0.1:3021";
process.env.DATABASE_URL = databaseUrl;
process.env.APP_URL = baseURL;

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  reporter: [["list"]],
  use: {
    baseURL,
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    contextOptions: { reducedMotion: "reduce" },
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "npm run build && npx next start --hostname 127.0.0.1 --port 3021",
    url: `${baseURL}/login`,
    reuseExistingServer: false,
    timeout: 240_000,
    env: { DATABASE_URL: databaseUrl, APP_URL: baseURL },
  },
});
