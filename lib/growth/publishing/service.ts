import { randomUUID } from "node:crypto";
import {
  GrowthActivityActorKind,
  GrowthAssetState,
  GrowthJobStatus,
  GrowthJobType,
  GrowthPinApprovalStatus,
  GrowthPinCandidateStatus,
  GrowthPinterestConnectionStatus,
  GrowthPublicationStatus,
  GrowthPublicationTimingMode,
  Prisma,
} from "@prisma/client";

import { recordGrowthActivity } from "@/lib/growth/activity";
import { generateAttributionPublicRef } from "@/lib/growth/attribution/refs";
import { buildAttributionUrl, normalizeAttributionDestinationPath } from "@/lib/growth/attribution/urls";
import { NonRetryableGrowthJobError, RetryableGrowthJobError } from "@/lib/growth/errors";
import { createPinterestPin, getPinterestPinsPage, PinterestCreateAmbiguousError, PinterestRateLimitError } from "@/lib/growth/pinterest/api";
import { requirePinterestConfiguration } from "@/lib/growth/pinterest/config";
import { isOwnedPinterestDestination } from "@/lib/growth/pinterest/relevance";
import { prisma } from "@/lib/prisma";
import { approvePinSchema, PIN_APPROVAL_POLICY_VERSION, PUBLICATION_TIMING_VERSION, rejectPinSchema, type ApprovedPinSnapshot } from "@/lib/growth/publishing/contracts";
import { buildPublicCreativeAssetUrl, pinApprovalSnapshotChecksum, pinterestPublicationUrlsMatch } from "@/lib/growth/publishing/snapshot";
import { planPublicationTiming } from "@/lib/growth/publishing/timing";

function bounded(value: string | null | undefined, max: number) { return value?.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max) || null; }
function rateFields(rateLimit: { limit: string | null; remaining: string | null; reset: string | null }) {
  return { lastRateLimitLimit: bounded(rateLimit.limit, 64), lastRateLimitRemaining: bounded(rateLimit.remaining, 64), lastRateLimitReset: bounded(rateLimit.reset, 128) };
}

export async function recommendPublicationTiming(accountId: string, stableKey: string, now = new Date()) {
  const [pins, collisions] = await Promise.all([
    prisma.growthPinterestPin.findMany({ where: { accountId, publishedAt: { gte: new Date(now.getTime() - 90 * 86_400_000) } }, select: { publishedAt: true, summaryImpressions: true, summaryOutboundClicks: true, summarySaves: true }, orderBy: { publishedAt: "desc" }, take: 500 }),
    prisma.growthPinPublication.findMany({ where: { accountId, status: { notIn: [GrowthPublicationStatus.CANCELLED, GrowthPublicationStatus.FAILED_TERMINAL] }, scheduledAt: { gte: new Date(now.getTime() - 90 * 60_000) } }, select: { scheduledAt: true }, orderBy: { scheduledAt: "asc" }, take: 100 }),
  ]);
  return planPublicationTiming({ stableKey, now, history: pins.map((pin) => ({ publishedAt: pin.publishedAt, impressions: pin.summaryImpressions, outboundClicks: pin.summaryOutboundClicks, saves: pin.summarySaves })), collisions });
}

async function readApprovalCandidate(tx: Prisma.TransactionClient, candidateId: string) {
  return tx.growthPinCandidate.findFirst({ where: { id: candidateId, status: GrowthPinCandidateStatus.READY }, include: { asset: true } });
}

