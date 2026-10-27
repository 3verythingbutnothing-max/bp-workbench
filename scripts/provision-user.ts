import { PrismaClient } from "@prisma/client";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { hashPassword } from "../src/server/password";

async function passwordPrompt() {
  if (!stdin.isTTY) throw new Error("Use --password-stdin when provisioning non-interactively.");
  stdout.write("Password (14–128 characters): ");
  stdin.setRawMode(true);
  stdin.resume();
  let password = "";
  try {
    return await new Promise<string>((resolve, reject) => {
      const onData = (chunk: Buffer) => {
        for (const char of chunk.toString("utf8")) {
          if (char === "\u0003") {
            stdin.off("data", onData);
            reject(new Error("Provisioning cancelled."));
            return;
          }
          if (char === "\r" || char === "\n") {
            stdin.off("data", onData);
            resolve(password);
            return;
          }
          if (char === "\u007f" || char === "\b") password = password.slice(0, -1);
          else if (char >= " ") password += char;
        }
      };
      stdin.on("data", onData);
    });
  } finally {
    stdin.setRawMode(false);
    stdin.pause();
    stdout.write("\n");
  }
}
async function main() {
  const args = process.argv.slice(2);
  const allowed = new Set(["--email", "--name", "--role", "--password-stdin"]);
  for (let index = 0; index < args.length; index++) {
    if (!allowed.has(args[index]))
      throw new Error(
        "Supported options: --email --name --role --password-stdin. Never pass passwords as command arguments.",
      );
    if (args[index] !== "--password-stdin") index++;
  }
  const option = (name: string) => {
    const index = args.indexOf(name);
    return index < 0 ? "" : args[index + 1] || "";
  };
  const email = option("--email").trim().toLowerCase();
  const name = option("--name").trim();
  const role = option("--role").toUpperCase();
  if (
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
    email.length > 254 ||
    !name ||
    name.length > 120 ||
    !["ANALYST", "MANAGER"].includes(role)
  )
    throw new Error("Provide a valid --email, --name, and --role ANALYST or MANAGER.");
  let password: string;
  if (args.includes("--password-stdin")) {
    const readline = createInterface({ input: stdin });
    const result = await readline[Symbol.asyncIterator]().next();
    readline.close();
    password = result.value || "";
  } else password = await passwordPrompt();
  const passwordHash = await hashPassword(password);
  password = "";
  const db = new PrismaClient();
  try {
    if (await db.user.findUnique({ where: { email } }))
      throw new Error(
        "That user already exists. Provisioning never overwrites an existing identity.",
      );
    await db.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: { email, name, role: role as "ANALYST" | "MANAGER", passwordHash },
      });
      await tx.auditEntry.create({
        data: {
          userId: user.id,
          action: "USER_PROVISIONED",
          entityType: "User",
          entityId: user.id,
          reason: "Explicit local operator provisioning",
          after: { email, name, role },
        },
      });
    });
    stdout.write(`Provisioned ${role} account for ${email}. No business records were created.\n`);
  } finally {
    await db.$disconnect();
  }
}
main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Provisioning failed.");
  process.exitCode = 1;
});
