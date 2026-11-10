import Link from "next/link";
import { AdminTopbar } from "@/components/admin/admin-topbar";
import { GrowthViralIntelligencePanel } from "@/components/admin/growth-viral-intelligence-panel";
import { requireAdminRoute } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { DEFAULT_VIRAL_PORTFOLIO_POLICY } from "@/lib/growth/viral/portfolio";
import { rankSourceTranslators, SOURCE_RATING_VERSION } from "@/lib/growth/viral/rating";

export const dynamic = "force-dynamic";

export default async function ViralGrowthPage() {
  await requireAdminRoute();
  const [settings, concepts, pinTests, proposals, sourceDrafts, accounts, boards] = await Promise.all([
    prisma.growthViralProgramSettings.findUnique({ where: { id: "global" } }),
    prisma.growthViralConcept.findMany({
      orderBy: { lastSeenAt: "desc" }, take: 40,
      select: { id: true, title: true, sourceUrl: true,
        status: true, rightsVerified: true, linkedTranslatorId: true },
    }),
    prisma.growthViralPinTest.count(),
    prisma.growthViralNicheProposal.count(),
    prisma.growthViralPinTest.findMany({
      where: { channel: "SOURCE" }, orderBy: { createdAt: "desc" },
      take: 20, select: { id: true, title: true, status: true,
        assetPublicPath: true, destinationUrl: true, scheduledAt: true },
    }),
    prisma.growthPinterestAccount.findMany({
      where: { connectionStatus: "CONNECTED", apiEnvironment: "PRODUCTION" },
      select: { id: true, username: true }, take: 20,
    }),
    prisma.growthPinterestBoard.findMany({
      where: { isActive: true },
      select: { id: true, accountId: true, name: true }, take: 100,
    }),
  ]);
  const ranked = rankSourceTranslators(concepts);
  const priorityCount = ranked.filter(x => x.rating.decision === "PRIORITY").length;
  const deferCount = ranked.filter(x => x.rating.decision === "SCHEDULE_LATER").length;
  const withdrawnCount = ranked.filter(x => x.rating.decision === "WITHDRAW").length;
  const policy = settings ? {
    mode: settings.mode as "PAUSED" | "REVIEW" | "ACTIVE",
    sourceSharePercent: settings.sourceSharePercent,
    maxPinsPerDay: settings.maxPinsPerDay,
  } : DEFAULT_VIRAL_PORTFOLIO_POLICY;
  return (
    <>
      <AdminTopbar title="Viral Pin Intelligence"
        subtitle="Test translator demand before expanding original SayTwist content." />
      <main className="mx-auto max-w-5xl space-y-5 p-4 sm:p-6">
        <Link href="/admin/growth" className="text-sm font-semibold text-brand-600">
          Back to Growth
        </Link>
        <GrowthViralIntelligencePanel initialPolicy={policy}
          concepts={ranked.map(x => ({ id: x.id, title: x.title,
            score: x.rating.score, decision: x.rating.decision,
            suggestedDelayDays: x.rating.suggestedDelayDays }))}
          drafts={sourceDrafts.map(x => ({ id: x.id, title: x.title ?? "",
            status: x.status, assetPublicPath: x.assetPublicPath,
            destinationUrl: x.destinationUrl, scheduledAt: x.scheduledAt?.toISOString() ?? null }))}
          accounts={accounts} boards={boards}/>
        <section className="rounded-2xl border border-border bg-white p-5">
          <h2 className="font-display text-xl font-bold text-ink">
            Public-source translator concepts
          </h2>
          <p className="mt-2 text-sm text-muted-ink">
            {concepts.length} recently seen topics · {pinTests} tracked Pin tests ·
            {" "}{proposals} related-niche proposals. No third-party images,
            descriptions or prompts are imported.
          </p>
          <p className="mt-2 text-xs text-muted-ink">
            Editorial-fit ratings ({SOURCE_RATING_VERSION}, not popularity):
            {" "}{priorityCount} priority · {deferCount} schedule later ·
            {" "}{withdrawnCount} withdraw. Top-rated candidates appear first.
          </p>
          {concepts.length === 0 ? (
            <p className="mt-4 text-sm text-muted-ink">
              No discovered concepts. Enable review mode and run one bounded catalog scan.
            </p>
          ) : (
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {ranked.map(topic => (
                <article key={topic.id} className="rounded-xl border border-border p-3">
                  <p className="font-medium text-ink">{topic.title}</p>
                  <p className="mt-1 text-xs font-semibold text-ink">
                    {topic.rating.score}/100 · {topic.rating.decision === "PRIORITY" ?
                      "Priority" : topic.rating.decision === "SCHEDULE_LATER" ?
                      "Schedule later" : "Withdraw"}
                    {topic.rating.suggestedDelayDays ?
                      ` · Suggested in ${topic.rating.suggestedDelayDays} days` : ""}
                  </p>
                  <p className="mt-1 text-xs text-muted-ink">
                    {topic.status} · Rights {topic.rightsVerified ? "verified" : "not verified"}
                    {topic.linkedTranslatorId ? " · Linked to SayTwist" : ""}
                  </p>
                  <a href={topic.sourceUrl} target="_blank" rel="noopener noreferrer"
                    className="mt-2 inline-block text-xs font-semibold text-brand-600">
                    View original concept
                  </a>
                </article>
              ))}
            </div>
          )}
        </section>
      </main>
    </>
  );
}