export async function approvePinCandidate(raw: unknown, adminUserId: string, now = new Date()) {
  const input = approvePinSchema.parse(raw);
  const requestedAt = new Date(input.scheduledAt);
  if (requestedAt < new Date(now.getTime() - 60_000) || requestedAt > new Date(now.getTime() + 366 * 86_400_000)) throw new Error("Scheduled time is outside the allowed window.");
  const recommendation = await recommendPublicationTiming(input.accountId, input.candidateId, now);
  const timingMode = Math.abs(recommendation.scheduledAt.getTime() - requestedAt.getTime()) < 1000 ? recommendation.mode : GrowthPublicationTimingMode.ADMIN_OVERRIDE;
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${`pin-approval:${input.candidateId}`}))`);
    const candidate = await readApprovalCandidate(tx, input.candidateId);
    if (!candidate) throw new Error("Only a READY creative candidate can be approved.");
    if (candidate.asset.state !== GrowthAssetState.READY || candidate.asset.mimeType !== "image/png" || candidate.asset.width !== 1000 || candidate.asset.height !== 1500) throw new Error("Creative asset is not publishable.");
    const account = await tx.growthPinterestAccount.findFirst({ where: { id: input.accountId, connectionStatus: GrowthPinterestConnectionStatus.CONNECTED }, select: { id: true, publicationRole: true, apiEnvironment: true, grantedScopes: true, encryptedCredentials: true, refreshTokenExpiresAt: true } });
    const config = requirePinterestConfiguration();
    if (!account || account.apiEnvironment !== config.apiEnvironment || !account.grantedScopes.includes("pins:write") || !account.encryptedCredentials || (account.refreshTokenExpiresAt && account.refreshTokenExpiresAt <= now)) throw new Error("Pinterest account is not eligible for publishing.");
    const board = await tx.growthPinterestBoard.findFirst({ where: { id: input.boardId, accountId: account.id, isActive: true }, select: { id: true } });
    if (!board) throw new Error("Pinterest board is inactive or does not belong to the selected account.");
    const existing = await tx.growthPinApproval.findFirst({ where: { candidateId: candidate.id, status: GrowthPinApprovalStatus.APPROVED }, include: { publication: true }, orderBy: { createdAt: "desc" } });
    if (existing && existing.accountId === account.id && existing.boardId === board.id && existing.scheduledAt?.getTime() === requestedAt.getTime()) return { approval: existing, publication: existing.publication, created: false };
    if (existing?.publication && existing.publication.status !== GrowthPublicationStatus.CANCELLED && existing.publication.status !== GrowthPublicationStatus.FAILED_TERMINAL) throw new Error("This candidate already has an active approved publication.");

    const approvalId = randomUUID();
    const publicationId = randomUUID();
    const publicRef = generateAttributionPublicRef();
    const destinationPath = normalizeAttributionDestinationPath(candidate.destinationPath);
    const attribution = await tx.growthAttributionRef.create({ data: { publicRef, destinationPath, campaignKey: account.publicationRole.toLowerCase(), contentKey: publicationId.replaceAll("-", ""), modelVersion: "pinterest_organic_v1" } });
    const destinationUrl = buildAttributionUrl(attribution);
    const snapshot: ApprovedPinSnapshot = { candidateId: candidate.id, candidateRevision: candidate.revision, contentHash: candidate.contentHash, assetChecksum: candidate.asset.checksum, rendererKey: candidate.rendererKey, rendererVersion: candidate.rendererVersion, templateId: candidate.templateId, title: candidate.title, description: candidate.description, destinationPath, destinationUrl, assetPublicUrl: buildPublicCreativeAssetUrl(candidate.asset.publicPath), accountId: account.id, boardId: board.id, scheduledAt: requestedAt.toISOString(), approvalPolicyVersion: PIN_APPROVAL_POLICY_VERSION };
    const snapshotChecksum = pinApprovalSnapshotChecksum(snapshot);
    if (existing) await tx.growthPinApproval.update({ where: { id: existing.id }, data: { status: GrowthPinApprovalStatus.SUPERSEDED } });
    const approval = await tx.growthPinApproval.create({ data: { id: approvalId, candidateId: candidate.id, candidateRevision: candidate.revision, status: GrowthPinApprovalStatus.APPROVED, approvedById: adminUserId, reviewedAt: now, accountId: account.id, boardId: board.id, scheduledAt: requestedAt, snapshotChecksum, snapshot: snapshot as unknown as Prisma.InputJsonValue, approvalPolicyVersion: PIN_APPROVAL_POLICY_VERSION } });
    const publication = await tx.growthPinPublication.create({ data: { id: publicationId, candidateId: candidate.id, approvalId: approval.id, accountId: account.id, boardId: board.id, attributionRefId: attribution.id, idempotencyKey: `pinterest-publish:${publicationId}`, scheduledAt: requestedAt, timingModelVersion: PUBLICATION_TIMING_VERSION, timingMode, timingEvidence: { ...recommendation.evidence, recommendedAt: recommendation.scheduledAt.toISOString(), adminScheduledAt: requestedAt.toISOString() } } });
    const job = await tx.growthJob.create({ data: { type: GrowthJobType.PINTEREST_PIN_PUBLISH, idempotencyKey: `pinterest-publish:${publicationId}`, payload: { publicationId }, runAfter: requestedAt, maxAttempts: 3 } });
    await tx.growthPinPublication.update({ where: { id: publication.id }, data: { publishJobId: job.id } });
    await recordGrowthActivity({ actorKind: GrowthActivityActorKind.USER, actorUserId: adminUserId, entityType: "GrowthPinApproval", entityId: approval.id, action: "PIN_APPROVED", toState: GrowthPinApprovalStatus.APPROVED, summary: { candidateId: candidate.id, accountId: account.id, boardId: board.id, scheduledAt: requestedAt.toISOString(), snapshotChecksum, timingMode }, correlationKey: publication.idempotencyKey }, tx);
    return { approval, publication: { ...publication, publishJobId: job.id }, created: true };
  });
}

export async function rejectPinCandidate(raw: unknown, adminUserId: string, now = new Date()) {
  const input = rejectPinSchema.parse(raw);
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${`pin-approval:${input.candidateId}`}))`);
    const candidate = await readApprovalCandidate(tx, input.candidateId);
    if (!candidate) throw new Error("Only a READY creative candidate can be rejected.");
    const active = await tx.growthPinApproval.findFirst({ where: { candidateId: candidate.id, status: GrowthPinApprovalStatus.APPROVED }, include: { publication: true }, orderBy: { createdAt: "desc" } });
    if (active && (!active.publication || (active.publication.status !== GrowthPublicationStatus.CANCELLED && active.publication.status !== GrowthPublicationStatus.FAILED_TERMINAL))) throw new Error("An approved publication must be cancelled or terminal before recording rejection.");
    if (active) await tx.growthPinApproval.update({ where: { id: active.id }, data: { status: GrowthPinApprovalStatus.SUPERSEDED } });
    const snapshot = { candidateId: candidate.id, candidateRevision: candidate.revision, contentHash: candidate.contentHash, assetChecksum: candidate.asset.checksum, action: "REJECTED", approvalPolicyVersion: PIN_APPROVAL_POLICY_VERSION };
    const approval = await tx.growthPinApproval.create({ data: { candidateId: candidate.id, candidateRevision: candidate.revision, status: GrowthPinApprovalStatus.REJECTED, approvedById: adminUserId, reviewedAt: now, snapshotChecksum: pinApprovalSnapshotChecksum(snapshot), snapshot, approvalPolicyVersion: PIN_APPROVAL_POLICY_VERSION, notes: input.reason } });
    const changed = await tx.growthPinCandidate.updateMany({ where: { id: candidate.id, status: GrowthPinCandidateStatus.READY }, data: { status: GrowthPinCandidateStatus.REJECTED } });
    if (changed.count !== 1) throw new Error("Creative candidate state changed before rejection completed.");
    await recordGrowthActivity({ actorKind: GrowthActivityActorKind.USER, actorUserId: adminUserId, entityType: "GrowthPinCandidate", entityId: candidate.id, action: "PIN_CANDIDATE_REJECTED", fromState: GrowthPinCandidateStatus.READY, toState: GrowthPinCandidateStatus.REJECTED, summary: { approvalId: approval.id } }, tx);
    await recordGrowthActivity({ actorKind: GrowthActivityActorKind.USER, actorUserId: adminUserId, entityType: "GrowthPinApproval", entityId: approval.id, action: "PIN_REJECTED", toState: GrowthPinApprovalStatus.REJECTED, summary: { candidateId: candidate.id, reason: input.reason || null } }, tx);
    return approval;
  });
}

