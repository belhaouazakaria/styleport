import Link from "next/link";
import { AdminTopbar } from "@/components/admin/admin-topbar";
import { GrowthViralIntelligencePanel } from "@/components/admin/growth-viral-intelligence-panel";
import { requireAdminRoute } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { DEFAULT_VIRAL_PORTFOLIO_POLICY } from "@/lib/growth/viral/portfolio";

export const dynamic = "force-dynamic";

export default async function ViralGrowthPage() {
  await requireAdminRoute();
  const [settings, concepts, pinTests, proposals] = await Promise.all([
    prisma.growthViralProgramSettings.findUnique({ where: { id: "global" } }),
    prisma.growthViralConcept.findMany({
      orderBy: { lastSeenAt: "desc" }, take: 40,
      select: { id: true, title: true, sourceUrl: true,
        status: true, rightsVerified: true, linkedTranslatorId: true },
    }),
    prisma.growthViralPinTest.count(),
    prisma.growthViralNicheProposal.count(),
  ]);
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
        <GrowthViralIntelligencePanel initialPolicy={policy}/>
        <section className="rounded-2xl border border-border bg-white p-5">
          <h2 className="font-display text-xl font-bold text-ink">
            Public-source translator concepts
          </h2>
          <p className="mt-2 text-sm text-muted-ink">
            {concepts.length} recently seen topics · {pinTests} tracked Pin tests ·
            {" "}{proposals} related-niche proposals. No third-party images,
            descriptions or prompts are imported.
          </p>
          {concepts.length === 0 ? (
            <p className="mt-4 text-sm text-muted-ink">
              No discovered concepts. Enable review mode and run one bounded catalog scan.
            </p>
          ) : (
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {concepts.map(topic => (
                <article key={topic.id} className="rounded-xl border border-border p-3">
                  <p className="font-medium text-ink">{topic.title}</p>
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
