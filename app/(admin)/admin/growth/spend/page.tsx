import Link from "next/link";
import { AdminTopbar } from "@/components/admin/admin-topbar";
import { KpiCard } from "@/components/admin/kpi-card";
import { buttonVariants } from "@/components/ui/button";
import { requireAdminRoute } from "@/lib/auth";
import { getGrowthUsageInventory } from "@/lib/growth/economics/usage";
import { getGrowthBudgetExposure } from "@/lib/growth/economics/exposure";
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
  const [report, exposure] = await Promise.all([getGrowthUsageInventory(days), getGrowthBudgetExposure()]);
  const asUsd = (cents: number) => `${(cents / 100).toFixed(2)}`;

  return (
    <>
      <AdminTopbar title="Growth AI economics" subtitle="Read-only reservation exposure and historical usage. Reserved ceilings are not actual billed costs." />
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
        <section aria-label="AI budget reservation exposure" className="space-y-4">
          <div className="rounded-2xl border border-border bg-white p-5 text-sm leading-6">
            <h2 className="font-display text-2xl font-bold text-ink">Growth budget reservations</h2>
            <p className="text-muted-ink">
              This is a read-only record of conservative budget ceilings and append-only API-response evidence,
              not actual OpenAI charges, settled expenses, invoices or payments.
              OpenAI call reservations are currently configured for strictly bounded supported Growth models only.
              {exposure.settingsProvisioned ? "" : " Growth settings have not been provisioned in this database."}
              {exposure.growthEnabled ? " Growth execution is enabled in the database; check independent rollout gates before any production work." : " Growth execution is disabled in the database."}
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <KpiCard label="Reserved today (UTC)" value={asUsd(exposure.dailyReservedCents)}
              hint={exposure.aiDailyBudgetCents === null ? "Daily budget unavailable" : `of ${asUsd(exposure.aiDailyBudgetCents)} cap · ${exposure.dailyPercent ?? "Unavailable"}% reserved`} />
            <KpiCard label="Reserved this month (UTC)" value={asUsd(exposure.monthlyReservedCents)}
              hint={exposure.aiMonthlyBudgetCents === null ? "Monthly budget unavailable" : `of ${asUsd(exposure.aiMonthlyBudgetCents)} cap · ${exposure.monthlyPercent ?? "Unavailable"}% reserved`} />
            <KpiCard label="Image reservations today" value={exposure.imagesReservedToday.toLocaleString()}
              hint={exposure.imageDailyCap === null ? "Daily image cap unavailable" : `of ${exposure.imageDailyCap} allowed`} />
            <KpiCard label="Not reconciled" value={exposure.outstandingReservations.toLocaleString()}
              hint="All historical reservation rows awaiting verified cost settlement" />
          </div>
          <div className="overflow-hidden rounded-2xl border border-border bg-white">
            <div className="p-5"><h3 className="font-display text-xl font-bold text-ink">Latest reserved AI attempts</h3></div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-muted/40"><tr>
                  <th className="p-3">UTC time</th><th className="p-3">Kind</th>
                  <th className="p-3">Model / pricing profile</th><th className="p-3">Reserved ceiling</th>
                  <th className="p-3">API response evidence</th>
                  <th className="p-3">Settlement</th>
                </tr></thead>
                <tbody>
                  {exposure.recent.map((row) => <tr key={row.id} className="border-t border-border">
                    <td className="p-3">{row.createdAt.toISOString().slice(0, 16).replace("T", " ")}</td>
                    <td className="p-3">{row.kind}</td>
                    <td className="p-3">{row.provider} / {row.model}<span className="block text-xs text-muted-ink">{row.pricingVersion}</span></td>
                    <td className="p-3">{asUsd(row.reservedCents)}</td>
                    <td className="p-3">
                      {row.usageEvidence?.outcome ?? "No response evidence"}
                      {row.usageEvidence?.inputTokens != null && row.usageEvidence?.outputTokens != null
                        ? <span className="block text-xs text-muted-ink">
                            {row.usageEvidence.inputTokens.toLocaleString()} input / {row.usageEvidence.outputTokens.toLocaleString()} output tokens
                          </span> : null}
                      {row.usageEvidence?.imageUnits != null
                        ? <span className="block text-xs text-muted-ink">{row.usageEvidence.imageUnits} image unit(s)</span> : null}
                      {row.usageEvidence?.estimatedMicroUsd != null
                        ? <span className="block text-xs text-muted-ink">
                            Unverified usage estimate: ${(Number(row.usageEvidence.estimatedMicroUsd) / 1_000_000).toFixed(6)}
                          </span> : null}
                    </td>
                    <td className="p-3">{row.status === "RECONCILED" && row.reconciledCents !== null
                      ? `Reconciled ${asUsd(row.reconciledCents)}`
                      : "Actual cost unverified"}</td>
                  </tr>)}
                  {!exposure.recent.length && <tr><td colSpan={6} className="p-5 text-muted-ink">No durable paid-AI reservations recorded.</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        </section>
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
            Historical text model costs are unpriced. The budget-reservation gate operates only on supported Growth AI call paths, and this screen is read-only.
            It does not enable Growth, schedule work or call paid APIs.
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
