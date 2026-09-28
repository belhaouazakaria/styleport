import { maybeRecalculateAutoFeaturedTranslators } from "@/lib/data/translators";
import { prisma } from "@/lib/prisma";

async function main() {
  console.log("[featured-recalculation] Starting daily featured translator recalculation.");

  await maybeRecalculateAutoFeaturedTranslators("daily-featured-recalculation");

  console.log("[featured-recalculation] Completed successfully.");
}

main()
  .catch((error) => {
    console.error("[featured-recalculation] Failed.", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
