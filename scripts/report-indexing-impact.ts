import { getTranslatorIndexingImpactReport } from "@/lib/data/translators";
import { buildTranslatorIndexingImpactReport } from "@/lib/indexing-impact-report";
import { prisma } from "@/lib/prisma";

async function main() {
  const environment = process.env.SEO_IMPACT_ENVIRONMENT?.trim();
  const deployedVersion = process.env.SEO_IMPACT_DEPLOYED_VERSION?.trim();
  const reportBaseUrlValue = process.env.SEO_IMPACT_BASE_URL?.trim();
  if (!environment || !deployedVersion || !reportBaseUrlValue) {
    throw new Error(
      "SEO_IMPACT_ENVIRONMENT, SEO_IMPACT_DEPLOYED_VERSION, and SEO_IMPACT_BASE_URL are required so the report cannot be mistaken for production evidence or emit URLs for the wrong origin.",
    );
  }
  const reportBaseUrl = new URL(reportBaseUrlValue);
  if (environment === "production" && reportBaseUrl.origin !== "https://saytwist.com") {
    throw new Error("Production impact reports must use SEO_IMPACT_BASE_URL=https://saytwist.com.");
  }

  const rows = await prisma.$transaction(async (transaction) => {
    await transaction.$executeRawUnsafe("SET TRANSACTION READ ONLY");
    return getTranslatorIndexingImpactReport(transaction, reportBaseUrl);
  });
  const comparison = buildTranslatorIndexingImpactReport(rows);

  console.log(JSON.stringify({
    schemaVersion: 2,
    generatedAt: new Date().toISOString(),
    readOnly: true,
    environment,
    deployedVersion,
    canonicalOrigin: reportBaseUrl.origin,
    dataSource: "DATABASE_URL",
    databaseSafety: "PostgreSQL transaction set to READ ONLY before the first query",
    definitions: {
      deployedBaselineIndexable: "Currently deployed sitemap rule: active, non-archived translator with a non-empty slug",
      deployedBaselineRobotsIndexable: "Currently deployed page metadata rule: editorial status is READY",
      newVersionIndexable: "Proposed branch sitemap and metadata rule: deployed baseline plus technical editorial completeness",
      strictReviewIndexable: "Future-only rule: new-version eligibility plus exact current-payload human review and stronger quality checks",
    },
    releaseApproval: "BLOCKED_PENDING_HUMAN_REVIEW_OF_PRODUCTION_IMPACT_REPORT",
    ...comparison,
  }, null, 2));
}

main()
  .catch((error) => {
    console.error(JSON.stringify({
      readOnly: true,
      error: error instanceof Error ? error.message : "Unknown report failure",
    }, null, 2));
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
