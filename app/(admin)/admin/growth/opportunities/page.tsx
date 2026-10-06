import Link from "next/link";
import { AdminTopbar } from "@/components/admin/admin-topbar";
import { OpportunityAnalysisButton } from "@/components/admin/opportunity-analysis-button";
import { KpiCard } from "@/components/admin/kpi-card";
import { buttonVariants } from "@/components/ui/button";
import { requireAdminRoute } from "@/lib/auth";
import { getOpportunityDashboard } from "@/lib/growth/opportunity/reporting";
import { cn } from "@/lib/utils";
export const dynamic = "force-dynamic";
const label = (v: string) => v.replaceAll("_", " ").toLowerCase();
export default async function GrowthOpportunitiesPage() {
  await requireAdminRoute();
  const report = await getOpportunityDashboard();
  return (
    <>
      <AdminTopbar
        title="Growth opportunities"
        subtitle="Deterministic opportunity intelligence from bounded, locally persisted evidence."
      />
      <main className="space-y-6 p-4 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link
            href="/admin/growth"
            className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
          >
            ← Growth overview
          </Link>
          <OpportunityAnalysisButton />
        </div>
        <section className="border-brand-200 bg-brand-50 text-brand-950 rounded-2xl border p-4 text-sm leading-6">
          Analysis reads at most 500 eligible Pins and 28 complete UTC days. It
          makes no Pinterest API call, uses no AI, and cannot publish or mutate
          Pinterest resources.
        </section>
        {report.latestRun ? (
          <>
            <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <KpiCard
                label="Evidence quality"
                value={label(report.latestRun.evidenceQuality)}
                hint={`${report.latestRun.pinsConsidered}/${report.latestRun.pinCap} Pin cap`}
              />
              <KpiCard
                label="Clusters"
                value={String(report.latestRun.clustersProduced)}
                hint="Deterministic lexical groups"
              />
              <KpiCard
                label="Opportunities"
                value={String(report.latestRun.opportunitiesProduced)}
                hint="Advisory only"
              />
              <KpiCard
                label="Attribution"
                value={label(report.latestRun.attributionCollection)}
                hint="Missing QPC is not zero"
              />
            </section>
            <section className="border-border overflow-hidden rounded-2xl border bg-white">
              <div className="p-5">
                <h2 className="font-display text-ink text-2xl font-bold">
                  Pin-level signals
                </h2>
                <p className="text-muted-ink text-sm">
                  Observed winner, rising, and fatigue signals. A signal does
                  not automatically become a cluster opportunity.
                </p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-muted/40">
                    <tr>
                      <th className="p-3">Signal</th>
                      <th className="p-3">Pin</th>
                      <th className="p-3">Cluster context</th>
                      <th className="p-3">Strength</th>
                      <th className="p-3">Confidence</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.pinSignals.map((signal) => (
                      <tr key={signal.id} className="border-border border-t">
                        <td className="p-3">{label(signal.type)}</td>
                        <td className="p-3 font-semibold">
                          {signal.pin?.title || signal.pinterestPinId}
                        </td>
                        <td className="p-3">
                          {signal.cluster?.name || "Unclustered"}
                        </td>
                        <td className="p-3">{label(signal.strength)}</td>
                        <td className="p-3">{signal.confidence}%</td>
                      </tr>
                    ))}
                    {!report.pinSignals.length ? (
                      <tr>
                        <td colSpan={5} className="text-muted-ink p-5">
                          No Pin-level winner, rising, or fatigue signal met the
                          deterministic thresholds.
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </section>
            <section className="border-border overflow-hidden rounded-2xl border bg-white">
              <div className="p-5">
                <h2 className="font-display text-ink text-2xl font-bold">
                  Ranked opportunities
                </h2>
                <p className="text-muted-ink text-sm">
                  Window{" "}
                  {report.latestRun.evidenceWindowStart
                    .toISOString()
                    .slice(0, 10)}{" "}
                  through{" "}
                  {report.latestRun.evidenceWindowEnd
                    .toISOString()
                    .slice(0, 10)}
                </p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-muted/40">
                    <tr>
                      <th className="p-3">Type</th>
                      <th className="p-3">Cluster</th>
                      <th className="p-3">Score</th>
                      <th className="p-3">Confidence</th>
                      <th className="p-3">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.opportunities.map((o) => (
                      <tr key={o.id} className="border-border border-t">
                        <td className="p-3">{label(o.type)}</td>
                        <td className="p-3 font-semibold">
                          {o.cluster?.name || "Unknown"}
                        </td>
                        <td className="p-3">{o.score}</td>
                        <td className="p-3">{o.confidence}%</td>
                        <td className="p-3">{label(o.status)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        ) : (
          <section className="border-border rounded-2xl border border-dashed bg-white p-6 text-sm">
            No opportunity analysis has been persisted. Queue a bounded worker
            job to create the first report.
          </section>
        )}
      </main>
    </>
  );
}
