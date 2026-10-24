import { GrowthActivityActorKind, Prisma } from "@prisma/client";

import { recordGrowthActivity } from "@/lib/growth/activity";
import { prisma } from "@/lib/prisma";

export type BudgetWarningState = "OPEN" | "ACKNOWLEDGED" | "RESOLVED";
export type BudgetWarningTransition = "ACKNOWLEDGE" | "RESOLVE";
const TRANSITIONS = ["AI_BUDGET_WARNING_ACKNOWLEDGED", "AI_BUDGET_WARNING_RESOLVED"];

export class GrowthBudgetWarningError extends Error {
  constructor(readonly reason: string) {
    super("Budget warning: " + reason);
    this.name = "GrowthBudgetWarningError";
  }
}

export function stateFromWarningActions(actions: readonly string[]): BudgetWarningState {
  if (actions.includes("AI_BUDGET_WARNING_RESOLVED")) return "RESOLVED";
  if (actions.includes("AI_BUDGET_WARNING_ACKNOWLEDGED")) return "ACKNOWLEDGED";
  return "OPEN";
}

export async function listGrowthBudgetWarnings() {
  const warnings = await prisma.growthActivity.findMany({
    where: { action: "AI_BUDGET_WARNING", entityType: "GrowthAiBudgetReservation" },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: 50,
    select: { id: true, createdAt: true, entityId: true, summary: true },
  });
  const ids = warnings.map((w) => w.id);
  const actions = ids.length ? await prisma.growthActivity.findMany({
    where: {
      entityType: "GrowthActivity", entityId: { in: ids },
      action: { in: TRANSITIONS },
    },
    select: { entityId: true, action: true },
  }) : [];
  const byId = new Map<string, string[]>();
  for (const action of actions) {
    const old = byId.get(action.entityId) ?? [];
    old.push(action.action);
    byId.set(action.entityId, old);
  }
  return warnings.map((w) => {
    const summary = w.summary && typeof w.summary === "object" &&
      !Array.isArray(w.summary) ? w.summary as Record<string, unknown> : {};
    const rawPercent = summary.thresholdPercent;
    const thresholdPercent: 70 | 90 | null = rawPercent === 70 ? 70 : rawPercent === 90 ? 90 : null;
    return {
      id: w.id,
      createdAt: w.createdAt.toISOString(),
      reservationId: w.entityId,
      thresholdPercent,
      state: stateFromWarningActions(byId.get(w.id) ?? []),
    };
  });
}

/**
 * Row lock on the source warning serializes competing ACK/RESOLVE requests.
 * Each transition appends an activity event; original warning is immutable.
 */
export async function transitionGrowthBudgetWarning(input: {
  warningId: string;
  transition: BudgetWarningTransition;
  actorUserId: string;
}) {
  if (!/^[A-Za-z0-9_-]{1,191}$/.test(input.warningId) ||
      !/^[A-Za-z0-9_-]{1,191}$/.test(input.actorUserId) ||
      (input.transition !== "ACKNOWLEDGE" && input.transition !== "RESOLVE"))
    throw new GrowthBudgetWarningError("INVALID_TRANSITION");

  return prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<Array<{ id: string }>>(
      Prisma.sql`SELECT "id" FROM "GrowthActivity"
        WHERE "id" = ${input.warningId}
          AND "action" = 'AI_BUDGET_WARNING'
          AND "entityType" = 'GrowthAiBudgetReservation'
        FOR UPDATE`,
    );
    if (!rows.length) throw new GrowthBudgetWarningError("WARNING_NOT_FOUND");
    const existing = await tx.growthActivity.findMany({
      where: {
        entityType: "GrowthActivity", entityId: input.warningId,
        action: { in: TRANSITIONS },
      },
      select: { action: true },
    });
    const state = stateFromWarningActions(existing.map((e) => e.action));
    if (input.transition === "ACKNOWLEDGE") {
      if (state === "ACKNOWLEDGED") return { state, reused: true };
      if (state !== "OPEN") throw new GrowthBudgetWarningError("WARNING_ALREADY_RESOLVED");
    } else {
      if (state === "RESOLVED") return { state, reused: true };
      if (state !== "ACKNOWLEDGED") throw new GrowthBudgetWarningError("ACKNOWLEDGMENT_REQUIRED");
    }
    const next: BudgetWarningState = input.transition === "ACKNOWLEDGE" ? "ACKNOWLEDGED" : "RESOLVED";
    await recordGrowthActivity({
      actorKind: GrowthActivityActorKind.USER,
      actorUserId: input.actorUserId,
      entityType: "GrowthActivity",
      entityId: input.warningId,
      action: input.transition === "ACKNOWLEDGE" ? TRANSITIONS[0] : TRANSITIONS[1],
      fromState: state,
      toState: next,
      summary: { kind: "AI_BUDGET_WARNING" },
      correlationKey: "growth-budget-warning:" + input.warningId + ":" + next,
    }, tx);
    return { state: next, reused: false };
  }, { timeout: 10_000 });
}
