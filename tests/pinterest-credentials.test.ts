import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";

import { decryptPinterestCredentials, encryptPinterestCredentials } from "@/lib/growth/pinterest/credentials";

describe("Pinterest credential encryption", () => {
  const key = randomBytes(32).toString("base64");

  it("round-trips through a randomized authenticated envelope", () => {
    const credentials = { accessToken: "test-access-value", refreshToken: "test-refresh-value" };
    const first = encryptPinterestCredentials(credentials, key);
    const second = encryptPinterestCredentials(credentials, key);
    expect(first).not.toBe(second);
    expect(first).not.toContain(credentials.accessToken);
    expect(first).not.toContain(credentials.refreshToken);
    expect(JSON.parse(first)).toMatchObject({ v: 1, alg: "A256GCM" });
    expect(decryptPinterestCredentials(first, key)).toEqual(credentials);
  });

  it("fails closed for malformed, tampered, or wrongly keyed ciphertext", () => {
    const encrypted = encryptPinterestCredentials({ accessToken: "a", refreshToken: "r" }, key);
    expect(() => decryptPinterestCredentials(encrypted.replace(/.$/, "x"), key)).toThrow("could not be decrypted");
    expect(() => decryptPinterestCredentials(encrypted, randomBytes(32).toString("base64"))).toThrow("could not be decrypted");
    expect(() => encryptPinterestCredentials({ accessToken: "a", refreshToken: "r" }, "short")).toThrow("base64-encoded 32-byte key");
  });
});
