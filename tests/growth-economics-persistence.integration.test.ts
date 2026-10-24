import { GrowthAiOperationKind } from "@prisma/client";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { prisma } from "@/lib/prisma";
import { reserveGrowthAiBudget } from "@/lib/growth/economics/reservations";
import { appendGrowthAiUsageEvidence } from "@/lib/growth/economics/usage-evidence";
import { GROWTH_TEXT_PRICE_VERSION } from "@/lib/growth/economics/text-admission";
import { listGrowthBudgetWarnings, transitionGrowthBudgetWarning } from "@/lib/growth/economics/warnings";

const enabled = process.env.RUN_GROWTH_ECONOMICS_DB_TESTS === "1";
const suite = enabled ? describe.sequential : describe.skip;
const databaseName = "saytwist_growth_phase13_economics_test";

if (enabled) {
  const explicit = process.env.GROWTH_ECONOMICS_TEST_DATABASE_URL;
  if (!explicit || explicit !== process.env.DATABASE_URL)
    throw new Error("Phase 13 DB tests require identical explicit test and active DB URLs.");
  const url = new URL(explicit);
  if (!["localhost", "127.0.0.1", "::1"].includes(url.hostname) ||
      decodeURIComponent(url.pathname.slice(1)) !== databaseName)
    throw new Error("Unsafe Phase 13 database target; disposable loopback database required.");
}

async function clean() {
  // Truncate is permitted ONLY in the guarded disposable test database: the
  // production SQL trigger must continue to reject UPDATE and DELETE of evidence.
  await prisma.$executeRawUnsafe('TRUNCATE TABLE "GrowthAiUsageEvent"');
  await prisma.growthAiBudgetReservation.deleteMany();
  await prisma.growthActivity.deleteMany();
  await prisma.growthSettings.deleteMany();
  await prisma.user.deleteMany();
}
const textRequest = (key: string, priceCeilingCents = 30) => ({
  requestKey: "phase13-economics:" + key,
  jobId: "phase13-job",
  kind: GrowthAiOperationKind.TEXT,
  provider: "OPENAI",
  model: "gpt-4.1-mini",
  pricingVersion: GROWTH_TEXT_PRICE_VERSION,
  priceCeilingCents,
});

beforeEach(async () => {
  if (!enabled) return;
  await clean();
  await prisma.growthSettings.create({ data: {
    id: "global", enabled: true, attributionEnabled: false,
    aiDailyBudgetCents: 60, aiMonthlyBudgetCents: 3000, aiImagesPerDayCap: 3,
  } });
});
afterAll(async () => {
  if (enabled) await clean();
  await prisma.$disconnect();
});