async function enqueueReconcile(tx: Prisma.TransactionClient, publicationId: string, now = new Date()) {
  const key = `pinterest-reconcile:${publicationId}`;
  const job = await tx.growthJob.upsert({ where: { idempotencyKey: key }, update: {}, create: { type: GrowthJobType.PINTEREST_PIN_RECONCILE, idempotencyKey: key, payload: { publicationId }, runAfter: now, maxAttempts: 4 } });
  await tx.growthPinPublication.update({ where: { id: publicationId }, data: { reconcileJobId: job.id, status: GrowthPublicationStatus.RECONCILING, reconciliationStartedAt: now } });
  return job;
}

export async function markPublicationAmbiguous(publicationId: string, code: string, summary: string, rateLimit?: { limit: string | null; remaining: string | null; reset: string | null }) {
  return prisma.$transaction(async (tx) => {
    const publication = await tx.growthPinPublication.findUnique({ where: { id: publicationId } });
    if (!publication || publication.status !== GrowthPublicationStatus.PUBLISHING) return null;
    await tx.growthPinPublication.update({ where: { id: publication.id }, data: { lastErrorCode: code, lastErrorSummary: bounded(summary, 500), ...(rateLimit ? rateFields(rateLimit) : {}) } });
    const job = await enqueueReconcile(tx, publication.id);
    await recordGrowthActivity({ actorKind: GrowthActivityActorKind.SYSTEM, entityType: "GrowthPinPublication", entityId: publication.id, action: "PIN_CREATE_OUTCOME_AMBIGUOUS", fromState: GrowthPublicationStatus.PUBLISHING, toState: GrowthPublicationStatus.RECONCILING, summary: { code, reconcileJobId: job.id }, correlationKey: publication.idempotencyKey }, tx);
    return job;
  });
}

