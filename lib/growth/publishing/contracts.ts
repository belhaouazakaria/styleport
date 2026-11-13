import { z } from "zod";
import { PIN_DESTINATION_DOMAINS } from "@/lib/growth/publishing/destinations";

export const PIN_APPROVAL_POLICY_VERSION = "pin_approval_v1";
export const PUBLICATION_TIMING_VERSION = "publication_timing_v1";

export const approvePinSchema = z.object({
  candidateId: z.string().min(1).max(191),
  accountId: z.string().min(1).max(191),
  boardId: z.string().min(1).max(191),
  scheduledAt: z.string().datetime({ offset: true }),
  confirmation: z.literal(true),
  destinationDomain: z.enum(PIN_DESTINATION_DOMAINS).optional(),
}).strict();

export const rejectPinSchema = z.object({
  candidateId: z.string().min(1).max(191),
  reason: z.string().trim().min(1).max(500).optional(),
}).strict();

export const cancelPublicationSchema = z.object({ publicationId: z.string().min(1).max(191) }).strict();
export const publicationJobPayloadSchema = z.object({ publicationId: z.string().min(1).max(191) }).strict();

export type ApprovedPinSnapshot = {
  candidateId: string;
  candidateRevision: number;
  contentHash: string;
  assetChecksum: string;
  rendererKey: string;
  rendererVersion: string;
  templateId: string;
  title: string;
  description: string;
  destinationPath: string;
  destinationUrl: string;
  assetPublicUrl: string;
  accountId: string;
  boardId: string;
  scheduledAt: string;
  approvalPolicyVersion: string;
};
