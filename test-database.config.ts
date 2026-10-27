import { loadEnvFile } from "node:process";

try {
  loadEnvFile(".env");
} catch (error) {
  if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error;
}

/** Refuse implicit or production-shaped database targets in write-capable tests. */
export function requireTestDatabaseUrl(): string {
  const value = process.env.TEST_DATABASE_URL;
  if (!value)
    throw new Error(
      "TEST_DATABASE_URL is required. Create a disposable PostgreSQL database whose name ends with _test.",
    );
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("TEST_DATABASE_URL must be a valid PostgreSQL URL.");
  }
  if (
    !["postgresql:", "postgres:"].includes(url.protocol) ||
    !/^\/[A-Za-z0-9_-]+_test$/.test(url.pathname)
  ) {
    throw new Error(
      "Tests require a PostgreSQL database with a name ending _test. Never point tests at operational data.",
    );
  }
  return value;
}
