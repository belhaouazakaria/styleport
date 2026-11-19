import { sourceUsesGenZ } from "@/lib/growth/creative/genz-account-scope";
import { prisma } from "@/lib/prisma";
import { readDailyRotation } from "@/lib/growth/portfolio/daily-rotation-store";
import { recommendReviewSchedule } from "./scheduling";
import { createSourcePinReview } from "./service";
import { choosePinApprovalBoard } from "@/lib/growth/publishing/board-plan";

export async function prepareSourceReviewAutomatically(
  draftId: string,
  ownerUserId: string,
  now = new Date(),
) {
  const draft = await prisma.growthViralPinTest.findUniqueOrThrow({
    where: { id: draftId },
  });
  if (!draft.title || draft.status !== "PLANNED" || draft.channel !== "SOURCE")
    throw Error("SOURCE_REVIEW_NOT_PLANNED");
  const mainOnly = await sourceUsesGenZ(draft.id);
  for (let offset = 0; offset < 7; offset++) {
    const day = new Date(now.getTime() + offset * 86400000);
    const rotation = await readDailyRotation(day);
    if (!rotation.accountId || (mainOnly && rotation.publicationRole !== "SAYTWIST")) continue;
    const boards = await prisma.growthPinterestBoard.findMany({
      where: { accountId: rotation.accountId, isActive: true },
      select: { id: true, name: true, description: true },
      orderBy: { id: "asc" },
      take: 101,
    });
    if (!boards.length || boards.length > 100) continue;
    // Source concepts are all translator destinations. Prefer the account's
    // unique canonical Translator board before falling back to text relevance;
    // otherwise a generic source title can push the Pin to a later rotation day.
    const chosen = choosePinApprovalBoard({ boards, originalBoardId: null,
      destinationKind: "TRANSLATOR",
      candidateText: draft.title + " " + draft.description + " " + draft.destinationUrl });
    if (!chosen) continue;
    const scheduledAt = await recommendReviewSchedule(
      rotation.accountId,
      draft.id,
      "SOURCE",
      now,
    );
    return createSourcePinReview(
      {
        draftId,
        accountId: rotation.accountId,
        boardId: chosen.id,
        scheduledAt: scheduledAt.toISOString(),
      },
      ownerUserId,
      now,
    );
  }
  throw Error("SOURCE_REVIEW_NO_ELIGIBLE_BOARD_OR_SLOT");
}