function parseSnapshot(value: Prisma.JsonValue): ApprovedPinSnapshot {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new NonRetryableGrowthJobError("Approved Pin snapshot is invalid.");
  return value as unknown as ApprovedPinSnapshot;
}

class PinterestPinAccountMismatchError extends Error {}

async function persistOwnedPinterestPin(tx: Prisma.TransactionClient, input: {
  pinterestPinId: string;
  accountId: string;
  boardId: string;
  pinterestBoardId: string;
  snapshot: ApprovedPinSnapshot;
  publishedAt: Date;
  ownedDomains: string[];
}) {
  const existing = await tx.growthPinterestPin.findUnique({ where: { pinterestPinId: input.pinterestPinId }, select: { id: true, accountId: true } });
  if (existing && existing.accountId !== input.accountId) throw new PinterestPinAccountMismatchError("Pinterest Pin belongs to another connected account.");
  const now = new Date();
  const data = {
    boardId: input.boardId,
    pinterestBoardId: input.pinterestBoardId,
    title: input.snapshot.title,
    description: input.snapshot.description,
    destinationUrl: input.snapshot.destinationUrl,
    publishedAt: input.publishedAt,
    isActive: true,
    analyticsEligible: isOwnedPinterestDestination(input.snapshot.destinationUrl, input.ownedDomains),
    lastSeenAt: now,
    lastSyncedAt: now,
  };
  if (existing) return tx.growthPinterestPin.update({ where: { id: existing.id }, data });
  return tx.growthPinterestPin.create({ data: { pinterestPinId: input.pinterestPinId, accountId: input.accountId, ...data } });
}

