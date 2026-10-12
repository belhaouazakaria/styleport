import { getTranslatorIndexingImpactReport } from "@/lib/data/translators";
import { prisma } from "@/lib/prisma";

async function main() {
  const rows = await getTranslatorIndexingImpactReport();
  const removedByStrictReview = rows.filter((row) => row.currentlyIndexable && !row.strictIndexable);
  console.log(JSON.stringify({
    generatedAt: new Date().toISOString(),
    readOnly: true,
    activePublicTranslators: rows.length,
    currentlyIndexable: rows.filter((row) => row.currentlyIndexable).length,
    strictCurrentReviewIndexable: rows.filter((row) => row.strictIndexable).length,
    wouldLoseEligibilityCount: removedByStrictReview.length,
    wouldLoseEligibility: removedByStrictReview,
  }, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
