
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { z } from "zod";

import { requirePinterestConfiguration } from "@/lib/growth/pinterest/config";

const AAD = Buffer.from("saytwist:growth:pinterest-credentials:v1", "utf8");
const credentialSchema = z.object({ accessToken: z.string().min(1), refreshToken: z.string().min(1) }).strict();
const envelopeSchema = z.object({
  v: z.literal(1),
  alg: z.literal("A256GCM"),
  iv: z.string().min(1),
  tag: z.string().min(1),
  ciphertext: z.string().min(1),
}).strict();

export type PinterestCredentials = z.infer<typeof credentialSchema>;

function decodeKey(encoded: string) {
  const key = Buffer.from(encoded, "base64");
  if (key.length !== 32 || key.toString("base64").replace(/=+$/, "") !== encoded.trim().replace(/=+$/, "")) {
    throw new Error("GROWTH_CREDENTIAL_ENCRYPTION_KEY must be a base64-encoded 32-byte key.");
  }
  return key;
}

export function encryptPinterestCredentials(credentials: PinterestCredentials, encodedKey?: string) {
  const parsed = credentialSchema.parse(credentials);
  const key = decodeKey(encodedKey || requirePinterestConfiguration().encryptionKey);
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(AAD);
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(parsed), "utf8"), cipher.final()]);
  return JSON.stringify({
    v: 1,
    alg: "A256GCM",
    iv: iv.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
    ciphertext: ciphertext.toString("base64"),
  });
}

export function decryptPinterestCredentials(encrypted: string, encodedKey?: string): PinterestCredentials {
  try {
    const envelope = envelopeSchema.parse(JSON.parse(encrypted));
    const key = decodeKey(encodedKey || requirePinterestConfiguration().encryptionKey);
    const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(envelope.iv, "base64"));
    decipher.setAAD(AAD);
    decipher.setAuthTag(Buffer.from(envelope.tag, "base64"));
    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(envelope.ciphertext, "base64")),
      decipher.final(),
    ]).toString("utf8");
    return credentialSchema.parse(JSON.parse(plaintext));
  } catch {
    throw new Error("Pinterest credentials could not be decrypted.");
  }
}
