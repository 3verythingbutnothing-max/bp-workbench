import path from "node:path";
import { defineConfig } from "vitest/config";
import { requireTestDatabaseUrl } from "./test-database.config";

const databaseUrl = requireTestDatabaseUrl();
process.env.DATABASE_URL = databaseUrl;
process.env.APP_URL ||= "http://127.0.0.1:3021";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
  test: {
    environment: "node",
    include: ["tests/integration/**/*.test.ts"],
    fileParallelism: false,
    maxWorkers: 1,
    clearMocks: true,
    restoreMocks: true,
    testTimeout: 30_000,
    hookTimeout: 30_000,
    env: { DATABASE_URL: databaseUrl, APP_URL: process.env.APP_URL },
  },
});
