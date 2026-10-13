import { describe, expect, it } from "vitest";

import { buildTranslatorIndexingImpactReport } from "@/lib/indexing-impact-report";
import type { TranslatorIndexingImpactRow } from "@/lib/indexing-impact-report";

function row(
  slug: string,
  overrides: Partial<TranslatorIndexingImpactRow> = {},
): TranslatorIndexingImpactRow {
  return {
    slug,
    url: `https://saytwist.com/translators/${slug}`,
    deployedBaselineIndexable: true,
    deployedBaselineRobotsIndexable: true,
    newVersionIndexable: true,
    strictReviewIndexable: true,
    currentVersionReviewed: true,
    newVersionExclusionReasonCodes: [],
    strictReviewExclusionReasonCodes: [],
    reasonDetails: [],
    ...overrides,
  };
}

describe("production translator indexing impact comparison", () => {
  it("reports deployed-to-new losses, gains, strict losses, and reason aggregates", () => {
    const report = buildTranslatorIndexingImpactReport([
      row("lost", {
        deployedBaselineRobotsIndexable: false,
        newVersionIndexable: false,
        strictReviewIndexable: false,
        currentVersionReviewed: false,
        newVersionExclusionReasonCodes: ["TECHNICAL_EDITORIAL_INCOMPLETE"],
        strictReviewExclusionReasonCodes: [
          "TECHNICAL_EDITORIAL_INCOMPLETE",
          "CURRENT_EDITORIAL_NOT_REVIEWED",
        ],
      }),
      row("strict-loss", {
        strictReviewIndexable: false,
        currentVersionReviewed: false,
        strictReviewExclusionReasonCodes: ["CURRENT_EDITORIAL_NOT_REVIEWED"],
      }),
      row("retained"),
      row("gained", {
        deployedBaselineIndexable: false,
        deployedBaselineRobotsIndexable: false,
      }),
    ]);

    expect(report.totals).toEqual({
      activePublicTranslatorUrls: 4,
      deployedBaselineIndexable: 3,
      newVersionIndexable: 3,
      strictReviewIndexable: 2,
    });
    expect(report.changes.lostBetweenDeployedAndNew.map((item) => item.url)).toEqual([
      "https://saytwist.com/translators/lost",
    ]);
    expect(report.changes.gainedBetweenDeployedAndNew.map((item) => item.url)).toEqual([
      "https://saytwist.com/translators/gained",
    ]);
    expect(report.changes.additionallyLostUnderStrictReview.map((item) => item.url)).toEqual([
      "https://saytwist.com/translators/strict-loss",
    ]);
    expect(report.exclusionReasonCounts).toEqual({
      lostBetweenDeployedAndNew: { TECHNICAL_EDITORIAL_INCOMPLETE: 1 },
      additionallyLostUnderStrictReview: { CURRENT_EDITORIAL_NOT_REVIEWED: 1 },
    });
    expect(report.changes.rolloutChangesSitemapMembership).toBe(true);
    expect(report.changes.rolloutChangesPublicRobotsMetadata).toBe(true);
  });

  it("reports sitemap removal without claiming a robots metadata change", () => {
    const report = buildTranslatorIndexingImpactReport([
      row("indexable"),
      row("already-noindex", {
        deployedBaselineRobotsIndexable: false,
        newVersionIndexable: false,
        strictReviewIndexable: false,
        newVersionExclusionReasonCodes: ["TECHNICAL_EDITORIAL_INCOMPLETE"],
        strictReviewExclusionReasonCodes: ["TECHNICAL_EDITORIAL_INCOMPLETE"],
      }),
    ]);

    expect(report.changes.rolloutChangesPublicRobotsMetadata).toBe(false);
    expect(report.changes.rolloutChangesSitemapMembership).toBe(true);
    expect(report.changes.publicRobotsMetadataChanges).toEqual([]);
  });

  it("reports no changes when deployed and proposed membership and metadata agree", () => {
    const report = buildTranslatorIndexingImpactReport([row("retained")]);

    expect(report.changes.rolloutChangesPublicRobotsMetadata).toBe(false);
    expect(report.changes.rolloutChangesSitemapMembership).toBe(false);
    expect(report.changes.lostBetweenDeployedAndNew).toEqual([]);
    expect(report.changes.gainedBetweenDeployedAndNew).toEqual([]);
    expect(report.changes.additionallyLostUnderStrictReview).toEqual([]);
  });
});
