import { describe, expect, it, vi } from "vitest";
import {
  GrowthJobStatus,
  GrowthJobType,
  GrowthPinApprovalStatus,
  GrowthPinCandidateStatus,
  GrowthPublicationStatus,
  type Prisma,
} from "@prisma/client";

import {
  countBlockingGrowthJobs,
  PUBLISHER_FRESH_CANDIDATE_AFTER,
} from "@/lib/growth/operations/approved-publication-queue";
import { assertApprovedPublisherRuntime } from "@/workers/growth-approved-publisher";

const sha = "a".repeat(40);
const identity = {
  username: "saytwist",
  uid: 1001,
  cwd: "/home/saytwist/htdocs/saytwist.com",
  node: "/home/saytwist/.nvm/versions/node/v24.20.0/bin/node",
};
const env = {
  NODE_ENV: "production", EXPECTED_RELEASE: sha,
  GROWTH_APPROVED_PUBLISHER_ENABLED: "true",
  GROWTH_APPROVED_PUBLISHER_APPROVAL:
    "SAYTWIST_APPROVED_PUBLISHER_SCHEDULED:" + sha,
  GROWTH_WORKER_RUN_ENABLED: "false",
  GROWTH_ROLLOUT_MODE: "OFF",
  GROWTH_AI_IMAGE_ENABLED: "false",
  GROWTH_ATTRIBUTION_COLLECTION_ENABLED: "false",
  GROWTH_DAILY_REPORT_SCHEDULE_ENABLED: "false",
  TELEGRAM_REPORTS_ENABLED: "false",
  PINTEREST_API_ENVIRONMENT: "production",
  PINTEREST_APP_ID: "test-app",
  PINTEREST_APP_SECRET: "test-secret",
  PINTEREST_REDIRECT_URI: "https://saytwist.com/api/admin/growth/pinterest/oauth/callback",
  GROWTH_CREDENTIAL_ENCRYPTION_KEY: "opaque-test-key",
  APP_BASE_URL: "https://saytwist.com",
  DATABASE_URL: "postgresql://user:password@127.0.0.1:5433/saytwist",
};

const due = new Date("2026-11-07T14:00:00Z");
function job(overrides: Record<string, unknown> = {}) {
  return {
    id: "job-new", status: GrowthJobStatus.PENDING,
    type: GrowthJobType.PINTEREST_PIN_PUBLISH,
    attemptCount: 0, runAfter: due,
    ...overrides,
  };
}
function publication(overrides: Record<string, unknown> = {}) {
  return {
    publishJobId: "job-new",
    status: GrowthPublicationStatus.SCHEDULED,
    candidateId: "candidate-new",
    scheduledAt: due,
    accountId: "account-new", boardId: "board-new",
    candidate: {
      status: GrowthPinCandidateStatus.READY, revision: 1,
      createdAt: new Date("2026-11-07T09:00:00Z"),
    },
    approval: {
      candidateId: "candidate-new",
      approvedById: "admin-owner", reviewedAt: new Date("2026-11-07T13:00:00Z"),
      status: GrowthPinApprovalStatus.APPROVED,
      scheduledAt: due, accountId: "account-new",
      boardId: "board-new", candidateRevision: 1,
    },
    ...overrides,
  };
}
function fakeDb(jobs: unknown[], publications: unknown[]) {
  const findJobs = vi.fn().mockResolvedValue(jobs);
  const findPublications = vi.fn().mockResolvedValue(publications);
  const db = {
    growthJob: { findMany: findJobs },
    growthPinPublication: { findMany: findPublications },
  } as unknown as Pick<Prisma.TransactionClient, "growthJob" | "growthPinPublication">;
  return { db, findJobs, findPublications };
}

