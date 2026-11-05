import Link from "next/link";

import { AdminTopbar } from "@/components/admin/admin-topbar";
import { MarketResearchPanel } from "@/components/admin/market-research-panel";
import { requireAdminRoute } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function GrowthMarketResearchPage() {
  await requireAdminRoute();
  const enabled = process.env.GROWTH_MARKET_RESEARCH_ENABLED === "true" &&
    process.env.GROWTH_PINTEREST_TRENDS_ACCESS_APPROVED === "true";
  const previous = await prisma.growthActivity.findMany({
    where: { entityType: "GrowthMarketResearch",
      action: "MARKET_DISCOVERY_REVIEW_READY" },
    orderBy: { createdAt: "desc" }, take: 5,
    select: { id: true, createdAt: true, summary: true },
  });
  return (
    <>
      <AdminTopbar
        title="External market discovery"
        subtitle="Find underserved language topics beyond existing Pinterest inventory."
      />
      <main className="mx-auto max-w-5xl space-y-5 p-4 sm:p-6">
        <Link href="/admin/growth"
          className="text-sm font-semibold text-brand-600 hover:underline">
          Back to Growth
        </Link>
        <MarketResearchPanel enabled={enabled}/>
        <section className="rounded-2xl border border-border bg-white p-5">
          <h2 className="font-display text-xl font-bold text-ink">
            Recent archived research
          </h2>
          {previous.length === 0 ? (
            <p className="mt-2 text-sm text-muted-ink">
              No external market scans archived yet.
            </p>
          ) : (
            <div className="mt-3 space-y-3">
              {previous.map(x => {
                const summary = x.summary && typeof x.summary === "object" &&
                  !Array.isArray(x.summary) ? x.summary : {};
                return (
                  <div key={x.id} className="rounded-lg border border-border p-3">
                    <p className="text-sm font-semibold text-ink">
                      {x.createdAt.toISOString().slice(0, 16).replace("T", " ")} UTC
                    </p>
                    <p className="mt-1 text-xs text-muted-ink">
                      {typeof summary.inspected === "number" ? summary.inspected : 0}
                      {" "}source trends inspected ·
                      {" "}{Array.isArray(summary.signals) ? summary.signals.length : 0}
                      {" "}review suggestions saved
                    </p>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </main>
    </>
  );
}
