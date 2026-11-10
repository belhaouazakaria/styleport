import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";

const catalog = readFileSync("lib/growth/viral/store.ts", "utf8");
const prepare = readFileSync("lib/growth/viral/source-publishing.ts", "utf8");
const publisher = readFileSync("lib/growth/viral/source-publisher.ts", "utf8");
const admin = readFileSync("app/(admin)/admin/growth/viral/page.tsx", "utf8");
const panel = readFileSync("components/admin/growth-viral-intelligence-panel.tsx", "utf8");
const release = readFileSync("workers/coordinate-growth-nine-timer-source-rating-release.sh", "utf8");

describe("Source ratings are enforced at every publication boundary", () => {
  it("archives qualified, deferred and withdrawn concepts without a schema migration", () => {
    expect(catalog).toContain("rankSourceTranslators(topics");
    expect(catalog).toContain('rating.decision === "PRIORITY" ? "DISCOVERED"');
    expect(catalog).toContain('rating.decision === "SCHEDULE_LATER" ? "REVIEW" : "REJECTED"');
    expect(catalog).toContain("SOURCE_RATING_VERSION");
    expect(catalog).toContain("qualityCounts");
    expect(catalog).toContain("pinsPublished: 0");
    expect(catalog).not.toContain("createPinterestPin");
  });

  it("blocks withdrawn drafts and defers lower-ranked approvals", () => {
    expect(prepare).toContain('rateSourceTranslator(concept.title, concept.sourceUrl)');
    expect(prepare).toContain('concept.status === "REJECTED"');
    expect(prepare).toContain("SOURCE_DRAFT_QUALITY_WITHDRAWN");
    expect(prepare).toContain("SOURCE_APPROVAL_QUALITY_WITHDRAWN");
    expect(prepare).toContain("SOURCE_APPROVAL_QUALITY_DEFERRED");
    expect(prepare).toContain("rating.suggestedDelayDays");
    expect(prepare).toContain("SOURCE_RATING_VERSION");
    expect(prepare).toContain("$executeRaw(Prisma.sql");
    expect(prepare).not.toContain('$queryRawUnsafe(');
    expect(prepare).toContain('confirmation: true');
  });

  it("publisher skips withdrawn concepts, prioritizes due best and preserves exact owner approval", () => {
    expect(publisher).toContain('concept: { select: { sourceUrl: true, title: true, status: true } }');
    expect(publisher).toContain('item.rating.decision !== "WITHDRAW"');
    expect(publisher).toContain('item.row.concept.status !== "REJECTED"');
    expect(publisher).toContain("b.rating.score - a.rating.score");
    expect(publisher).toContain("item.row.approvedAt");
    expect(publisher).toContain("test.approvedById");
    expect(publisher).toContain("test.publicationAttemptKey");
    expect(publisher).toContain("revokeGrowthWorkerActivation(deadline)");
  });

  it("admin orders and displays scored topics, but only permits eligible creative requests", () => {
    expect(admin).toContain("rankSourceTranslators(concepts)");
    expect(admin).toContain("topic.rating.score");
    expect(admin).toContain("Suggested in");
    expect(panel).toContain('selectedRating?.decision === "WITHDRAW"');
    expect(panel).toContain("selectedRating.suggestedDelayDays");
    expect(panel).toContain("score: number");
  });

  it("keeps existing nine release timers and 35 migrations protected", () => {
    execFileSync("bash", ["-n", "workers/coordinate-growth-nine-timer-source-rating-release.sh"]);
    expect(release).toContain('[[ "$OLD" == 6ce3e5b5711f12677a04f588f942c4a003d376cd ]] || fail');
    expect(release).toContain("STATE=/etc/saytwist-growth-nine-source-rating-release-state");
    expect(release).toContain("bool_and(mode='REVIEW')");
    expect(release).toContain("saytwist-growth-viral-source.timer");
    expect(release.match(/count_migrations saytwist\)" == 35/g)?.length).toBe(3);
    expect(release).toContain("GROWTH_NINE_RELEASE_APPROVAL");
    expect(release).toContain("GROWTH_NINE_RESTORE=PASSED");
  });
});
