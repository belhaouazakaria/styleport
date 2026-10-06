import Link from "next/link";

import { AdminTopbar } from "@/components/admin/admin-topbar";
import { AttributionTools } from "@/components/admin/attribution-tools";
import { KpiCard } from "@/components/admin/kpi-card";
import { buttonVariants } from "@/components/ui/button";
import { requireAdminRoute } from "@/lib/auth";
import { getAttributionDashboard, type AttributionRangeDays } from "@/lib/growth/attribution/reporting";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

function formatDate(value: Date | null) {
  return value ? new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(value) : "Never";
}

export default async function GrowthAttributionPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireAdminRoute();
  const query = await searchParams;
  const rangeDays: AttributionRangeDays = query.range === "7" ? 7 : 30;
  const report = await getAttributionDashboard(rangeDays);

  return <>
    <AdminTopbar title="SayTwist attribution" subtitle="First-party Pinterest landing and trusted translation measurement." />
    <main className="space-y-6 p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link href="/admin/growth" className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>← Growth overview</Link>
        <form method="get"><select name="range" defaultValue={String(rangeDays)} className="rounded-xl border border-border px-3 py-2 text-sm"><option value="7">7 days</option><option value="30">30 days</option></select><button type="submit" className={cn(buttonVariants({ variant: "outline", size: "sm" }), "ml-2")}>Apply</button></form>
      </div>

      <section className="rounded-2xl border border-border bg-white p-5 text-sm leading-6">
        <p><strong>Collection:</strong> {report.collection.state.replaceAll("_", " ").toLowerCase()}</p>
        <p><strong>Server gate:</strong> {report.collection.environmentEnabled ? "Enabled" : "Disabled"} · <strong>Growth setting:</strong> {report.collection.settingEnabled ? "Enabled" : "Disabled"}</p>
        <p><strong>Model:</strong> {report.modelVersion} · <strong>Window:</strong> {report.collection.settings.attributionWindowDays} days · <strong>Detail retention:</strong> {report.collection.settings.attributionSessionRetentionDays}/{report.collection.settings.attributionEventRetentionDays} days</p>
        <p><strong>Latest ingest:</strong> {formatDate(report.latestIngestAt)}</p>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label="Attribution totals">
        <KpiCard label="Pinterest landing sessions" value={report.landingSessions.toLocaleString()} hint="Valid issued pin_ref sessions" />
        <KpiCard label="Attributed translations" value={report.attributedTranslations.toLocaleString()} hint="Trusted successful TranslationLog completions" />
        <KpiCard label="Qualified conversions" value={report.qualifiedConversions.toLocaleString()} hint="One maximum per attribution session" />
        <KpiCard label="Qualified conversion rate" value={`${report.qualifiedConversionRate.toFixed(2)}%`} hint="Qualified conversions ÷ landing sessions" />
      </section>

      <p className="rounded-2xl border border-brand-200 bg-brand-50 p-4 text-sm leading-6 text-brand-950">Existing Pins created before Phase 5 generally contain no <code>pin_ref</code> and cannot be deterministically connected to a SayTwist session. Their Phase 4 Pinterest analytics remain available. Pinterest outbound clicks are not treated as SayTwist sessions.</p>

      <AttributionTools pins={report.eligiblePins} />

      <section className="overflow-hidden rounded-2xl border border-border bg-white">
        <div className="p-5"><p className="section-kicker">Coverage</p><h2 className="font-display text-2xl font-bold text-ink">Top attribution dimensions</h2></div>
        <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="bg-muted/40"><tr><th className="p-3">Pin/ref</th><th className="p-3">Translator</th><th className="p-3">Landings</th><th className="p-3">Completions</th><th className="p-3">QPC</th></tr></thead><tbody>
          {report.topDimensions.map((row) => <tr key={`${row.publicRef}:${row.translatorLabel}`} className="border-t border-border"><td className="p-3"><p className="font-semibold">{row.pinLabel}</p><code className="text-xs text-muted-ink">{row.publicRef}</code></td><td className="p-3">{row.translatorLabel}</td><td className="p-3">{row.landingSessions}</td><td className="p-3">{row.attributedTranslations}</td><td className="p-3 font-bold">{row.qualifiedConversions}</td></tr>)}
          {!report.topDimensions.length ? <tr><td colSpan={5} className="p-5 text-muted-ink">No collected attribution aggregates in this range.</td></tr> : null}
        </tbody></table></div>
      </section>
    </main>
  </>;
}