describe("Phase14L scheduled per-Pin publisher runtime gate", () => {
  it("accepts only an explicit exact-deployed SHA schedule and a private production runtime", () => {
    expect(assertApprovedPublisherRuntime(env, sha, identity)).toBe(sha);
    expect(() => assertApprovedPublisherRuntime(env, "b".repeat(40), identity)).toThrow();
    expect(() => assertApprovedPublisherRuntime({
      ...env, GROWTH_APPROVED_PUBLISHER_APPROVAL: "UNAUTHORIZED",
    }, sha, identity)).toThrow();
    expect(() => assertApprovedPublisherRuntime(env, sha, { ...identity, uid: 0 })).toThrow();
    expect(() => assertApprovedPublisherRuntime(env, sha, {
      ...identity, cwd: "/tmp",
    })).toThrow();
    expect(() => assertApprovedPublisherRuntime({
      ...env, DATABASE_URL: "postgresql://user:pass@localhost:5433/saytwist",
    }, sha, identity)).toThrow();
    expect(() => assertApprovedPublisherRuntime({
      ...env, DATABASE_URL: "postgresql://user:pass@127.0.0.1:5433/other",
    }, sha, identity)).toThrow();
  });
  it("does not accidentally activate attribution, paid models, reports or generic workers", () => {
    for (const key of [
      "GROWTH_WORKER_RUN_ENABLED",
      "GROWTH_DAILY_REPORT_SCHEDULE_ENABLED",
      "TELEGRAM_REPORTS_ENABLED",
      "GROWTH_ATTRIBUTION_COLLECTION_ENABLED",
      "GROWTH_AI_IMAGE_ENABLED",
    ]) {
      expect(() => assertApprovedPublisherRuntime({
        ...env, [key]: "true",
      }, sha, identity)).toThrow();
    }
    expect(() => assertApprovedPublisherRuntime({
      ...env, GROWTH_ROLLOUT_MODE: "RECOMMEND",
    }, sha, identity)).toThrow();
  });
});

describe("Phase14L pending, freshly approved queue isolation", () => {
  it("treats a valid scheduled owner-approved pending Pin as inert, not a free worker", async () => {
    const { db, findPublications } = fakeDb([job()], [publication()]);
    expect(await countBlockingGrowthJobs(db)).toBe(0);
    expect(findPublications).toHaveBeenCalledTimes(1);
    expect(PUBLISHER_FRESH_CANDIDATE_AFTER.toISOString())
      .toBe("2026-11-06T20:53:59.000Z");
  });
  it("blocks any unrelated pending creative, active publisher or retryable job", async () => {
    for (const unsafe of [
      job({ type: GrowthJobType.CREATIVE_LAB_GENERATE }),
      job({ status: GrowthJobStatus.RUNNING }),
      job({ status: GrowthJobStatus.FAILED_RETRYABLE }),
      job({ attemptCount: 1 }),
    ]) {
      const { db } = fakeDb([unsafe], [publication()]);
      expect(await countBlockingGrowthJobs(db)).toBe(1);
    }
  });
  it("blocks historical and unapproved Pin jobs while allowing a separate valid one", async () => {
    for (const invalid of [
      publication({ candidate: { status: GrowthPinCandidateStatus.READY,
        revision: 1, createdAt: new Date("2026-10-01T00:00:00Z") } }),
      publication({ approval: { ...publication().approval, approvedById: null } }),
      publication({ approval: { ...publication().approval, status: GrowthPinApprovalStatus.REJECTED } }),
      publication({ scheduledAt: new Date("2026-11-07T15:00:00Z") }),
      publication({ candidate: { ...publication().candidate, revision: 2 } }),
    ]) {
      const { db } = fakeDb([job()], [invalid]);
      expect(await countBlockingGrowthJobs(db)).toBe(1);
    }
    const { db } = fakeDb([
      job(), job({ id: "unrelated", type: GrowthJobType.TRANSLATOR_AUTOPILOT_EXECUTE }),
    ], [publication()]);
    expect(await countBlockingGrowthJobs(db)).toBe(1);
  });
  it("fails closed on unexpectedly broad active queues", async () => {
    const { db } = fakeDb(Array.from({ length: 101 }, (_, i) => job({ id: "job-" + i })), []);
    expect(await countBlockingGrowthJobs(db)).toBe(101);
  });
});
