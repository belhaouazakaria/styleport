import { GrowthAssetGenerationKind, GrowthAssetState, GrowthCreativeArchetype, GrowthCreativeDestinationKind, GrowthCreativeSimilarityClassification, GrowthJobStatus, GrowthJobType, GrowthPinCandidateStatus, GrowthPinterestApiEnvironment, GrowthPinterestConnectionStatus, GrowthPinterestPublicationRole, Prisma } from "@prisma/client";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { approvePinCandidate, publishApprovedPin, reconcilePinterestPublication, rejectPinCandidate } from "@/lib/growth/publishing/service";
import { encryptPinterestCredentials } from "@/lib/growth/pinterest/credentials";
import { claimGrowthJobs, failGrowthJob, recoverStaleGrowthJobs } from "@/lib/growth/jobs";
import { prisma } from "@/lib/prisma";

const enabled = process.env.RUN_GROWTH_PUBLISHING_DB_TESTS === "1";
const suite = enabled ? describe.sequential : describe.skip;
if (enabled) {
  const url = process.env.GROWTH_PUBLISHING_TEST_DATABASE_URL;
  if (!url || url !== process.env.DATABASE_URL) throw new Error("Phase 11 DB tests require matching explicit URLs.");
  const parsed = new URL(url);
  if (!["localhost", "127.0.0.1", "::1"].includes(parsed.hostname) || decodeURIComponent(parsed.pathname.slice(1)) !== "saytwist_growth_phase11_publishing_test") throw new Error("Unsafe Phase 11 test database.");
  process.env.APP_BASE_URL = "https://saytwist.com";
  process.env.PINTEREST_APP_ID = "test-app"; process.env.PINTEREST_APP_SECRET = "test-secret"; process.env.PINTEREST_REDIRECT_URI = "https://saytwist.com/api/admin/growth/pinterest/oauth/callback"; process.env.PINTEREST_API_ENVIRONMENT = "sandbox"; process.env.GROWTH_CREDENTIAL_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
}
async function clean() {
  await prisma.growthPinPublication.deleteMany(); await prisma.growthPinApproval.deleteMany(); await prisma.growthAttributionRef.deleteMany(); await prisma.growthPinCandidate.deleteMany(); await prisma.growthAsset.deleteMany(); await prisma.growthPinterestPin.deleteMany(); await prisma.growthPinterestBoard.deleteMany(); await prisma.growthPinterestAccount.deleteMany(); await prisma.growthJob.deleteMany(); await prisma.growthActivity.deleteMany(); await prisma.growthSettings.deleteMany(); await prisma.translator.deleteMany(); await prisma.user.deleteMany();
}
async function fixture(status = GrowthPinCandidateStatus.READY) {
  const admin = await prisma.user.create({ data: { email: `admin-${Math.random()}@test.local`, passwordHash: "test", role: "ADMIN" } });
  const translator = await prisma.translator.create({ data: { name: "Warm Translator", slug: `warm-${Math.random().toString(36).slice(2)}`, title: "Warm Translator", subtitle: "Warm", shortDescription: "Warm rewrite", sourceLabel: "Before", targetLabel: "After", promptSystem: "Rewrite", promptInstructions: "Preserve meaning", isActive: true } });
  const account = await prisma.growthPinterestAccount.create({ data: { pinterestAccountId: `p-${Math.random()}`, publicationRole: GrowthPinterestPublicationRole.SAYTWIST, activeRole: GrowthPinterestPublicationRole.SAYTWIST, username: "saytwist", apiEnvironment: GrowthPinterestApiEnvironment.SANDBOX, connectionStatus: GrowthPinterestConnectionStatus.CONNECTED, grantedScopes: ["pins:read", "pins:write"], encryptedCredentials: encryptPinterestCredentials({ accessToken: "test-access", refreshToken: "test-refresh" }), accessTokenExpiresAt: new Date("2030-01-01"), refreshTokenExpiresAt: new Date("2030-02-01") } });
  const board = await prisma.growthPinterestBoard.create({ data: { accountId: account.id, pinterestBoardId: `board-${Math.random()}`, name: "SayTwist", isActive: true, lastSeenAt: new Date(), lastSyncedAt: new Date() } });
  const checksum = "a".repeat(64);
  const asset = await prisma.growthAsset.create({ data: { publicPath: `/generated/growth-creatives/creative-${checksum}.png`, checksum, mimeType: "image/png", width: 1000, height: 1500, byteSize: 1000, rendererKey: "creative-ai-full", rendererVersion: "creative_ai_full_v1", templateId: "before-after-full-ai-v1-editorial-split", generationKind: GrowthAssetGenerationKind.AI, state: GrowthAssetState.READY, aiProvider: "OPENAI", aiModel: "gpt-image-2", aiImageUnits: 1 } });
  const candidate = await prisma.growthPinCandidate.create({ data: { candidateKey: `candidate-${Math.random()}`, revision: 1, destinationKind: GrowthCreativeDestinationKind.TRANSLATOR, translatorId: translator.id, title: "Warm Translator", description: "See a warm transformation.", destinationPath: `/translators/${translator.slug}`, assetId: asset.id, rendererKey: "creative-ai-full", rendererVersion: "creative_ai_full_v1", templateId: "before-after-full-ai-v1-editorial-split", archetype: GrowthCreativeArchetype.BEFORE_AFTER, headlinePattern: "transformation-proof-v3", ctaPattern: "style-aware-transformation-cta", visualTreatment: "full-ai-editorial-split", topic: "Warm", contentHash: "b".repeat(64), similarityModelVersion: "creative_similarity_v2", similarityResult: GrowthCreativeSimilarityClassification.DISTINCT, similarityFlags: {}, status } });
  return { admin, account, board, candidate };
}
beforeEach(async () => { await clean(); await prisma.growthSettings.create({ data: { id: "global", enabled: true } }); }); afterAll(async () => { if (enabled) await clean(); await prisma.$disconnect(); });
suite("Phase 11 PostgreSQL publishing invariants", () => {
  it("converges concurrent exact double approval into one publication/ref/job", async () => {
    const f = await fixture(); const scheduledAt = new Date(Date.now() + 86_400_000).toISOString(); const input = { candidateId: f.candidate.id, accountId: f.account.id, boardId: f.board.id, scheduledAt, confirmation: true as const };
    const results = await Promise.all([approvePinCandidate(input, f.admin.id), approvePinCandidate(input, f.admin.id)]);
    expect(results.filter((result) => result.created)).toHaveLength(1);
    expect(await prisma.growthPinApproval.count()).toBe(1); expect(await prisma.growthPinPublication.count()).toBe(1); expect(await prisma.growthAttributionRef.count()).toBe(1); expect(await prisma.growthJob.count()).toBe(1);
    const snapshot = results[0].approval.snapshot as Record<string, string>;
    const url = new URL(snapshot.destinationUrl);
    expect(url.searchParams.get("utm_source")).toBe("pinterest");
    expect(url.searchParams.get("utm_medium")).toBe("organic");
    expect(url.searchParams.get("pin_ref")).toMatch(/^pa_/);
  });
  it("rejects DEFERRED approval and makes an explicitly rejected candidate permanently ineligible", async () => {
    const deferred = await fixture(GrowthPinCandidateStatus.DEFERRED);
    await expect(approvePinCandidate({ candidateId: deferred.candidate.id, accountId: deferred.account.id, boardId: deferred.board.id, scheduledAt: new Date(Date.now() + 86_400_000).toISOString(), confirmation: true }, deferred.admin.id)).rejects.toThrow("READY");
    await clean(); const ready = await fixture(); await rejectPinCandidate({ candidateId: ready.candidate.id, reason: "Not suitable" }, ready.admin.id);
    expect(await prisma.growthPinPublication.count()).toBe(0);
    expect(await prisma.growthPinCandidate.findUniqueOrThrow({ where: { id: ready.candidate.id } })).toMatchObject({ status: GrowthPinCandidateStatus.REJECTED });
    await expect(approvePinCandidate({ candidateId: ready.candidate.id, accountId: ready.account.id, boardId: ready.board.id, scheduledAt: new Date(Date.now() + 86_400_000).toISOString(), confirmation: true }, ready.admin.id)).rejects.toThrow("READY");
  });
  it("keeps an approved snapshot immutable and one publication per approval", async () => {
    const f = await fixture(); const result = await approvePinCandidate({ candidateId: f.candidate.id, accountId: f.account.id, boardId: f.board.id, scheduledAt: new Date(Date.now() + 86_400_000).toISOString(), confirmation: true }, f.admin.id);
    const otherAdmin = await prisma.user.create({ data: { email: "other-admin@test.local", passwordHash: "test", role: "ADMIN" } });
    await expect(prisma.growthPinApproval.update({ where: { id: result.approval.id }, data: { approvedById: otherAdmin.id } })).rejects.toThrow();
    await expect(prisma.growthPinApproval.update({ where: { id: result.approval.id }, data: { reviewedAt: new Date() } })).rejects.toThrow();
    await expect(prisma.growthPinApproval.update({ where: { id: result.approval.id }, data: { scheduledAt: new Date() } })).rejects.toThrow();
    await expect(prisma.growthPinApproval.update({ where: { id: result.approval.id }, data: { snapshot: { changed: true } } })).rejects.toThrow();
    await expect(prisma.growthPinApproval.update({ where: { id: result.approval.id }, data: { status: "SUPERSEDED" } })).resolves.toMatchObject({ status: "SUPERSEDED" });
    await expect(prisma.growthPinApproval.update({ where: { id: result.approval.id }, data: { approvedById: otherAdmin.id } })).rejects.toThrow();
    const publication = await prisma.growthPinPublication.findFirstOrThrow();
    await expect(prisma.growthPinPublication.create({ data: { candidateId: f.candidate.id, approvalId: result.approval.id, accountId: f.account.id, boardId: f.board.id, idempotencyKey: "duplicate", scheduledAt: publication.scheduledAt, timingModelVersion: "publication_timing_v1", timingMode: "COLD_START", timingEvidence: {} } })).rejects.toBeInstanceOf(Prisma.PrismaClientKnownRequestError);
  });
  it("fails closed for disconnected/scopeless accounts and inactive or foreign boards", async () => {
    const f = await fixture();
    const input = { candidateId: f.candidate.id, accountId: f.account.id, boardId: f.board.id, scheduledAt: new Date(Date.now() + 86_400_000).toISOString(), confirmation: true as const };
    await prisma.growthPinterestAccount.update({ where: { id: f.account.id }, data: { grantedScopes: ["pins:read"] } });
    await expect(approvePinCandidate(input, f.admin.id)).rejects.toThrow("not eligible");
    await prisma.growthPinterestAccount.update({ where: { id: f.account.id }, data: { grantedScopes: ["pins:read", "pins:write"] } });
    await prisma.growthPinterestBoard.update({ where: { id: f.board.id }, data: { isActive: false } });
    await expect(approvePinCandidate(input, f.admin.id)).rejects.toThrow("inactive");
    expect(await prisma.growthPinApproval.count()).toBe(0);
  });
  it("claims each due publish job once under concurrent workers", async () => {
    await prisma.growthJob.createMany({ data: Array.from({ length: 4 }, (_, index) => ({ type: GrowthJobType.PINTEREST_PIN_PUBLISH, idempotencyKey: `claim-${index}`, payload: { publicationId: `publication-${index}` } })) });
    const [left, right] = await Promise.all([
      claimGrowthJobs({ workerId: "worker-left", limit: 4 }),
      claimGrowthJobs({ workerId: "worker-right", limit: 4 }),
    ]);
    const ids = [...left, ...right].map((job) => job.id);
    expect(ids).toHaveLength(4);
    expect(new Set(ids).size).toBe(4);
  });
  it("blocks rejection for active publication but allows cancelled and terminal publication history", async () => {
    const scheduled = await fixture(); const scheduledAt = new Date(Date.now() + 86_400_000).toISOString();
    const active = await approvePinCandidate({ candidateId: scheduled.candidate.id, accountId: scheduled.account.id, boardId: scheduled.board.id, scheduledAt, confirmation: true }, scheduled.admin.id);
    await expect(rejectPinCandidate({ candidateId: scheduled.candidate.id }, scheduled.admin.id)).rejects.toThrow("cancelled or terminal");
    await prisma.growthPinPublication.update({ where: { id: active.publication!.id }, data: { status: "CANCELLED" } });
    await expect(rejectPinCandidate({ candidateId: scheduled.candidate.id }, scheduled.admin.id)).resolves.toMatchObject({ status: "REJECTED" });
    expect(await prisma.growthPinApproval.findUniqueOrThrow({ where: { id: active.approval.id } })).toMatchObject({ status: "SUPERSEDED" });

    await clean(); await prisma.growthSettings.create({ data: { id: "global", enabled: true } });
    const terminal = await fixture();
    const failed = await approvePinCandidate({ candidateId: terminal.candidate.id, accountId: terminal.account.id, boardId: terminal.board.id, scheduledAt, confirmation: true }, terminal.admin.id);
    await prisma.growthPinPublication.update({ where: { id: failed.publication!.id }, data: { status: "FAILED_TERMINAL" } });
    await expect(rejectPinCandidate({ candidateId: terminal.candidate.id }, terminal.admin.id)).resolves.toMatchObject({ status: "REJECTED" });
  });
  it("publishes once, persists inventory/ref, and makes repeat handling a no-op", async () => {
    const f = await fixture(); const past = new Date(Date.now() - 2 * 86_400_000); const scheduledAt = new Date(past.getTime() + 60_000).toISOString();
    const approved = await approvePinCandidate({ candidateId: f.candidate.id, accountId: f.account.id, boardId: f.board.id, scheduledAt, confirmation: true }, f.admin.id, past);
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: "published-pin", board_id: f.board.pinterestBoardId, created_at: new Date().toISOString() }), { status: 201 }));
    await publishApprovedPin(approved.publication!.id, fetchMock); await publishApprovedPin(approved.publication!.id, fetchMock);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const publication = await prisma.growthPinPublication.findUniqueOrThrow({ where: { id: approved.publication!.id } });
    expect(publication).toMatchObject({ status: "RECONCILED", pinterestPinId: "published-pin" });
    const pin = await prisma.growthPinterestPin.findUniqueOrThrow({ where: { pinterestPinId: "published-pin" } });
    expect(await prisma.growthAttributionRef.findUniqueOrThrow({ where: { id: publication.attributionRefId! } })).toMatchObject({ pinId: pin.id });
  });
  it("moves ambiguous create to GET-only reconciliation and resolves an exact attributed URL", async () => {
    const f = await fixture(); const past = new Date(Date.now() - 2 * 86_400_000); const approved = await approvePinCandidate({ candidateId: f.candidate.id, accountId: f.account.id, boardId: f.board.id, scheduledAt: new Date(past.getTime() + 60_000).toISOString(), confirmation: true }, f.admin.id, past);
    const createFetch = vi.fn().mockResolvedValue(new Response("{}", { status: 503 }));
    await publishApprovedPin(approved.publication!.id, createFetch);
    const publication = await prisma.growthPinPublication.findUniqueOrThrow({ where: { id: approved.publication!.id }, include: { approval: true } });
    expect(publication.status).toBe("RECONCILING");
    const link = (publication.approval.snapshot as Record<string, string>).destinationUrl;
    const readFetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ items: [{ id: "reconciled-pin", board_id: f.board.pinterestBoardId, link }], bookmark: null }), { status: 200 }));
    await reconcilePinterestPublication(publication.id, 1, readFetch);
    expect(createFetch).toHaveBeenCalledTimes(1); expect(readFetch).toHaveBeenCalledTimes(1);
    expect(await prisma.growthPinPublication.findUniqueOrThrow({ where: { id: publication.id } })).toMatchObject({ status: "RECONCILED", pinterestPinId: "reconciled-pin" });
  });
  it("reconciles after confirmed Create Pin success when local persistence fails", async () => {
    const f = await fixture(); const past = new Date(Date.now() - 2 * 86_400_000);
    const approved = await approvePinCandidate({ candidateId: f.candidate.id, accountId: f.account.id, boardId: f.board.id, scheduledAt: new Date(past.getTime() + 60_000).toISOString(), confirmation: true }, f.admin.id, past);
    await prisma.$executeRawUnsafe(`CREATE FUNCTION phase11_fail_pin_persistence() RETURNS trigger AS $$ BEGIN RAISE EXCEPTION 'forced persistence failure'; END; $$ LANGUAGE plpgsql`);
    await prisma.$executeRawUnsafe(`CREATE TRIGGER phase11_fail_pin_persistence BEFORE INSERT OR UPDATE ON "GrowthPinterestPin" FOR EACH ROW EXECUTE FUNCTION phase11_fail_pin_persistence()`);
    const createFetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: "confirmed-pin", board_id: f.board.pinterestBoardId }), { status: 201 }));
    try {
      await publishApprovedPin(approved.publication!.id, createFetch);
    } finally {
      await prisma.$executeRawUnsafe(`DROP TRIGGER IF EXISTS phase11_fail_pin_persistence ON "GrowthPinterestPin"`);
      await prisma.$executeRawUnsafe(`DROP FUNCTION IF EXISTS phase11_fail_pin_persistence()`);
    }
    expect(createFetch).toHaveBeenCalledTimes(1);
    expect(await prisma.growthPinPublication.findUniqueOrThrow({ where: { id: approved.publication!.id } })).toMatchObject({ status: "RECONCILING", lastErrorCode: "POST_CREATE_PERSISTENCE_UNCERTAIN" });
    expect(await prisma.growthJob.count({ where: { type: GrowthJobType.PINTEREST_PIN_RECONCILE } })).toBe(1);
  });

  it("fails reconciliation closed without moving a Pinterest Pin across accounts", async () => {
    const f = await fixture(); const past = new Date(Date.now() - 2 * 86_400_000);
    const foreign = await prisma.growthPinterestAccount.create({ data: { pinterestAccountId: `foreign-${Math.random()}`, publicationRole: GrowthPinterestPublicationRole.SAYTWIST, username: "foreign", apiEnvironment: GrowthPinterestApiEnvironment.SANDBOX, connectionStatus: GrowthPinterestConnectionStatus.DISCONNECTED, grantedScopes: ["pins:read"] } });
    await prisma.growthPinterestPin.create({ data: { pinterestPinId: "account-collision-pin", accountId: foreign.id, lastSeenAt: new Date(), lastSyncedAt: new Date() } });
    const approved = await approvePinCandidate({ candidateId: f.candidate.id, accountId: f.account.id, boardId: f.board.id, scheduledAt: new Date(past.getTime() + 60_000).toISOString(), confirmation: true }, f.admin.id, past);
    const createFetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: "account-collision-pin", board_id: f.board.pinterestBoardId }), { status: 201 }));
    await publishApprovedPin(approved.publication!.id, createFetch);
    const publication = await prisma.growthPinPublication.findUniqueOrThrow({ where: { id: approved.publication!.id }, include: { approval: true } });
    expect(publication.status).toBe("RECONCILING");
    const link = (publication.approval.snapshot as Record<string, string>).destinationUrl;
    await reconcilePinterestPublication(publication.id, 1, vi.fn().mockResolvedValue(new Response(JSON.stringify({ items: [{ id: "account-collision-pin", board_id: f.board.pinterestBoardId, link }], bookmark: null }), { status: 200 })));
    expect(await prisma.growthPinPublication.findUniqueOrThrow({ where: { id: publication.id } })).toMatchObject({ status: "FAILED_TERMINAL", lastErrorCode: "PINTEREST_PIN_ACCOUNT_MISMATCH" });
    expect(await prisma.growthPinterestPin.findUniqueOrThrow({ where: { pinterestPinId: "account-collision-pin" } })).toMatchObject({ accountId: foreign.id });
    expect(createFetch).toHaveBeenCalledTimes(1);
  });

  it("converts unexpected PUBLISHING failure and exhausted retry states atomically", async () => {
    const f = await fixture(); const past = new Date(Date.now() - 2 * 86_400_000);
    const approved = await approvePinCandidate({ candidateId: f.candidate.id, accountId: f.account.id, boardId: f.board.id, scheduledAt: new Date(past.getTime() + 60_000).toISOString(), confirmation: true }, f.admin.id, past);
    await prisma.growthPinPublication.update({ where: { id: approved.publication!.id }, data: { status: "PUBLISHING" } });
    const running = await prisma.growthJob.update({ where: { id: approved.publication!.publishJobId! }, data: { status: GrowthJobStatus.RUNNING, workerId: "worker", attemptCount: 1, leaseUntil: new Date(Date.now() + 60_000) } });
    await failGrowthJob(running, "worker", new Error("unexpected"));
    expect(await prisma.growthPinPublication.findUniqueOrThrow({ where: { id: approved.publication!.id } })).toMatchObject({ status: "RECONCILING", lastErrorCode: "PUBLISH_HANDLER_OUTCOME_AMBIGUOUS" });
    expect(await prisma.growthJob.count({ where: { type: GrowthJobType.PINTEREST_PIN_RECONCILE } })).toBe(1);

    await clean(); await prisma.growthSettings.create({ data: { id: "global", enabled: true } });
    const retryFixture = await fixture();
    const retryApproval = await approvePinCandidate({ candidateId: retryFixture.candidate.id, accountId: retryFixture.account.id, boardId: retryFixture.board.id, scheduledAt: new Date(past.getTime() + 60_000).toISOString(), confirmation: true }, retryFixture.admin.id, past);
    await prisma.growthPinPublication.update({ where: { id: retryApproval.publication!.id }, data: { status: "FAILED_RETRYABLE" } });
    const exhausted = await prisma.growthJob.update({ where: { id: retryApproval.publication!.publishJobId! }, data: { status: GrowthJobStatus.RUNNING, workerId: "worker", attemptCount: 3, maxAttempts: 3, leaseUntil: new Date(Date.now() + 60_000) } });
    await failGrowthJob(exhausted, "worker", new Error("429"));
    expect(await prisma.growthPinPublication.findUniqueOrThrow({ where: { id: retryApproval.publication!.id } })).toMatchObject({ status: "FAILED_TERMINAL", lastErrorCode: "PUBLISH_RETRY_EXHAUSTED" });
  });

  it("synchronizes final and stale reconciliation exhaustion", async () => {
    const f = await fixture(); const past = new Date(Date.now() - 2 * 86_400_000);
    const approved = await approvePinCandidate({ candidateId: f.candidate.id, accountId: f.account.id, boardId: f.board.id, scheduledAt: new Date(past.getTime() + 60_000).toISOString(), confirmation: true }, f.admin.id, past);
    await publishApprovedPin(approved.publication!.id, vi.fn().mockResolvedValue(new Response("{}", { status: 503 })));
    let publication = await prisma.growthPinPublication.findUniqueOrThrow({ where: { id: approved.publication!.id } });
    const reconcileJob = await prisma.growthJob.update({ where: { id: publication.reconcileJobId! }, data: { status: GrowthJobStatus.RUNNING, workerId: "worker", attemptCount: 4, maxAttempts: 4, leaseUntil: new Date(Date.now() + 60_000) } });
    await failGrowthJob(reconcileJob, "worker", new Error("read unavailable"));
    expect(await prisma.growthPinPublication.findUniqueOrThrow({ where: { id: publication.id } })).toMatchObject({ status: "FAILED_TERMINAL", lastErrorCode: "RECONCILIATION_RETRY_EXHAUSTED" });

    await clean(); await prisma.growthSettings.create({ data: { id: "global", enabled: true } });
    const staleFixture = await fixture();
    const staleApproval = await approvePinCandidate({ candidateId: staleFixture.candidate.id, accountId: staleFixture.account.id, boardId: staleFixture.board.id, scheduledAt: new Date(past.getTime() + 60_000).toISOString(), confirmation: true }, staleFixture.admin.id, past);
    await prisma.growthPinPublication.update({ where: { id: staleApproval.publication!.id }, data: { status: "FAILED_RETRYABLE" } });
    await prisma.growthJob.update({ where: { id: staleApproval.publication!.publishJobId! }, data: { status: GrowthJobStatus.RUNNING, workerId: "stale", attemptCount: 3, maxAttempts: 3, leaseUntil: new Date(Date.now() - 60_000) } });
    await recoverStaleGrowthJobs(new Date());
    expect(await prisma.growthPinPublication.findUniqueOrThrow({ where: { id: staleApproval.publication!.id } })).toMatchObject({ status: "FAILED_TERMINAL", lastErrorCode: "PUBLISH_RETRY_EXHAUSTED" });

    await clean(); await prisma.growthSettings.create({ data: { id: "global", enabled: true } });
    const staleReconcileFixture = await fixture();
    const staleReconcileApproval = await approvePinCandidate({ candidateId: staleReconcileFixture.candidate.id, accountId: staleReconcileFixture.account.id, boardId: staleReconcileFixture.board.id, scheduledAt: new Date(past.getTime() + 60_000).toISOString(), confirmation: true }, staleReconcileFixture.admin.id, past);
    await publishApprovedPin(staleReconcileApproval.publication!.id, vi.fn().mockResolvedValue(new Response("{}", { status: 503 })));
    publication = await prisma.growthPinPublication.findUniqueOrThrow({ where: { id: staleReconcileApproval.publication!.id } });
    await prisma.growthJob.update({ where: { id: publication.reconcileJobId! }, data: { status: GrowthJobStatus.RUNNING, workerId: "stale", attemptCount: 4, maxAttempts: 4, leaseUntil: new Date(Date.now() - 60_000) } });
    await recoverStaleGrowthJobs(new Date());
    expect(await prisma.growthPinPublication.findUniqueOrThrow({ where: { id: publication.id } })).toMatchObject({ status: "FAILED_TERMINAL", lastErrorCode: "RECONCILIATION_RETRY_EXHAUSTED" });
  });
  it("uses GET-only bounded reconciliation for unresolved and duplicate outcomes", async () => {
    const f = await fixture(); const past = new Date(Date.now() - 2 * 86_400_000);
    const approved = await approvePinCandidate({ candidateId: f.candidate.id, accountId: f.account.id, boardId: f.board.id, scheduledAt: new Date(past.getTime() + 60_000).toISOString(), confirmation: true }, f.admin.id, past);
    await publishApprovedPin(approved.publication!.id, vi.fn().mockResolvedValue(new Response("{}", { status: 503 })));
    const emptyRead = vi.fn().mockImplementation(async () => new Response(JSON.stringify({ items: [], bookmark: "same-bookmark" }), { status: 200 }));
    await expect(reconcilePinterestPublication(approved.publication!.id, 1, emptyRead)).rejects.toThrow("not visible");
    expect(emptyRead).toHaveBeenCalledTimes(2);
    await reconcilePinterestPublication(approved.publication!.id, 4, vi.fn().mockResolvedValue(new Response(JSON.stringify({ items: [], bookmark: null }), { status: 200 })));
    expect(await prisma.growthPinPublication.findUniqueOrThrow({ where: { id: approved.publication!.id } })).toMatchObject({ status: "FAILED_TERMINAL", lastErrorCode: "RECONCILIATION_UNRESOLVED" });

    await clean(); await prisma.growthSettings.create({ data: { id: "global", enabled: true } });
    const duplicate = await fixture();
    const next = await approvePinCandidate({ candidateId: duplicate.candidate.id, accountId: duplicate.account.id, boardId: duplicate.board.id, scheduledAt: new Date(past.getTime() + 60_000).toISOString(), confirmation: true }, duplicate.admin.id, past);
    await publishApprovedPin(next.publication!.id, vi.fn().mockResolvedValue(new Response("{}", { status: 503 })));
    const row = await prisma.growthPinPublication.findUniqueOrThrow({ where: { id: next.publication!.id }, include: { approval: true } });
    const link = (row.approval.snapshot as Record<string, string>).destinationUrl;
    const duplicateRead = vi.fn().mockResolvedValue(new Response(JSON.stringify({ items: [{ id: "pin-a", board_id: duplicate.board.pinterestBoardId, link }, { id: "pin-b", board_id: duplicate.board.pinterestBoardId, link }], bookmark: null }), { status: 200 }));
    await reconcilePinterestPublication(row.id, 1, duplicateRead);
    expect(await prisma.growthPinPublication.findUniqueOrThrow({ where: { id: row.id } })).toMatchObject({ status: "FAILED_TERMINAL", lastErrorCode: "DUPLICATE_PIN_DETECTED" });
  });
  it("marks a failed final revalidation terminal before any Pinterest call", async () => {
    const f = await fixture(); const past = new Date(Date.now() - 2 * 86_400_000);
    const approved = await approvePinCandidate({ candidateId: f.candidate.id, accountId: f.account.id, boardId: f.board.id, scheduledAt: new Date(past.getTime() + 60_000).toISOString(), confirmation: true }, f.admin.id, past);
    await prisma.growthPinterestBoard.update({ where: { id: f.board.id }, data: { isActive: false } });
    const fetchMock = vi.fn();
    await expect(publishApprovedPin(approved.publication!.id, fetchMock)).rejects.toThrow("no longer valid");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(await prisma.growthPinPublication.findUniqueOrThrow({ where: { id: approved.publication!.id } })).toMatchObject({ status: "FAILED_TERMINAL", lastErrorCode: "PUBLICATION_REVALIDATION_FAILED" });
  });
});
