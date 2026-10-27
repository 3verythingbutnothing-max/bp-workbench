import { describe, expect, it } from "vitest";
import { checkPassword, hashPassword } from "@/server/password";

describe("password encoding", () => {
  it("uses a random salt and verifies the encoded password without storing plaintext", async () => {
    const password = "synthetic-test-password-only";
    const first = await hashPassword(password);
    const second = await hashPassword(password);
    expect(first).not.toBe(second);
    expect(first).toMatch(/^scrypt-v1\$[0-9a-f]{32}\$[0-9a-f]{128}$/);
    expect(first).not.toContain(password);
    expect(await checkPassword(password, first)).toBe(true);
    expect(await checkPassword("different-synthetic-password", first)).toBe(false);
  });
  it("rejects short/oversize provisioning passwords and malformed stored hashes", async () => {
    await expect(hashPassword("too-short")).rejects.toThrow("14 and 128");
    await expect(hashPassword("a".repeat(129))).rejects.toThrow("14 and 128");
    for (const value of [
      "",
      "plaintext",
      "scrypt-v1$bad$bad",
      "unknown-v2$" + "0".repeat(32) + "$" + "0".repeat(128),
    ]) {
      expect(await checkPassword("synthetic-test-password-only", value)).toBe(false);
    }
  });
});
