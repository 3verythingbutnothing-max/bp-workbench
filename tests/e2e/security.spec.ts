import { createHash, randomUUID } from "node:crypto";
import { expect, test, type APIRequestContext } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { requireTestDatabaseUrl } from "../../test-database.config";
import { hashPassword } from "../../src/server/password";

const databaseUrl = requireTestDatabaseUrl();
const db = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
const prefix = `security-e2e-${randomUUID()}`;
const password = `Synthetic-E2E-Only-${randomUUID()}`;
const origin = "http://127.0.0.1:3021";
const emails = {
  analyst: `${prefix}-analyst@example.invalid`,
  ui: `${prefix}-ui@example.invalid`,
  throttle: `${prefix}-throttle@example.invalid`,
  logout: `${prefix}-logout@example.invalid`,
  inactive: `${prefix}-inactive@example.invalid`,
};
const ids: string[] = [];

async function signIn(request: APIRequestContext, email: string) {
  const result = await request.post("/api/auth/login", {
    headers: { Origin: origin },
    data: { email, password },
  });
  expect(result.status(), await result.text()).toBe(200);
  return result;
}

test.beforeAll(async () => {
  const passwordHash = await hashPassword(password);
  for (const [kind, email] of Object.entries(emails)) {
    const user = await db.user.create({
      data: { email, name: `Security ${kind}`, role: "ANALYST", passwordHash },
    });
    ids.push(user.id);
  }
});

test.afterAll(async () => {
  // Only this run's unique identities and their auth/audit artifacts are removed.
  await db.auditEntry.deleteMany({ where: { userId: { in: ids } } });
  await db.notification.deleteMany({ where: { userId: { in: ids } } });
  await db.session.deleteMany({ where: { userId: { in: ids } } });
  await db.user.deleteMany({ where: { id: { in: ids } } });
  const keys = Object.values(emails).map((email) =>
    createHash("sha256").update(`login:${email}`).digest("hex"),
  );
  await db.loginThrottle.deleteMany({ where: { key: { in: keys } } });
  await db.$disconnect();
});

test("unauthenticated business routes fail closed", async ({ request }) => {
  expect((await request.get("/api/workspace")).status()).toBe(401);
  const action = await request.post("/api/actions", {
    headers: { Origin: origin },
    data: {
      action: "createContract",
      payload: { number: prefix, name: "Not created", customer: "Synthetic" },
    },
  });
  expect(action.status()).toBe(401);
  expect(await db.contract.findUnique({ where: { number: prefix } })).toBeNull();
  const session = await request.get("/api/auth/session");
  expect(session.status()).toBe(200);
  expect(await session.json()).toEqual({ user: null });
});

test("missing and cross-site origins cannot sign in or mutate", async ({ request }) => {
  const input = { email: emails.analyst, password };
  const missing = await request.post("/api/auth/login", { data: input });
  expect(missing.status()).toBe(403);
  const crossSite = await request.post("/api/auth/login", {
    headers: { Origin: "https://attacker.invalid" },
    data: input,
  });
  expect(crossSite.status()).toBe(403);
  await signIn(request, emails.analyst);
  const before = await db.auditEntry.count({ where: { userId: ids[0] } });
  const missingMutation = await request.post("/api/actions", {
    data: {
      action: "createContract",
      payload: { number: `${prefix}-forbidden`, name: "Not created", customer: "Synthetic" },
    },
  });
  expect(missingMutation.status()).toBe(403);
  const crossMutation = await request.post("/api/actions", {
    headers: { Origin: "https://attacker.invalid" },
    data: { action: "createContract", payload: {} },
  });
  expect(crossMutation.status()).toBe(403);
  const fetchSite = await request.post("/api/actions", {
    headers: { Origin: origin, "Sec-Fetch-Site": "cross-site" },
    data: { action: "createContract", payload: {} },
  });
  expect(fetchSite.status()).toBe(403);
  expect(await db.auditEntry.count({ where: { userId: ids[0] } })).toBe(before);
  expect(await db.contract.findUnique({ where: { number: `${prefix}-forbidden` } })).toBeNull();
});