export async function publishApprovedPin(publicationId: string, fetchImpl?: typeof fetch) {
  let publication;
  try {
    publication = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw(Prisma.sql`SELECT "id" FROM "GrowthPinPublication" WHERE "id" = ${publicationId} FOR UPDATE`);
      const row = await tx.growthPinPublication.findUnique({ where: { id: publicationId }, include: { approval: true, candidate: { include: { asset: true } }, account: true, board: true, attributionRef: true } });
      if (!row) throw new NonRetryableGrowthJobError("Pin publication is unavailable.");
      if (row.status === GrowthPublicationStatus.PUBLISHED || row.status === GrowthPublicationStatus.RECONCILED || row.status === GrowthPublicationStatus.RECONCILING) return row;
      if (row.status !== GrowthPublicationStatus.SCHEDULED && row.status !== GrowthPublicationStatus.FAILED_RETRYABLE) throw new NonRetryableGrowthJobError("Pin publication is not eligible to publish.");
      if (row.scheduledAt > new Date()) throw new RetryableGrowthJobError("Pin publication is not due yet.", row.scheduledAt.getTime() - Date.now());
      const settings = await tx.growthSettings.findUnique({ where: { id: "global" }, select: { enabled: true } });
      if (!settings?.enabled) throw new NonRetryableGrowthJobError("Growth is disabled before Pinterest publishing.");
      const config = requirePinterestConfiguration();
      if (row.approval.status !== GrowthPinApprovalStatus.APPROVED || row.approval.candidateRevision !== row.candidate.revision || row.candidate.status !== GrowthPinCandidateStatus.READY || row.candidate.asset.state !== GrowthAssetState.READY || row.candidate.asset.mimeType !== "image/png" || row.candidate.asset.width !== 1000 || row.candidate.asset.height !== 1500 || row.account.connectionStatus !== GrowthPinterestConnectionStatus.CONNECTED || row.account.apiEnvironment !== config.apiEnvironment || !row.account.grantedScopes.includes("pins:write") || !row.account.encryptedCredentials || !row.board.isActive || row.board.accountId !== row.accountId || !row.attributionRef) throw new NonRetryableGrowthJobError("Approved Pin authorization is no longer valid.");
      const snapshot = parseSnapshot(row.approval.snapshot);
      const rebuilt: ApprovedPinSnapshot = { candidateId: row.candidate.id, candidateRevision: row.candidate.revision, contentHash: row.candidate.contentHash, assetChecksum: row.candidate.asset.checksum, rendererKey: row.candidate.rendererKey, rendererVersion: row.candidate.rendererVersion, templateId: row.candidate.templateId, title: row.candidate.title, description: row.candidate.description, destinationPath: normalizeAttributionDestinationPath(row.candidate.destinationPath), destinationUrl: buildAttributionUrl(row.attributionRef), assetPublicUrl: buildPublicCreativeAssetUrl(row.candidate.asset.publicPath), accountId: row.accountId, boardId: row.boardId, scheduledAt: row.scheduledAt.toISOString(), approvalPolicyVersion: row.approval.approvalPolicyVersion };
      if (pinApprovalSnapshotChecksum(rebuilt) !== row.approval.snapshotChecksum || pinApprovalSnapshotChecksum(snapshot) !== row.approval.snapshotChecksum) throw new NonRetryableGrowthJobError("Approved Pin snapshot changed; a new approval is required.");
      await tx.growthPinPublication.update({ where: { id: row.id }, data: { status: GrowthPublicationStatus.PUBLISHING, attemptCount: { increment: 1 }, lastAttemptAt: new Date(), lastErrorCode: null, lastErrorSummary: null } });
      return { ...row, status: GrowthPublicationStatus.PUBLISHING, approval: { ...row.approval, snapshot: rebuilt } };
    });
  } catch (error) {
    if (error instanceof NonRetryableGrowthJobError) {
      await prisma.growthPinPublication.updateMany({
        where: { id: publicationId, status: { in: [GrowthPublicationStatus.SCHEDULED, GrowthPublicationStatus.FAILED_RETRYABLE] } },
        data: { status: GrowthPublicationStatus.FAILED_TERMINAL, lastErrorCode: "PUBLICATION_REVALIDATION_FAILED", lastErrorSummary: bounded(error.message, 500) },
      });
    }
    throw error;
  }
  if (publication.status !== GrowthPublicationStatus.PUBLISHING) return { publication, reused: true };
  const snapshot = parseSnapshot(publication.approval.snapshot);
  let created;
  try {
    created = await createPinterestPin({ accountId: publication.accountId, boardId: publication.board.pinterestBoardId, title: snapshot.title, description: snapshot.description, link: snapshot.destinationUrl, imageUrl: snapshot.assetPublicUrl, fetchImpl });
  } catch (error) {
    if (error instanceof PinterestCreateAmbiguousError) {
      await markPublicationAmbiguous(publication.id, "CREATE_OUTCOME_AMBIGUOUS", error.message, error.rateLimit);
      return { publication: await prisma.growthPinPublication.findUniqueOrThrow({ where: { id: publication.id } }), reused: false };
    }
    if (error instanceof RetryableGrowthJobError) await prisma.growthPinPublication.update({ where: { id: publication.id }, data: { status: GrowthPublicationStatus.FAILED_RETRYABLE, lastErrorCode: "PINTEREST_RATE_LIMIT", lastErrorSummary: bounded(error.message, 500), ...(error instanceof PinterestRateLimitError ? rateFields(error.rateLimit) : {}) } });
    else await prisma.growthPinPublication.update({ where: { id: publication.id }, data: { status: GrowthPublicationStatus.FAILED_TERMINAL, lastErrorCode: "PINTEREST_CREATE_REJECTED", lastErrorSummary: bounded(error instanceof Error ? error.message : "Pinterest Create Pin failed.", 500) } });
    throw error;
  }
  const publishedAt = created.data.created_at && !Number.isNaN(Date.parse(created.data.created_at)) ? new Date(created.data.created_at) : new Date();
  try {
    const result = await prisma.$transaction(async (tx) => {
      const settings = await tx.growthSettings.findUniqueOrThrow({ where: { id: "global" }, select: { ownedDomains: true } });
      const pin = await persistOwnedPinterestPin(tx, { pinterestPinId: created.data.id, accountId: publication.accountId, boardId: publication.boardId, pinterestBoardId: publication.board.pinterestBoardId, snapshot, publishedAt, ownedDomains: settings.ownedDomains });
      await tx.growthAttributionRef.update({ where: { id: publication.attributionRefId! }, data: { pinId: pin.id } });
      await tx.growthPinPublication.update({ where: { id: publication.id }, data: { pinterestPinId: pin.pinterestPinId, status: GrowthPublicationStatus.PUBLISHED, publishedAt, ...rateFields(created.rateLimit) } });
      await recordGrowthActivity({ actorKind: GrowthActivityActorKind.WORKER, entityType: "GrowthPinPublication", entityId: publication.id, action: "PIN_PUBLISHED", fromState: GrowthPublicationStatus.PUBLISHING, toState: GrowthPublicationStatus.PUBLISHED, summary: { pinterestPinId: pin.pinterestPinId }, correlationKey: publication.idempotencyKey }, tx);
      const reconciledAt = new Date();
      const final = await tx.growthPinPublication.update({ where: { id: publication.id }, data: { status: GrowthPublicationStatus.RECONCILED, reconciledAt } });
      await recordGrowthActivity({ actorKind: GrowthActivityActorKind.WORKER, entityType: "GrowthPinPublication", entityId: publication.id, action: "PIN_RECONCILED", fromState: GrowthPublicationStatus.PUBLISHED, toState: GrowthPublicationStatus.RECONCILED, summary: { pinterestPinId: pin.pinterestPinId, directCreate: true }, correlationKey: publication.idempotencyKey }, tx);
      return final;
    });
    return { publication: result, reused: false };
  } catch (error) {
    await markPublicationAmbiguous(publication.id, "POST_CREATE_PERSISTENCE_UNCERTAIN", "Pinterest confirmed Pin creation, but local persistence did not complete.", created.rateLimit);
    return { publication: await prisma.growthPinPublication.findUniqueOrThrow({ where: { id: publication.id } }), reused: false };
  }
}