suite("Phase 13 disposable PostgreSQL acceptance — no external APIs", () => {
  it("serializes six concurrent provider reservations and admits only the two $0.30 slots", async () => {
    const attempts = await Promise.allSettled(
      Array.from({ length: 6 }, (_, i) => reserveGrowthAiBudget(textRequest("parallel-" + i))),
    );
    const granted = attempts.filter((result) => result.status === "fulfilled");
    const rejected = attempts.filter((result) => result.status === "rejected");
    expect(granted).toHaveLength(2);
    expect(rejected).toHaveLength(4);
    for (const error of rejected) {
      if (error.status === "rejected") expect(String(error.reason)).toContain("DAILY_LIMIT");
    }
    const reservations = await prisma.growthAiBudgetReservation.findMany();
    expect(reservations).toHaveLength(2);
    expect(reservations.reduce((total, item) => total + item.reservedCents, 0)).toBe(60);
  }, 30_000);

  it("idempotent concurrent requests reserve once, and cannot re-spend an existing key", async () => {
    const attempts = await Promise.all([
      reserveGrowthAiBudget(textRequest("duplicate")),
      reserveGrowthAiBudget(textRequest("duplicate")),
    ]);
    expect(attempts.map((a) => a.newlyReserved).sort()).toEqual([false, true]);
    expect(await prisma.growthAiBudgetReservation.count()).toBe(1);
    await expect(reserveGrowthAiBudget({ ...textRequest("duplicate"), model: "gpt-6" }))
      .rejects.toThrow("RESERVATION_IDEMPOTENCY_CONFLICT");
  });

  it("keeps response usage immutable at SQL layer and retains the pessimistic reservation", async () => {
    const admitted = await reserveGrowthAiBudget(textRequest("evidence"));
    const reservationId = admitted.reservation.id;
    const event = await appendGrowthAiUsageEvidence({
      reservationId, outcome: "RESPONSE_RECEIVED",
      responseId: "resp_safe", inputTokens: 1000, outputTokens: 500, totalTokens: 1500,
    });
    expect(event.estimatedMicroUsd).toBe(BigInt(1200));
    await expect(appendGrowthAiUsageEvidence({ reservationId, outcome: "OUTCOME_UNKNOWN" }))
      .rejects.toThrow();
    await expect(prisma.growthAiUsageEvent.update({
      where: { id: event.id }, data: { totalTokens: 12 },
    })).rejects.toThrow();
    await expect(prisma.growthAiUsageEvent.delete({ where: { id: event.id } }))
      .rejects.toThrow();
    expect(await prisma.growthAiUsageEvent.count()).toBe(1);
    const reservation = await prisma.growthAiBudgetReservation.findUniqueOrThrow({ where: { id: reservationId } });
    expect(reservation.reservedCents).toBe(30);
    expect(reservation.reconciledCents).toBeNull();
    expect(reservation.status).toBe("RESERVED");
  });

  it("fails closed for uncertainty and records no fabricated provider usage", async () => {
    const admitted = await reserveGrowthAiBudget(textRequest("timeout"));
    const reservationId = admitted.reservation.id;
    const event = await appendGrowthAiUsageEvidence({ reservationId, outcome: "OUTCOME_UNKNOWN" });
    expect(event.providerResponseId).toBeNull();
    expect(event.estimatedMicroUsd).toBeNull();
    expect(event.inputTokens).toBeNull();
    expect(await prisma.growthAiBudgetReservation.count()).toBe(1);
    await expect(appendGrowthAiUsageEvidence({
      reservationId, outcome: "RESPONSE_RECEIVED", inputTokens: 0, outputTokens: 0,
    })).rejects.toThrow();
  });

  it("preserves warning original and serializes audit ACK -> RESOLVE, never changes budget", async () => {
    const actor = await prisma.user.create({
      data: { email: "phase13-warnings@test.local", passwordHash: "not-a-real-password", role: "ADMIN" },
    });
    await reserveGrowthAiBudget(textRequest("warn-a"));
    await reserveGrowthAiBudget(textRequest("warn-b"));
    const warnings = await listGrowthBudgetWarnings();
    expect(warnings.length).toBeGreaterThanOrEqual(2);
    expect(warnings.every((w) => w.state === "OPEN")).toBe(true);
    const warningId = warnings[0].id;
    await expect(transitionGrowthBudgetWarning({
      warningId, transition: "RESOLVE", actorUserId: actor.id,
    })).rejects.toThrow("ACKNOWLEDGMENT_REQUIRED");
    const acknowledgments = await Promise.all([
      transitionGrowthBudgetWarning({ warningId, transition: "ACKNOWLEDGE", actorUserId: actor.id }),
      transitionGrowthBudgetWarning({ warningId, transition: "ACKNOWLEDGE", actorUserId: actor.id }),
    ]);
    expect(acknowledgments.filter((x) => !x.reused)).toHaveLength(1);
    expect((await transitionGrowthBudgetWarning({
      warningId, transition: "RESOLVE", actorUserId: actor.id,
    })).state).toBe("RESOLVED");
    const after = await listGrowthBudgetWarnings();
    expect(after.find((x) => x.id === warningId)?.state).toBe("RESOLVED");
    expect(await prisma.growthActivity.count({ where: { id: warningId } })).toBe(1);
    expect((await prisma.growthAiBudgetReservation.aggregate({
      _sum: { reservedCents: true },
    }))._sum.reservedCents).toBe(60);
  }, 30_000);
});