test("login screen reports a bad password without opening the workspace", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Work email").fill(emails.ui);
  await page.getByLabel("Password", { exact: true }).fill("Synthetic-incorrect-password");
  await page.getByRole("button", { name: "Sign in to your workspace" }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: "Email or password is incorrect." }),
  ).toHaveText("Email or password is incorrect.");
  await expect(page).toHaveURL(/\/login$/);
  const user = await db.user.findUniqueOrThrow({ where: { email: emails.ui } });
  expect(await db.session.count({ where: { userId: user.id } })).toBe(0);
});

test("login throttle is durably enforced per account across request contexts", async ({
  playwright,
  request,
}) => {
  for (let attempt = 0; attempt < 10; attempt++) {
    const result = await request.post("/api/auth/login", {
      headers: { Origin: origin },
      data: { email: emails.throttle, password: "Synthetic-wrong-password" },
    });
    expect(result.status(), `Attempt ${attempt + 1}`).toBe(401);
  }
  const key = createHash("sha256").update(`login:${emails.throttle}`).digest("hex");
  const bucket = await db.loginThrottle.findUniqueOrThrow({ where: { key } });
  expect(bucket.count).toBe(10);
  expect(bucket.resetAt.getTime()).toBeGreaterThan(Date.now());
  expect(bucket.resetAt.getTime()).toBeLessThanOrEqual(Date.now() + 15 * 60_000);
  const separate = await playwright.request.newContext({ baseURL: origin });
  try {
    const blocked = await separate.post("/api/auth/login", {
      headers: { Origin: origin },
      data: { email: emails.throttle, password },
    });
    expect(blocked.status()).toBe(429);
    expect((await blocked.json()).message).toContain("15 minutes");
    expect((await db.loginThrottle.findUniqueOrThrow({ where: { key } })).count).toBe(11);
  } finally {
    await separate.dispose();
  }
});

test("opaque sessions are HTTP-only, strict same-site, hash-stored and DTOs omit secrets", async ({
  request,
}) => {
  const loginStartedAt = Date.now();
  await signIn(request, emails.analyst);
  const loginFinishedAt = Date.now();
  const state = await request.storageState();
  const cookie = state.cookies.find((value) => value.name === "bp_workbench_session");
  expect(cookie).toBeDefined();
  expect(cookie!.value).toMatch(/^[a-f0-9]{64}$/);
  expect(cookie!.httpOnly).toBe(true);
  expect(cookie!.sameSite).toBe("Strict");
  expect(cookie!.path).toBe("/");
  expect(cookie!.expires).toBeGreaterThan(Date.now() / 1000);
  const digest = createHash("sha256").update(cookie!.value).digest("hex");
  const stored = await db.session.findUniqueOrThrow({ where: { tokenHash: digest } });
  expect(stored.createdAt.getTime()).toBeGreaterThanOrEqual(loginStartedAt - 1000);
  expect(stored.createdAt.getTime()).toBeLessThanOrEqual(loginFinishedAt + 1000);
  const ttlHours = Number(process.env.SESSION_TTL_HOURS || 8);
  const expectedTtl =
    (Number.isFinite(ttlHours) && ttlHours >= 1 && ttlHours <= 24 ? ttlHours : 8) * 60 * 60_000;
  expect(stored.expiresAt.getTime()).toBeGreaterThanOrEqual(loginStartedAt + expectedTtl - 1000);
  expect(stored.expiresAt.getTime()).toBeLessThanOrEqual(loginFinishedAt + expectedTtl + 1000);
  const loginAudit = await db.auditEntry.findFirstOrThrow({
    where: { userId: stored.userId, action: "LOGIN" },
    orderBy: { createdAt: "desc" },
  });
  expect(loginAudit.createdAt.getTime()).toBeGreaterThanOrEqual(loginStartedAt - 1000);
  expect(loginAudit.createdAt.getTime()).toBeLessThanOrEqual(loginFinishedAt + 1000);
  expect(stored.tokenHash).not.toBe(cookie!.value);
  expect(await db.session.findUnique({ where: { tokenHash: cookie!.value } })).toBeNull();
  const result = await request.get("/api/workspace");
  expect(result.status()).toBe(200);
  const data = await result.json();
  expect(data.user.email).toBe(emails.analyst);
  expect(data.user.role).toBe("ANALYST");
  expect(Object.keys(data.user).sort()).toEqual(["email", "id", "name", "role"]);
  expect(JSON.stringify(data)).not.toMatch(/"(?:passwordHash|tokenHash|sessions|password)"\s*:/);
  expect(
    data.users.every(
      (value: Record<string, unknown>) =>
        Object.keys(value).sort().join(",") === "email,id,name,role",
    ),
  ).toBe(true);
  const session = await request.get("/api/auth/session");
  expect(Object.keys((await session.json()).user).sort()).toEqual(["email", "id", "name", "role"]);
});

