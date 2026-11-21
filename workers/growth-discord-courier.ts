import { recoverApprovedSourceSchedules } from "@/lib/growth/viral/source-schedule-recovery";
import { readFileSync } from "node:fs";
import { prisma } from "@/lib/prisma";
import { getDiscordConfig } from "@/lib/growth/discord/config";
import {
  preparePendingOwnerReviews,
  expireGrowthReviews,
} from "@/lib/growth/approvals/service";
import { runDiscordOutbox } from "@/lib/growth/discord/outbox";

export async function runGrowthDiscordCourier() {
  const sha = process.env.EXPECTED_RELEASE || "";
  if (
    process.env.GROWTH_DISCORD_COURIER_ENABLED !== "true" ||
    !/^[a-f0-9]{40}$/.test(sha) ||
    readFileSync(".deployed-release", "utf8").trim() !== sha
  )
    throw Error("DISCORD_COURIER_RELEASE_GUARD");
  const config = getDiscordConfig();
  const owner = await prisma.user.findUnique({
    where: { id: config.ownerUserId },
    select: { role: true },
  });
  if (owner?.role !== "ADMIN") throw Error("DISCORD_OWNER_NOT_ADMIN");
  let recoveryFailed = false;
  try {
    await recoverApprovedSourceSchedules();
  } catch {
    recoveryFailed = true;
  }
  await expireGrowthReviews();
  if (process.env.GROWTH_AUTOMATIC_REVIEW_PREPARATION_ENABLED === "true")
    await preparePendingOwnerReviews(config.ownerUserId);
  const result = await runDiscordOutbox(config);
  // Decisions and independent deliveries are already processed. Surface real
  // unresolved transport incidents to systemd's independent alert channel.
  const incidents = await prisma.growthNotification.count({
    where: {
      status: { in: ["UNKNOWN", "DEAD"] },
      attemptedAt: { gte: new Date(Date.now() - 24 * 3600000) },
      OR: [
        { lastErrorCode: null },
        { lastErrorCode: { not: "REVIEW_CLOSED_BEFORE_DELIVERY" } },
      ],
    },
  });
  if (incidents) throw Error("DISCORD_DELIVERY_REQUIRES_RECONCILIATION");
  if (recoveryFailed) throw Error("SOURCE_SCHEDULE_RECOVERY_FAILED");
  return result;
}
if (process.env.GROWTH_DISCORD_COURIER_ENTRYPOINT === "true") {
  runGrowthDiscordCourier()
    .then((result) =>
      console.log("GROWTH_DISCORD_COURIER=" + JSON.stringify(result)),
    )
    .catch(() => {
      console.error("GROWTH_DISCORD_COURIER=BLOCKED");
      process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
}
