import { PrismaClient } from "@prisma/client";

const globalDb = globalThis as unknown as { bpWorkbenchPrisma?: PrismaClient };
export const db = globalDb.bpWorkbenchPrisma ?? new PrismaClient({ log: ["error"] });
if (process.env.NODE_ENV !== "production") globalDb.bpWorkbenchPrisma = db;
