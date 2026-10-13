import type { IndexingExclusionReasonCode } from "@/lib/indexing-eligibility";

export interface TranslatorIndexingImpactRow {
  slug: string;
  url: string;
  deployedBaselineIndexable: boolean;
  deployedBaselineRobotsIndexable: boolean;
  newVersionIndexable: boolean;
  strictReviewIndexable: boolean;
  currentVersionReviewed: boolean;
  newVersionExclusionReasonCodes: IndexingExclusionReasonCode[];
  strictReviewExclusionReasonCodes: IndexingExclusionReasonCode[];
  reasonDetails: string[];
}

type AffectedUrl = TranslatorIndexingImpactRow & {
  reasonCodes: IndexingExclusionReasonCode[];
};

function affected(
  rows: TranslatorIndexingImpactRow[],
  predicate: (row: TranslatorIndexingImpactRow) => boolean,
  reasons: (row: TranslatorIndexingImpactRow) => IndexingExclusionReasonCode[],
): AffectedUrl[] {
  return rows.filter(predicate).map((row) => ({ ...row, reasonCodes: reasons(row) }));
}

function countReasons(rows: AffectedUrl[]) {
  return rows.reduce<Record<string, number>>((counts, row) => {
    for (const code of row.reasonCodes) counts[code] = (counts[code] || 0) + 1;
    return counts;
  }, {});
}

export function buildTranslatorIndexingImpactReport(rows: TranslatorIndexingImpactRow[]) {
  const lostBetweenDeployedAndNew = affected(
    rows,
    (row) => row.deployedBaselineIndexable && !row.newVersionIndexable,
    (row) => row.newVersionExclusionReasonCodes,
  );
  const gainedBetweenDeployedAndNew = affected(
    rows,
    (row) => !row.deployedBaselineIndexable && row.newVersionIndexable,
    () => [],
  );
  const additionallyLostUnderStrictReview = affected(
    rows,
    (row) => row.newVersionIndexable && !row.strictReviewIndexable,
    (row) => row.strictReviewExclusionReasonCodes,
  );
  const publicRobotsMetadataChanges = rows
    .filter((row) => row.deployedBaselineRobotsIndexable !== row.newVersionIndexable)
    .map((row) => ({
      url: row.url,
      deployedIndex: row.deployedBaselineRobotsIndexable,
      newVersionIndex: row.newVersionIndexable,
    }));

  return {
    totals: {
      activePublicTranslatorUrls: rows.length,
      deployedBaselineIndexable: rows.filter((row) => row.deployedBaselineIndexable).length,
      newVersionIndexable: rows.filter((row) => row.newVersionIndexable).length,
      strictReviewIndexable: rows.filter((row) => row.strictReviewIndexable).length,
    },
    changes: {
      rolloutChangesPublicRobotsMetadata: publicRobotsMetadataChanges.length > 0,
      rolloutChangesSitemapMembership:
        lostBetweenDeployedAndNew.length > 0 || gainedBetweenDeployedAndNew.length > 0,
      publicRobotsMetadataChanges,
      lostBetweenDeployedAndNew,
      gainedBetweenDeployedAndNew,
      additionallyLostUnderStrictReview,
    },
    exclusionReasonCounts: {
      lostBetweenDeployedAndNew: countReasons(lostBetweenDeployedAndNew),
      additionallyLostUnderStrictReview: countReasons(additionallyLostUnderStrictReview),
    },
  };
}
