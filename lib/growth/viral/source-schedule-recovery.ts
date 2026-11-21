import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { readDailyRotation } from "@/lib/growth/portfolio/daily-rotation-store";
import { countBlockingGrowthJobs } from "@/lib/growth/operations/approved-publication-queue";
import { rateSourceTranslator } from "./rating";
import { isSourceDispatchSlot, sourceDispatchSlots } from "./source-schedule";

export const SOURCE_RECOVERY_ENTITY = "GrowthSourceScheduleRecovery";
export const SOURCE_RECOVERY_POLICY = "SOURCE_SCHEDULE_RECOVERY_POLICY_UPDATED";
const DAY = 86_400_000;
const ACTIVE = ["APPROVED", "PUBLISHING", "OUTCOME_UNKNOWN", "PUBLISHED"];
const CHECK_INTERVAL = 5 * 60_000;

/** Standing owner consent is durable, revocable, and narrower than Pin approval.
 * It permits timing-only replacements of that owner's approved, never-attempted
 * source Pins. It never approves new creatives or retries uncertain writes.
 */
export async function recoverApprovedSourceSchedules(now = new Date()) {
  if (!Number.isFinite(+now)) throw Error("SOURCE_RECOVERY_DATE_INVALID");
  return prisma.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('growth-viral-portfolio-approval-v1'))`;
      const policy = await tx.growthActivity.findFirst({
        where: {
          entityType: SOURCE_RECOVERY_ENTITY,
          entityId: "global",
          action: SOURCE_RECOVERY_POLICY,
        },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      });
      const consent = policy?.summary as {
        enabled?: boolean;
        version?: number;
      } | null;
      if (
        consent?.enabled !== true ||
        consent.version !== 1 ||
        !policy?.actorUserId
      )
        return { status: "DISABLED", repaired: 0 };
      const owner = await tx.user.findUnique({
        where: { id: policy.actorUserId },
        select: { role: true },
      });
      if (owner?.role !== "ADMIN") return { status: "DISABLED", repaired: 0 };
      const checked = await tx.growthActivity.findFirst({
        where: {
          entityType: SOURCE_RECOVERY_ENTITY,
          entityId: "global",
          action: "SOURCE_SCHEDULE_RECOVERY_CHECKED",
        },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      });
      if (checked && +checked.createdAt > +now - CHECK_INTERVAL)
        return { status: "RECENTLY_CHECKED", repaired: 0 };
      await tx.$queryRaw`SELECT "id" FROM "GrowthSettings" WHERE "id" = 'global' FOR UPDATE`;
      const core = await tx.growthSettings.findUnique({
        where: { id: "global" },
        select: {
          enabled: true,
          attributionEnabled: true,
          workerActivationExpiresAt: true,
        },
      });
      const program = await tx.growthViralProgramSettings.findUnique({
        where: { id: "global" },
        select: { mode: true, maxPinsPerDay: true },
      });
      if (
        !core ||
        core.enabled ||
        core.attributionEnabled ||
        core.workerActivationExpiresAt ||
        program?.mode !== "ACTIVE" ||
        (await countBlockingGrowthJobs(tx)) !== 0
      )
        return { status: "BUSY", repaired: 0 };
      const rotation = await readDailyRotation(now, tx);
      if (!rotation.accountId || rotation.source <= 0)
        return { status: "NO_SOURCE_ALLOCATION", repaired: 0 };
      const today = new Date(now);
      today.setUTCHours(0, 0, 0, 0);
      const interval = { gte: today, lt: new Date(+today + DAY) };
      const [native, sources, pending, candidates, boards] = await Promise.all([
        tx.growthPinPublication.findMany({
          where: {
            OR: [{ scheduledAt: interval }, { publishedAt: interval }],
            status: { notIn: ["CANCELLED", "FAILED_TERMINAL"] },
          },
          select: { scheduledAt: true, publishedAt: true },
          take: 101,
        }),
        tx.growthViralPinTest.findMany({
          where: {
            channel: "SOURCE",
            status: { in: ACTIVE },
            OR: [{ scheduledAt: interval }, { publishedAt: interval }],
          },
          select: {
            id: true,
            status: true,
            scheduledAt: true,
            publishedAt: true,
          },
          take: 101,
        }),
        tx.growthApprovalRequest.findMany({
          where: {
            kind: { in: ["NATIVE_PIN", "SOURCE_PIN"] },
            status: "PENDING",
            expiresAt: { gt: now },
          },
          select: { kind: true, snapshot: true },
          take: 201,
        }),
        tx.growthViralPinTest.findMany({
          where: {
            channel: "SOURCE",
            accountId: rotation.accountId,
            status: "APPROVED",
            approvedById: policy.actorUserId,
            publishClaimAt: null,
            pinterestPinId: null,
            lastErrorCode: null,
            scheduledAt: { not: null, lt: new Date(+today + 30 * DAY) },
          },
          include: {
            concept: { select: { title: true, sourceUrl: true, status: true } },
          },
          orderBy: [{ scheduledAt: "asc" }, { id: "asc" }],
          take: 101,
        }),
        tx.growthPinterestBoard.findMany({
          where: { accountId: rotation.accountId, isActive: true },
          select: { id: true },
        }),
      ]);
      if (
        native.length > 100 ||
        sources.length > 100 ||
        pending.length > 200 ||
        candidates.length > 100
      )
        return { status: "INVENTORY_LIMIT", repaired: 0 };
      const reservations = pending.flatMap((row) => {
        const snapshot = row.snapshot as { scheduledAt?: string } | null;
        const time = new Date(snapshot?.scheduledAt || "");
        return time >= interval.gte && time < interval.lt
          ? [{ time, source: row.kind === "SOURCE_PIN" }]
          : [];
      });
      const cap = Math.min(5, program.maxPinsPerDay, rotation.targetPins);
      const allocatedNative = native.filter(
        (row) =>
          row.scheduledAt >= interval.gte && row.scheduledAt < interval.lt,
      ).length;
      let sourceCount = sources.filter(
        (row) =>
          row.scheduledAt &&
          row.scheduledAt >= interval.gte &&
          row.scheduledAt < interval.lt,
      ).length;
      let repaired = 0;
      const corrected = new Set<string>();
      const reservedSource = reservations.filter((row) => row.source).length;
      const occupied = (excludedId: string) => [
        ...native.flatMap((row) =>
          [row.scheduledAt, row.publishedAt].filter(
            (date): date is Date => !!date,
          ),
        ),
        ...sources
          .filter((row) => row.id !== excludedId && !corrected.has(row.id))
          .flatMap((row) =>
            [row.scheduledAt, row.publishedAt].filter(
              (date): date is Date => !!date,
            ),
          ),
        ...reservations.map((row) => row.time),
      ];
      for (const pin of candidates) {
        if (repaired >= 5) break;
        if (
          !pin.scheduledAt ||
          !pin.approvedAt ||
          !pin.publicationAttemptKey ||
          !pin.rightsVerified ||
          !pin.assetChecksum ||
          !pin.assetPublicPath ||
          !pin.title ||
          !pin.description ||
          !boards.some((board) => board.id === pin.boardId) ||
          pin.concept.status === "REJECTED"
        )
          continue;
        const rating = rateSourceTranslator(
          pin.concept.title,
          pin.concept.sourceUrl,
        );
        if (
          rating.decision === "WITHDRAW" ||
          pin.destinationUrl !== pin.concept.sourceUrl
        )
          continue;
        const sameDay =
          pin.scheduledAt >= interval.gte && pin.scheduledAt < interval.lt;
        const broken =
          pin.scheduledAt < now || !isSourceDispatchSlot(pin.scheduledAt);
        // Valid future commitments only move forward to fill today's deficit.
        if (sameDay && !broken) continue;
        if (
          !sameDay &&
          (sourceCount + reservedSource >= rotation.source ||
            allocatedNative + sourceCount + reservations.length >= cap)
        )
          continue;
        const floor = new Date(
          Math.max(
            +now + 15 * 60_000,
            +pin.approvedAt + (rating.suggestedDelayDays ?? 0) * DAY,
            +pin.createdAt + (rating.suggestedDelayDays ?? 0) * DAY,
          ),
        );
        const collisions = occupied(pin.id);
        const slot = sourceDispatchSlots(today, floor).find((time) =>
          collisions.every((date) => Math.abs(+date - +time) >= 90 * 60_000),
        );
        if (!slot) continue;
        // Approved snapshots stay immutable. Cancel the unclaimed original and
        // create a timing-only replacement atomically under the publisher lease lock.
        const changed = await tx.growthViralPinTest.updateMany({
          where: {
            id: pin.id,
            status: "APPROVED",
            publishClaimAt: null,
            pinterestPinId: null,
            lastErrorCode: null,
            publicationAttemptKey: pin.publicationAttemptKey,
          },
          data: { status: "CANCELLED" },
        });
        if (changed.count !== 1) throw Error("SOURCE_RECOVERY_CLAIM_RACE");
        const replacement = await tx.growthViralPinTest.create({
          data: {
            conceptId: pin.conceptId,
            channel: pin.channel,
            destinationUrl: pin.destinationUrl,
            designGenerationKind: pin.designGenerationKind,
            assetChecksum: pin.assetChecksum,
            assetPublicPath: pin.assetPublicPath,
            title: pin.title,
            description: pin.description,
            accountId: pin.accountId,
            boardId: pin.boardId,
            scheduledAt: slot,
            rightsVerified: pin.rightsVerified,
            status: "APPROVED",
            approvedAt: pin.approvedAt,
            approvedById: pin.approvedById,
            createdAt: pin.createdAt,
            publicationAttemptKey:
              "source-recovery:" +
              createHash("sha256")
                .update(pin.id + ":" + slot.toISOString())
                .digest("hex"),
          },
        });
        await tx.growthActivity.create({
          data: {
            actorKind: "SYSTEM",
            entityType: "GrowthViralPinTest",
            entityId: replacement.id,
            action: "SOURCE_SCHEDULE_REPAIRED",
            correlationKey: replacement.publicationAttemptKey,
            summary: {
              originalId: pin.id,
              previousScheduledAt: pin.scheduledAt.toISOString(),
              scheduledAt: slot.toISOString(),
              reason: broken
                ? "MISSED_OR_UNREACHABLE_SLOT"
                : "FILL_APPROVED_DAILY_SOURCE_SLOT",
              automatic: true,
              consentId: policy.id,
              publicationAttempted: false,
            },
          },
        });
        corrected.add(pin.id);
        sources.push({
          id: replacement.id,
          status: "APPROVED",
          scheduledAt: slot,
          publishedAt: null,
        });
        if (!sameDay) sourceCount++;
        repaired++;
      }
      const unresolved = sources.filter(
        (row) =>
          row.status === "APPROVED" &&
          !corrected.has(row.id) &&
          row.scheduledAt &&
          row.scheduledAt >= interval.gte &&
          row.scheduledAt < interval.lt &&
          (row.scheduledAt < now || !isSourceDispatchSlot(row.scheduledAt)),
      ).length;
      const missing = Math.max(
        0,
        rotation.source - sourceCount - reservedSource,
      );
      await tx.growthActivity.create({
        data: {
          actorKind: "SYSTEM",
          entityType: SOURCE_RECOVERY_ENTITY,
          entityId: "global",
          action: "SOURCE_SCHEDULE_RECOVERY_CHECKED",
          summary: {
            repaired,
            sourceAllocated: sourceCount,
            sourceTarget: rotation.source,
            status:
              unresolved || missing
                ? "WAITING_FOR_APPROVED_PIN_OR_SAFE_SLOT"
                : "HEALTHY",
            providerWrites: 0,
          },
        },
      });
      return {
        status: unresolved || missing ? "WAITING" : "HEALTHY",
        repaired,
      };
    },
    {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      timeout: 15_000,
    },
  );
}
