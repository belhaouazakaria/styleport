import { readFileSync } from "node:fs";
import { prisma } from "@/lib/prisma";
import { runGrowthV2Intelligence } from "@/lib/growth/operations/v2-intelligence";
export async function runVerifiedGrowthIntelligence() {
  const sha = process.env.EXPECTED_RELEASE || "";
  if (
    process.env.GROWTH_V2_INTELLIGENCE_ENABLED !== "true" ||
    !/^[a-f0-9]{40}$/.test(sha) ||
    readFileSync(".deployed-release", "utf8").trim() !== sha
  )
    throw Error("V2_RELEASE_GUARD");
  return runGrowthV2Intelligence();
}
if (process.env.GROWTH_V2_INTELLIGENCE_ENTRYPOINT === "true") {
  runVerifiedGrowthIntelligence()
    .then(() => console.log("GROWTH_V2_INTELLIGENCE=COMPLETED"))
    .catch(() => {
      console.error("GROWTH_V2_INTELLIGENCE=BLOCKED");
      process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
}