test("analysts cannot invoke manager-only actions through the API", async ({ request }) => {
  await signIn(request, emails.analyst);
  const before = await db.auditEntry.count({
    where: { userId: ids[0], action: "SUPPLIER_ELIGIBILITY_UPDATED" },
  });
  const result = await request.post("/api/actions", {
    headers: { Origin: origin },
    data: {
      action: "updateSupplier",
      payload: {
        supplierId: "not-a-real-supplier",
        eligibility: "ELIGIBLE",
        strategy: "GROW",
        commodityCodes: [],
        evidenceNote: "No mutation should occur",
      },
    },
  });
  expect(result.status()).toBe(403);
  expect((await result.json()).message).toContain("Only a manager");
  expect(
    await db.auditEntry.count({
      where: { userId: ids[0], action: "SUPPLIER_ELIGIBILITY_UPDATED" },
    }),
  ).toBe(before);
});

test("logout revokes the stored session, including replay of the old cookie", async ({
  request,
  playwright,
}) => {
  await signIn(request, emails.logout);
  const oldState = await request.storageState();
  const cookie = oldState.cookies.find((value) => value.name === "bp_workbench_session")!;
  const tokenHash = createHash("sha256").update(cookie.value).digest("hex");
  const result = await request.post("/api/auth/logout", { headers: { Origin: origin } });
  expect(result.status()).toBe(200);
  expect(await db.session.findUnique({ where: { tokenHash } })).toBeNull();
  expect((await request.get("/api/workspace")).status()).toBe(401);
  const replay = await playwright.request.newContext({ baseURL: origin, storageState: oldState });
  try {
    expect((await replay.get("/api/workspace")).status()).toBe(401);
    expect(await (await replay.get("/api/auth/session")).json()).toEqual({ user: null });
  } finally {
    await replay.dispose();
  }
});

test("deactivating an account immediately removes existing-session access", async ({ request }) => {
  await signIn(request, emails.inactive);
  const user = await db.user.update({ where: { email: emails.inactive }, data: { active: false } });
  expect((await request.get("/api/workspace")).status()).toBe(401);
  const action = await request.post("/api/actions", {
    headers: { Origin: origin },
    data: {
      action: "createContract",
      payload: { number: `${prefix}-inactive`, name: "Not created", customer: "Synthetic" },
    },
  });
  expect(action.status()).toBe(401);
  expect(await db.contract.findUnique({ where: { number: `${prefix}-inactive` } })).toBeNull();
  const result = await request.post("/api/auth/login", {
    headers: { Origin: origin },
    data: { email: emails.inactive, password },
  });
  expect(result.status()).toBe(401);
  expect((await result.json()).message).toBe("Email or password is incorrect.");
  expect(
    await db.auditEntry.count({ where: { userId: user.id, action: "CONTRACT_CREATED" } }),
  ).toBe(0);
});
