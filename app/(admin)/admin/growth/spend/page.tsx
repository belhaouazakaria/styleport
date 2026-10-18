import Link from "next/link";
import { AdminTopbar } from "@/components/admin/admin-topbar";
import { KpiCard } from "@/components/admin/kpi-card";
import { buttonVariants } from "@/components/ui/button";
import { requireAdminRoute } from "@/lib/auth";
import { getGrowthUsageInventory } from "@/lib/growth/economics/usage";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function GrowthSpendPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAdminRoute();
  const params = await searchParams;
  const days: 7 | 30 = params.range === "7" ? 7 : 30;
  const report = await getGrowthUsageInventory(days);

  return (
    <>
      <AdminTopbar title="Growth AI usage" subtitle="Historical provider usage inventory; cost ledger and budget enforcement are not yet active." />
      <main className="space-y-6 p-4 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link href="/admin/growth" className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
            ← Growth overview
          </Link>
          <form method="get">
            <select name="range" defaultValue={String(days)} className="rounded-xl border border-border px-3 py-2 text-sm">
              <option value="7">Last 7 days</option>
              <option value="30">Last 30 days</option>
            </select>
            <button type="submit" className={cn(buttonVariants({ variant: "outline", size: "sm" }), "ml-2")}>Apply</button>
          </form>
        </div>
        <section aria-label="AI usage" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <KpiCard label="Text model requests" value={report.textRequests.toLocaleString()} hint="Distinct persisted responses" />
          <KpiCard label="Image requests" value={report.imageRequests.toLocaleString()} hint={`${report.imageUnits} recorded image units`} />
          <KpiCard label="Input / output tokens" value={`${report.inputTokens.toLocaleString()} / ${report.outputTokens.toLocaleString()}`} hint={`${report.unknownTokenRecords} records lack complete token totals`} />
          <KpiCard label="Unpriced operations" value={report.unpricedRecords.toLocaleString()} hint="Unknown cost is not zero cost" />
        </section>
        <div className="rounded-2xl border border-border bg-white p-5 text-sm leading-6">
          <p className="font-bold text-ink">Cost accounting is not yet complete</p>
          <p className="text-muted-ink">
            This read-only inventory uses existing Growth metadata, not an append-only billing ledger.
            Reported image cost estimates total <strong>${report.knownImageEstimatesUsd.toFixed(4)} USD</strong> for
            records with provider estimates; this is neither total spend nor an invoice.
            Text model costs are unpriced. No budget enforcement, scheduling, or paid API action is triggered here.
            {report.truncated ? " The query reached its reporting cap and totals are incomplete." : ""}
          </p>
        </div>
        <section className="overflow-hidden rounded-2xl border border-border bg-white">
          <div className="p-5"><h2 className="font-display text-2xl font-bold text-ink">Recent AI usage evidence</h2></div>
          <div className="overflow-x-auto"><table className="w-full text-left text-sm">
            <thead className="bg-muted/40"><tr><th className="p-3">Date</th><th className="p-3">Kind</th><th className="p-3">Provider / model</th><th className="p-3">Tokens or image units</th><th className="p-3">Cost status</th></tr></thead>
            <tbody>
              {report.recent.map((row) => <tr key={`${row.kind}:${row.key}`} className="border-t border-border">
                <td className="p-3">{row.createdAt.toISOString().slice(0, 16).replace("T", " ")} UTC</td>
                <td className="p-3">{row.kind.replaceAll("_", " ")}</td>
                <td className="p-3">{row.provider} / {row.model}</td>
                <td className="p-3">{row.kind === "AI_IMAGE" ? `${row.imageUnits ?? "Unknown"} image units` : `${row.totalTokens ?? "Unknown"} tokens`}</td>
                <td className="p-3">{row.estimatedUsd === null ? "Unpriced" : `Estimated $${row.estimatedUsd.toFixed(4)}`}</td>
              </tr>)}
              {!report.recent.length && <tr><td colSpan={5} className="p-5 text-muted-ink">No AI usage metadata recorded in this window.</td></tr>}
            </tbody>
          </table></div>
        </section>
      </main>
    </>
  );
}