async function persistReconciledMatch(publicationId: string, pinterestPinId: string, publishedAt: Date | null) {
  try {
    return await prisma.$transaction(async (tx) => {
      const publication = await tx.growthPinPublication.findUniqueOrThrow({ where: { id: publicationId }, include: { approval: true, board: true, attributionRef: true } });
      const snapshot = parseSnapshot(publication.approval.snapshot);
      const settings = await tx.growthSettings.findUniqueOrThrow({ where: { id: "global" }, select: { ownedDomains: true } });
      const now = new Date();
      const pin = await persistOwnedPinterestPin(tx, { pinterestPinId, accountId: publication.accountId, boardId: publication.boardId, pinterestBoardId: publication.board.pinterestBoardId, snapshot, publishedAt: publishedAt || now, ownedDomains: settings.ownedDomains });
      await tx.growthAttributionRef.update({ where: { id: publication.attributionRefId! }, data: { pinId: pin.id } });
      const final = await tx.growthPinPublication.update({ where: { id: publication.id }, data: { pinterestPinId, publishedAt: publishedAt || now, status: GrowthPublicationStatus.RECONCILED, reconciledAt: now, lastErrorCode: null, lastErrorSummary: null } });
      await recordGrowthActivity({ actorKind: GrowthActivityActorKind.WORKER, entityType: "GrowthPinPublication", entityId: publication.id, action: "PIN_RECONCILED", fromState: GrowthPublicationStatus.RECONCILING, toState: GrowthPublicationStatus.RECONCILED, summary: { pinterestPinId, directCreate: false }, correlationKey: publication.idempotencyKey }, tx);
      return final;
    });
  } catch (error) {
    if (!(error instanceof PinterestPinAccountMismatchError)) throw error;
    return prisma.$transaction(async (tx) => {
      const current = await tx.growthPinPublication.findUniqueOrThrow({ where: { id: publicationId } });
      const final = await tx.growthPinPublication.update({ where: { id: publicationId }, data: { status: GrowthPublicationStatus.FAILED_TERMINAL, lastErrorCode: "PINTEREST_PIN_ACCOUNT_MISMATCH", lastErrorSummary: "The matched Pinterest Pin belongs to another connected account." } });
      await recordGrowthActivity({ actorKind: GrowthActivityActorKind.WORKER, entityType: "GrowthPinPublication", entityId: publicationId, action: "PIN_RECONCILIATION_FAILED", fromState: current.status, toState: GrowthPublicationStatus.FAILED_TERMINAL, summary: { code: "PINTEREST_PIN_ACCOUNT_MISMATCH" }, correlationKey: current.idempotencyKey }, tx);
      return final;
    });
  }
}

