/* eslint-disable @next/next/no-img-element */
import Link from "next/link";

import { AdminTopbar } from "@/components/admin/admin-topbar";
import { GrowthAnalyticsSyncButton } from "@/components/admin/growth-analytics-sync-button";
import { KpiCard } from "@/components/admin/kpi-card";
import { Button, buttonVariants } from "@/components/ui/button";
import { requireAdminRoute } from "@/lib/auth";
import { getPinterestAnalyticsDashboard, type PinterestAnalyticsRangeDays } from "@/lib/growth/pinterest/reporting";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

function display(value: bigint) { return value.toLocaleString(); }
function safeExternalUrl(value: string | null) {
  if (!value) return null;
  try { const url = new URL(value); return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null; } catch { return null; }
}
function formatDate(value: Date | null | undefined) {
  return value ? new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(value) : "Never";
}

export default async function GrowthAnalyticsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireAdminRoute();
  const query = await searchParams;
  const rangeDays: PinterestAnalyticsRangeDays = query.range === "7" ? 7 : query.range === "90" ? 90 : 30;
  const accountId = typeof query.account === "string" ? query.account : undefined;
  const search = typeof query.q === "string" ? query.q.slice(0, 100) : undefined;
  const report = await getPinterestAnalyticsDashboard({ accountId, rangeDays, search });
  const totals = report.totals;
  const ctr = totals.impressions === BigInt(0) ? 0 : Number((totals.outboundClicks * BigInt(10_000)) / totals.impressions) / 100;

  return <>
    <AdminTopbar title="Pinterest analytics" subtitle="Read-only organic account and Pin performance stored in PostgreSQL." />
    <main className="space-y-6 p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link href="/admin/growth" className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>← Growth overview</Link>
        {report.selected ? <GrowthAnalyticsSyncButton accountId={report.selected.id} /> : null}
      </div>
      {!report.selected ? <p className="rounded-2xl border border-dashed border-border p-6 text-muted-ink">Connect a Pinterest account before synchronizing analytics.</p> : <>
        <form className="grid gap-3 rounded-2xl border border-border bg-white p-4 sm:grid-cols-[1fr_auto_1fr_auto]" method="get">
          <select name="account" defaultValue={report.selected.id} className="rounded-xl border border-border px-3 py-2">
            {report.accounts.map((account) => <option key={account.id} value={account.id}>@{account.username}</option>)}
          </select>
          <select name="range" defaultValue={String(rangeDays)} className="rounded-xl border border-border px-3 py-2">
            <option value="7">7 days</option><option value="30">30 days</option><option value="90">90 days</option>
          </select>
          <input name="q" defaultValue={search} maxLength={100} placeholder="Search Pin title or ID" className="rounded-xl border border-border px-3 py-2" />
          <Button type="submit" variant="outline">Apply</Button>
        </form>
        <div className="rounded-2xl border border-border bg-white p-4 text-sm">
          <strong>Freshness:</strong> {report.freshnessStatus} · Last successful retrieval {formatDate(report.selected.analyticsState?.lastSuccessfulSyncAt)} · {report.pinCount} active Pins inventoried
          {report.selected.analyticsState?.lastError ? <p className="mt-2 text-red-700">{report.selected.analyticsState.lastError}</p> : null}
        </div>
        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5" aria-label="Pinterest totals">
          <KpiCard label="Impressions" value={display(totals.impressions)} />
          <KpiCard label="Saves" value={display(totals.saves)} />
          <KpiCard label="Pin clicks" value={display(totals.pinClicks)} />
          <KpiCard label="Outbound clicks" value={display(totals.outboundClicks)} />
          <KpiCard label="Outbound CTR" value={`${ctr.toFixed(2)}%`} hint="Outbound clicks ÷ impressions" />
        </section>
        <section className="overflow-hidden rounded-2xl border border-border bg-white">
          <div className="p-5"><p className="section-kicker">Daily trend</p><h2 className="font-display text-2xl font-bold text-ink">Account performance</h2></div>
          <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="bg-muted/40"><tr><th className="p-3">Date</th><th className="p-3">Impressions</th><th className="p-3">Saves</th><th className="p-3">Pin clicks</th><th className="p-3">Outbound clicks</th><th className="p-3">Status</th></tr></thead><tbody>
            {report.trend.map((row) => <tr key={row.date} className="border-t border-border"><td className="p-3">{row.date}</td><td className="p-3">{display(row.impressions)}</td><td className="p-3">{display(row.saves)}</td><td className="p-3">{display(row.pinClicks)}</td><td className="p-3 font-bold">{display(row.outboundClicks)}</td><td className="p-3">{row.dataStatus}</td></tr>)}
          </tbody></table></div>
        </section>
        <section className="overflow-hidden rounded-2xl border border-border bg-white">
          <div className="p-5"><p className="section-kicker">Pins</p><h2 className="font-display text-2xl font-bold text-ink">Ranked by outbound clicks</h2><p className="text-sm text-muted-ink">Up to 50 Pins in the selected range. Pinterest clicks do not represent SayTwist visits or conversions.</p></div>
          <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="bg-muted/40"><tr><th className="p-3">Pin</th><th className="p-3">Board</th><th className="p-3">Published</th><th className="p-3">Impressions</th><th className="p-3">Saves</th><th className="p-3">Pin clicks</th><th className="p-3">Outbound</th><th className="p-3">CTR</th><th className="p-3">Synced</th></tr></thead><tbody>
            {report.pins.map((pin) => { const destination = safeExternalUrl(pin.destinationUrl); return <tr key={pin.id} className="border-t border-border align-top"><td className="p-3"><div className="flex min-w-56 gap-3">{pin.previewImageUrl ? <img src={pin.previewImageUrl} alt="" width={48} height={48} className="h-12 w-12 rounded-lg object-cover" /> : null}<div><p className="font-semibold">{pin.title || `Pin ${pin.pinterestPinId}`}</p>{destination ? <a href={destination} target="_blank" rel="noreferrer" className="text-brand-700 underline">Destination</a> : null}</div></div></td><td className="p-3">{pin.board?.name || "—"}</td><td className="p-3">{pin.publishedAt?.toISOString().slice(0, 10) || "—"}</td><td className="p-3">{display(pin.impressions)}</td><td className="p-3">{display(pin.saves)}</td><td className="p-3">{display(pin.pinClicks)}</td><td className="p-3 font-bold">{display(pin.outboundClicks)}</td><td className="p-3">{pin.outboundClickRate.toFixed(2)}%</td><td className="p-3">{formatDate(pin.lastAnalyticsSyncAt)}</td></tr>; })}
          </tbody></table></div>
        </section>
      </>}
    </main>
  </>;
}
