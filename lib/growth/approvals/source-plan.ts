import { sourceUsesGenZ } from "@/lib/growth/creative/genz-account-scope";
import { prisma } from "@/lib/prisma";
import { readDailyRotation } from "@/lib/growth/portfolio/daily-rotation-store";
import { recommendReviewSchedule } from "./scheduling";
import { createSourcePinReview } from "./service";

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
    const words = new Set(
      (draft.title.toLowerCase().match(/[a-z]{3,}/g) || []).filter(
        (w) => !["translator", "saytwist", "the", "and"].includes(w),
      ),
    );
    const ranked = boards
      .map((board) => ({
        board,
        score: [...words].filter((w) =>
          (board.name + " " + board.description)
            .toLowerCase()
            .split(/[^a-z]+/)
            .includes(w),
        ).length,
      }))
      .sort(
        (a, b) => b.score - a.score || a.board.id.localeCompare(b.board.id),
      );
    // This is only a proposed review, never approval. Prefer a unique board
    // explicitly named for Translators for main-account Translator spotlights.
    const translatorBoards = mainOnly ? ranked.filter(r => /^translators$/i.test(r.board.name.trim())) : [];
    if (translatorBoards.length === 1) { const preferred = translatorBoards[0]; ranked.splice(ranked.indexOf(preferred), 1); ranked.unshift(preferred); }
    if (
      translatorBoards.length !== 1 && boards.length > 1 &&
      (ranked[0].score === 0 || ranked[0].score === ranked[1].score)
    )
      continue;
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
        boardId: ranked[0].board.id,
        scheduledAt: scheduledAt.toISOString(),
      },
      ownerUserId,
      now,
    );
  }
  throw Error("SOURCE_REVIEW_NO_ELIGIBLE_BOARD_OR_SLOT");
}
