import { createHash } from "node:crypto";
import { z } from "zod";

export const pinReviewSnapshotSchema = z
  .object({
    title: z.string().min(1).max(100),
    description: z.string().min(1).max(1000),
    assetUrl: z.url(),
    assetChecksum: z.string().regex(/^[a-f0-9]{64}$/),
    contentHash: z.string().max(64),
    revision: z.number().int().positive(),
    destinationUrl: z.url(),
    accountId: z.string().min(1).max(191),
    accountName: z.string().min(1).max(191),
    boardId: z.string().min(1).max(191),
    boardName: z.string().min(1).max(191),
    scheduledAt: z.iso.datetime(),
    destinationDomain: z
      .enum(["saytwist.com", "translator.whattypeof.com"])
      .optional(),
    reason: z.string().min(1).max(1000),
    risks: z.string().min(1).max(1000),
    estimatedCostCents: z.number().int().nonnegative(),
  })
  .strict();
export type PinReviewSnapshot = z.infer<typeof pinReviewSnapshotSchema>;

// Canonical keys avoid JSONB key ordering changing the evidence checksum.
export function evidenceChecksum(value: unknown): string {
  const canonical = (v: unknown): unknown =>
    Array.isArray(v)
      ? v.map(canonical)
      : v && typeof v === "object"
        ? Object.fromEntries(
            Object.entries(v)
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([k, x]) => [k, canonical(x)]),
          )
        : v;
  return createHash("sha256")
    .update(JSON.stringify(canonical(value)))
    .digest("hex");
}
export const reviewDecisionSchema = z
  .object({
    requestId: z.string().min(1).max(191),
    action: z.enum(["APPROVE", "REJECT"]),
    snapshotChecksum: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strict();

export const budgetChangeSchema = z
  .object({
    action: z.literal("CHANGE_AI_BUDGET"),
    configVersion: z.number().int().nonnegative(),
    before: z
      .object({
        dailyCents: z.number().int().nonnegative(),
        monthlyCents: z.number().int().nonnegative(),
        imagesPerDay: z.number().int().nonnegative(),
      })
      .strict(),
    after: z
      .object({
        dailyCents: z.number().int().min(0).max(100000),
        monthlyCents: z.number().int().min(0).max(3000000),
        imagesPerDay: z.number().int().min(0).max(100),
      })
      .strict(),
    reason: z.string().min(1).max(1000),
    benefits: z.string().min(1).max(1000),
    risks: z.string().min(1).max(1000),
  })
  .strict();