export async function reconcilePinterestPublication(publicationId: string, attemptCount: number, fetchImpl?: typeof fetch) {
  const publication = await prisma.growthPinPublication.findUnique({ where: { id: publicationId }, include: { approval: true, board: true } });
  if (!publication) throw new NonRetryableGrowthJobError("Pin publication is unavailable.");
  if (publication.status === GrowthPublicationStatus.RECONCILED) return { publication, reused: true };
  if (publication.status !== GrowthPublicationStatus.RECONCILING) throw new NonRetryableGrowthJobError("Pin publication is not awaiting reconciliation.");
  const snapshot = parseSnapshot(publication.approval.snapshot);
  const matches: Array<{ id: string; created_at?: string | null }> = [];
  const seen = new Set<string>();
  let bookmark: string | undefined;
  try {
    for (let page = 0; page < 4; page += 1) {
      const response = await getPinterestPinsPage(publication.accountId, bookmark, fetchImpl, "saytwist.com");
      for (const pin of response.data.items) if (pin.link && pinterestPublicationUrlsMatch(pin.link, snapshot.destinationUrl) && (!pin.board_id || pin.board_id === publication.board.pinterestBoardId)) matches.push(pin);
      const next = response.data.bookmark || undefined;
      if (!next || seen.has(next)) break;
      seen.add(next); bookmark = next;
    }
  } catch (error) {
    if (error instanceof NonRetryableGrowthJobError) {
      await prisma.growthPinPublication.updateMany({
        where: { id: publication.id, status: GrowthPublicationStatus.RECONCILING },
        data: { status: GrowthPublicationStatus.FAILED_TERMINAL, lastErrorCode: "RECONCILIATION_READ_REJECTED", lastErrorSummary: bounded(error.message, 500) },
      });
    }
    throw error;
  }
  const unique = [...new Map(matches.map((pin) => [pin.id, pin])).values()];
  if (unique.length === 1) return { publication: await persistReconciledMatch(publication.id, unique[0].id, unique[0].created_at && !Number.isNaN(Date.parse(unique[0].created_at)) ? new Date(unique[0].created_at) : null), reused: false };
  if (unique.length > 1) {
    const failed = await prisma.growthPinPublication.update({ where: { id: publication.id }, data: { status: GrowthPublicationStatus.FAILED_TERMINAL, lastErrorCode: "DUPLICATE_PIN_DETECTED", lastErrorSummary: "More than one Pinterest Pin matched the approved publication URL." } });
    return { publication: failed, reused: false };
  }
  if (attemptCount >= 4) {
    const failed = await prisma.growthPinPublication.update({ where: { id: publication.id }, data: { status: GrowthPublicationStatus.FAILED_TERMINAL, lastErrorCode: "RECONCILIATION_UNRESOLVED", lastErrorSummary: "No exact Pinterest Pin match was found within the bounded reconciliation budget." } });
    return { publication: failed, reused: false };
  }
  throw new RetryableGrowthJobError("Pinterest publication is not visible for reconciliation yet.", Math.min(30 * 60_000, 60_000 * 2 ** Math.max(0, attemptCount - 1)));
}
