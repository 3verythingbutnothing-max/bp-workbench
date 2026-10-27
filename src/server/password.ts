import { randomBytes, scrypt as nodeScrypt, timingSafeEqual } from "node:crypto";

const cost = { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
function scrypt(password: string, salt: Buffer) {
  return new Promise<Buffer>((resolve, reject) =>
    nodeScrypt(password, salt, 64, cost, (error, key) => (error ? reject(error) : resolve(key))),
  );
}
export async function hashPassword(password: string) {
  if (password.length < 14 || password.length > 128)
    throw new Error("Use a password between 14 and 128 characters.");
  const salt = randomBytes(16);
  return `scrypt-v1$${salt.toString("hex")}$${(await scrypt(password, salt)).toString("hex")}`;
}
export async function checkPassword(password: string, encoded: string) {
  const parts = encoded.split("$");
  if (
    parts.length !== 3 ||
    parts[0] !== "scrypt-v1" ||
    !/^[0-9a-f]{32}$/.test(parts[1]) ||
    !/^[0-9a-f]{128}$/.test(parts[2])
  )
    return false;
  const actual = await scrypt(password, Buffer.from(parts[1], "hex"));
  return timingSafeEqual(actual, Buffer.from(parts[2], "hex"));
}
