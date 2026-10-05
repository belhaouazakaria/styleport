import { randomUUID } from "node:crypto";

import { GrowthIntensity, GrowthJobStatus, GrowthJobType, Prisma } from "@prisma/client";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import {
  claimGrowthJobs,
  completeGrowthJob,
  enqueueGrowthJob,
  failGrowthJob,
  markGrowthJobRunning,
  promoteDueGrowthRetries,
  recoverStaleGrowthJobs,
} from "@/lib/growth/jobs";
import { dispatchGrowthJob } from "@/lib/growth/handlers";
import { updateGrowthSettings } from "@/lib/growth/settings";
import { runGrowthWorker } from "@/lib/growth/worker";
import { prisma } from "@/lib/prisma";

const runDatabaseTests = process.env.RUN_GROWTH_DB_TESTS === "1";
const databaseDescribe = runDatabaseTests ? describe.sequential : describe.skip;
const requiredDatabaseName = "saytwist_growth_phase2_test";

if (runDatabaseTests) {
  const explicitUrl = process.env.GROWTH_TEST_DATABASE_URL;
  if (!explicitUrl || process.env.DATABASE_URL !== explicitUrl) {
    throw new Error("Growth DB tests require DATABASE_URL and GROWTH_TEST_DATABASE_URL to be the same explicit disposable URL.");
  }
  const parsed = new URL(explicitUrl);
  const databaseName = decodeURIComponent(parsed.pathname.replace(/^\//, ""));
  if (!(["localhost", "127.0.0.1", "::1"].includes(parsed.hostname)) || databaseName !== requiredDatabaseName) {
    throw new Error(`Growth DB tests refuse every target except local database ${requiredDatabaseName}.`);
  }
}

async function resetGrowthTables() {
  await prisma.growthActivity.deleteMany();
  await prisma.growthJob.deleteMany();
  await prisma.growthWorkerHeartbeat.deleteMany();
  await prisma.growthSettings.deleteMany();
  await prisma.user.deleteMany({ where: { email: { endsWith: "@growth-phase2.test" } } });
}

async function enableGrowth(batchSize = 5) {
  return prisma.growthSettings.create({
    data: { id: "global", enabled: true, intensity: GrowthIntensity.BALANCED, workerBatchSize: batchSize },
  });
}

async function enqueue(key: string, maxAttempts = 3) {
  return (await enqueueGrowthJob({
    type: GrowthJobType.FOUNDATION_NOOP,
    idempotencyKey: key,
    maxAttempts,
  })).job;
}

beforeEach(resetGrowthTables);

afterAll(async () => {
  if (runDatabaseTests) await resetGrowthTables();
  await prisma.$disconnect();
});

databaseDescribe("Growth PostgreSQL persistence and concurrency", () => {
  it("A: exits cleanly on an enabled empty queue and keeps one stable heartbeat row", async () => {
    await enableGrowth();
    const results = await Promise.all([
      runGrowthWorker({ workerId: "integration-empty" }),
      runGrowthWorker({ workerId: "integration-empty" }),
    ]);
    expect(results).toEqual([
      { status: "EMPTY", claimed: 0, succeeded: 0, failed: 0 },
      { status: "EMPTY", claimed: 0, succeeded: 0, failed: 0 },
    ]);
    expect(await prisma.growthWorkerHeartbeat.count({ where: { workerId: "integration-empty" } })).toBe(1);
    expect((await prisma.growthWorkerHeartbeat.findUniqueOrThrow({ where: { workerId: "integration-empty" } })).invocationId).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("B: honors the disabled kill switch without claiming or writing a heartbeat", async () => {
    await prisma.growthSettings.create({ data: { id: "global", enabled: false } });
    const job = await enqueue("integration:disabled");
    await expect(runGrowthWorker({ workerId: "integration-disabled" })).resolves.toEqual({
      status: "DISABLED", claimed: 0, succeeded: 0, failed: 0,
    });
    expect((await prisma.growthJob.findUniqueOrThrow({ where: { id: job.id } })).status).toBe(GrowthJobStatus.PENDING);
    expect(await prisma.growthWorkerHeartbeat.count()).toBe(0);
  });

  it("C: persists and completes basic work with its transition activity", async () => {
    await enableGrowth();
    const job = await enqueue("integration:basic");
    await expect(runGrowthWorker({ workerId: "integration-basic", batchSize: 1 })).resolves.toMatchObject({
      status: "COMPLETED", claimed: 1, succeeded: 1, failed: 0,
    });
    const persisted = await prisma.growthJob.findUniqueOrThrow({ where: { id: job.id } });
    expect(persisted).toMatchObject({ status: GrowthJobStatus.SUCCEEDED, attemptCount: 1, maxAttempts: 3 });
    expect(persisted.completedAt).toBeInstanceOf(Date);
    expect(await prisma.growthActivity.findMany({ where: { entityId: job.id }, orderBy: { createdAt: "asc" }, select: { action: true } })).toEqual([
      { action: "JOB_CREATED" }, { action: "JOB_CLAIMED" }, { action: "JOB_STARTED" }, { action: "JOB_COMPLETED" },
    ]);
  });

  it("D: deduplicates concurrent enqueue attempts by idempotency key", async () => {
    await enableGrowth();
    const key = "integration:idempotent";
    const results = await Promise.all(Array.from({ length: 8 }, () => enqueueGrowthJob({ type: GrowthJobType.FOUNDATION_NOOP, idempotencyKey: key })));
    expect(new Set(results.map(({ job }) => job.id)).size).toBe(1);
    expect(results.filter(({ created }) => created)).toHaveLength(1);
    expect(await prisma.growthJob.count({ where: { idempotencyKey: key } })).toBe(1);
    await expect(runGrowthWorker({ workerId: "integration-idempotent", batchSize: 5 })).resolves.toMatchObject({ claimed: 1, succeeded: 1 });
    expect(await prisma.growthJob.count({ where: { idempotencyKey: key, status: GrowthJobStatus.SUCCEEDED } })).toBe(1);
  });

  it("E: atomically divides real concurrent batch claims without duplicates", async () => {
    const jobs = await Promise.all(Array.from({ length: 12 }, (_, index) => enqueue(`integration:concurrent:${index}`)));
    const [left, right] = await Promise.all([
      claimGrowthJobs({ workerId: "lease-owner-left", limit: 6 }),
      claimGrowthJobs({ workerId: "lease-owner-right", limit: 6 }),
    ]);
    const claimedIds = [...left, ...right].map(({ id }) => id);
    expect(left).toHaveLength(6);
    expect(right).toHaveLength(6);
    expect(new Set(claimedIds).size).toBe(jobs.length);
    expect(await prisma.growthJob.count({ where: { status: GrowthJobStatus.CLAIMED } })).toBe(12);
    await Promise.all([
      ...left.map(async (job) => {
        await markGrowthJobRunning(job, "lease-owner-left");
        await completeGrowthJob(job, "lease-owner-left", await dispatchGrowthJob(job));
      }),
      ...right.map(async (job) => {
        await markGrowthJobRunning(job, "lease-owner-right");
        await completeGrowthJob(job, "lease-owner-right", await dispatchGrowthJob(job));
      }),
    ]);
    expect(await prisma.growthJob.count({ where: { status: GrowthJobStatus.SUCCEEDED } })).toBe(12);
    const completions = await prisma.growthActivity.groupBy({
      by: ["entityId"], where: { action: "JOB_COMPLETED" }, _count: { _all: true },
    });
    expect(completions).toHaveLength(12);
    expect(completions.every((entry) => entry._count._all === 1)).toBe(true);
  });

  it("F: recovers an expired lease with remaining attempt budget", async () => {
    await enqueue("integration:stale");
    const [claimed] = await claimGrowthJobs({ workerId: "stale-owner", limit: 1 });
    await markGrowthJobRunning(claimed, "stale-owner");
    await prisma.growthJob.update({ where: { id: claimed.id }, data: { leaseUntil: new Date(Date.now() - 60_000) } });
    await expect(recoverStaleGrowthJobs(new Date(), 1)).resolves.toBe(1);
    expect(await prisma.growthJob.findUniqueOrThrow({ where: { id: claimed.id } })).toMatchObject({
      status: GrowthJobStatus.PENDING, workerId: null, leaseUntil: null, attemptCount: 1,
    });
    expect(await prisma.growthActivity.count({ where: { entityId: claimed.id, action: "JOB_LEASE_RECOVERED" } })).toBe(1);
    const [replacement] = await claimGrowthJobs({ workerId: "replacement-owner", limit: 1 });
    expect(replacement).toMatchObject({ id: claimed.id, attemptCount: 2 });
    await markGrowthJobRunning(replacement, "replacement-owner");
    await completeGrowthJob(replacement, "replacement-owner");
    expect(await prisma.growthActivity.count({ where: { entityId: claimed.id, action: "JOB_COMPLETED" } })).toBe(1);
  });

  it("G: schedules a retry, redacts the failure, and succeeds on the next attempt", async () => {
    await enqueue("integration:retry");
    const [first] = await claimGrowthJobs({ workerId: "retry-owner-1", limit: 1 });
    await markGrowthJobRunning(first, "retry-owner-1");
    await expect(failGrowthJob(first, "retry-owner-1", new Error("Authorization: Bearer secret-token DATABASE_URL=postgresql://hidden"))).resolves.toBe(GrowthJobStatus.FAILED_RETRYABLE);
    const retryable = await prisma.growthJob.findUniqueOrThrow({ where: { id: first.id } });
    expect(retryable.lastError).toContain("[redacted]");
    expect(retryable.lastError).not.toMatch(/secret-token|postgresql:\/\/hidden/);
    await expect(claimGrowthJobs({ workerId: "too-early-owner", limit: 1 })).resolves.toEqual([]);
    await expect(promoteDueGrowthRetries(new Date(Date.now() + 31_000), 1)).resolves.toBe(1);
    const [second] = await claimGrowthJobs({ workerId: "retry-owner-2", limit: 1 });
    expect(second.attemptCount).toBe(2);
    await markGrowthJobRunning(second, "retry-owner-2");
    await completeGrowthJob(second, "retry-owner-2", { handled: true });
    expect((await prisma.growthJob.findUniqueOrThrow({ where: { id: first.id } })).status).toBe(GrowthJobStatus.SUCCEEDED);
  });

  it("H: makes an exhausted failure terminal", async () => {
    await enqueue("integration:terminal", 1);
    const [claimed] = await claimGrowthJobs({ workerId: "terminal-owner", limit: 1 });
    await markGrowthJobRunning(claimed, "terminal-owner");
    await expect(failGrowthJob(claimed, "terminal-owner", new Error("controlled failure"))).resolves.toBe(GrowthJobStatus.FAILED_TERMINAL);
    expect(await prisma.growthJob.findUniqueOrThrow({ where: { id: claimed.id } })).toMatchObject({
      status: GrowthJobStatus.FAILED_TERMINAL, attemptCount: 1,
    });
    await expect(claimGrowthJobs({ workerId: "terminal-reclaim", limit: 1 })).resolves.toEqual([]);
  });

  it("I: rejects an unknown job type at the database enum boundary", async () => {
    await expect(prisma.$executeRaw(Prisma.sql`
      INSERT INTO "GrowthJob" ("id", "type", "idempotencyKey", "updatedAt")
      VALUES (${randomUUID()}, 'UNKNOWN_PHASE_TYPE'::"GrowthJobType", ${`integration:unknown:${randomUUID()}`}, CURRENT_TIMESTAMP)
    `)).rejects.toThrow();
    expect(await prisma.growthJob.count()).toBe(0);
  });

  it("J: enforces lease ownership and keeps concurrent settings updates singleton", async () => {
    const admin = await prisma.user.create({ data: {
      email: `${randomUUID()}@growth-phase2.test`, passwordHash: "unused-in-integration-test", role: "ADMIN",
    } });
    await enqueue("integration:ownership");
    const [claimed] = await claimGrowthJobs({ workerId: "right-owner", limit: 1 });
    await expect(markGrowthJobRunning(claimed, "wrong-owner")).rejects.toThrow("claim was lost");
    await markGrowthJobRunning(claimed, "right-owner");
    await expect(completeGrowthJob(claimed, "wrong-owner")).rejects.toThrow("claim is no longer active");
    await completeGrowthJob(claimed, "right-owner");

    await Promise.all(Array.from({ length: 5 }, (_, index) => updateGrowthSettings({
      enabled: index % 2 === 0,
      intensity: GrowthIntensity.BALANCED,
      workerBatchSize: index + 1,
    }, admin.id)));
    expect(await prisma.growthSettings.count()).toBe(1);
    expect((await prisma.growthSettings.findUniqueOrThrow({ where: { id: "global" } })).configVersion).toBe(5);
    expect((await enqueue("integration:max-attempt-cap", 99)).maxAttempts).toBe(5);
  });
});
