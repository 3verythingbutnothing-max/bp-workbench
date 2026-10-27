import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import type { User } from "@prisma/client";
import { db } from "./db";
import { appUrl } from "./env";
import { AppError } from "./errors";
import { checkPassword, hashPassword } from "./password";

const cookieName = "bp_workbench_session";
const digest = (token: string) => createHash("sha256").update(token).digest("hex");
let dummyPassword: Promise<string> | undefined;
export const publicUser = (user: User) => ({
  id: user.id,
  name: user.name,
  email: user.email,
  role: user.role,
});

export async function sessionUser() {
  const token = (await cookies()).get(cookieName)?.value;
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;
  const session = await db.session.findUnique({
    where: { tokenHash: digest(token) },
    include: { user: true },
  });
  if (!session || session.expiresAt.getTime() <= Date.now() || !session.user.active) return null;
  return session.user;
}
export async function requireUser() {
  const user = await sessionUser();
  if (!user) throw new AppError("Sign in to continue.", 401);
  return user;
}
export async function login(email: string, password: string) {
  const key = digest(`login:${email.toLowerCase()}`);
  // One atomic database update makes this limit shared across all server processes.
  const now = new Date();
  const resetAt = new Date(now.getTime() + 15 * 60_000);
  const buckets = await db.$queryRaw<{ count: number }[]>`
    INSERT INTO "LoginThrottle" ("key", "count", "resetAt") VALUES (${key}, 1, ${resetAt})
    ON CONFLICT ("key") DO UPDATE SET "count" = CASE WHEN "LoginThrottle"."resetAt" <= ${now} THEN 1 ELSE "LoginThrottle"."count" + 1 END,
    "resetAt" = CASE WHEN "LoginThrottle"."resetAt" <= ${now} THEN ${resetAt} ELSE "LoginThrottle"."resetAt" END RETURNING "count"`;
  if (buckets[0].count > 10)
    throw new AppError("Too many sign-in attempts. Try again in 15 minutes.", 429);
  const user = await db.user.findUnique({ where: { email: email.toLowerCase() } });
  dummyPassword ||= hashPassword(randomBytes(32).toString("hex"));
  const passwordMatches = await checkPassword(
    password,
    user?.passwordHash || (await dummyPassword),
  );
  if (!user?.active || !passwordMatches) throw new AppError("Email or password is incorrect.", 401);
  const token = randomBytes(32).toString("hex");
  const configuredHours = Number(process.env.SESSION_TTL_HOURS || 8);
  const hours =
    Number.isFinite(configuredHours) && configuredHours >= 1 && configuredHours <= 24
      ? configuredHours
      : 8;
  const expiresAt = new Date(Date.now() + hours * 60 * 60_000);
  await db.$transaction(async (tx) => {
    await tx.session.deleteMany({ where: { expiresAt: { lt: new Date() } } });
    await tx.session.create({ data: { userId: user.id, tokenHash: digest(token), expiresAt } });
    await tx.auditEntry.create({
      data: { userId: user.id, action: "LOGIN", entityType: "User", entityId: user.id },
    });
  });
  (await cookies()).set(cookieName, token, {
    httpOnly: true,
    sameSite: "strict",
    secure: appUrl().protocol === "https:",
    path: "/",
    expires: expiresAt,
  });
  return publicUser(user);
}
export async function logout() {
  const token = (await cookies()).get(cookieName)?.value;
  if (token && /^[a-f0-9]{64}$/.test(token)) {
    await db.$transaction(async (tx) => {
      const session = await tx.session.findUnique({ where: { tokenHash: digest(token) } });
      if (session) {
        const removed = await tx.session.deleteMany({ where: { id: session.id } });
        if (removed.count)
          await tx.auditEntry.create({
            data: {
              userId: session.userId,
              action: "LOGOUT",
              entityType: "User",
              entityId: session.userId,
            },
          });
      }
    });
  }
  (await cookies()).set(cookieName, "", {
    httpOnly: true,
    sameSite: "strict",
    secure: appUrl().protocol === "https:",
    path: "/",
    maxAge: 0,
  });
}
