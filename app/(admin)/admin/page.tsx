import Link from "next/link";
import { AlertTriangle, ShieldCheck } from "lucide-react";

import { AdminTopbar } from "@/components/admin/admin-topbar";
import { KpiCard } from "@/components/admin/kpi-card";
import { getAdminOverviewStats } from "@/lib/data/translators";
import { formatDateTime } from "@/lib/utils";
import { getUsageProtectionDashboardData } from "@/lib/usage-protection";

export const dynamic = "force-dynamic";

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 4,
  }).format(value);
}

export default async function AdminOverviewPage() {
  const [stats, usageProtection] = await Promise.all([
    getAdminOverviewStats(30),
    getUsageProtectionDashboardData(),
  ]);
  const maxUsage = Math.max(1, ...stats.series.map((item) => item.translations));

  return (
    <>
      <AdminTopbar
        title="Platform Overview"
        subtitle="Track usage, costs, and top-performing translators over the last 30 days."
      />
      <main className="space-y-6 p-4 sm:p-6">
        {!usageProtection.state.translationsEnabled ? (
          <section className="rounded-2xl border border-red-200 bg-red-50 p-4 sm:p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-1 text-xs font-semibold text-red-700">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  Emergency Shutdown Active
                </p>
                <p className="mt-2 text-sm font-medium text-ink">
                  Translation is currently disabled platform-wide.
                </p>
                {usageProtection.state.shutdownReason ? (
                  <p className="mt-1 text-sm text-muted-ink">{usageProtection.state.shutdownReason}</p>
                ) : null}
                {usageProtection.state.shutdownTriggeredAt ? (
                  <p className="mt-1 text-xs text-muted-ink">
                    Triggered: {formatDateTime(usageProtection.state.shutdownTriggeredAt)}
                  </p>
                ) : null}
              </div>
              <Link
                href="/admin/usage-protection"
                className="rounded-lg border border-red-200 bg-white px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-100"
              >
                Review Controls
              </Link>
            </div>
          </section>
        ) : (
          <section className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 sm:p-5">
            <p className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-1 text-xs font-semibold text-emerald-700">
              <ShieldCheck className="h-3.5 w-3.5" />
              Translation Active
            </p>
            <p className="mt-2 text-sm text-muted-ink">
              Usage protection is monitoring requests and token budget in real time.
            </p>
          </section>
        )}

        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <KpiCard label="Translations (30d)" value={stats.kpis.totalTranslations} />
          <KpiCard label="Total Tokens" value={stats.kpis.totalTokens} />
          <KpiCard label="Estimated Spend" value={formatCurrency(stats.kpis.estimatedSpend)} />
          <KpiCard label="Active Translators" value={stats.kpis.activeTranslators} />
          <KpiCard label="Categories" value={stats.kpis.categoriesCount} />
          <KpiCard label="Ad Placements" value={stats.kpis.adsCount} />
          <KpiCard label="Featured Translators" value={stats.kpis.featuredTranslators} />
          <KpiCard label="Total Translators" value={stats.kpis.totalTranslators} />
          <KpiCard label="Requests Today (UTC)" value={usageProtection.today.totalRequests} />
          <KpiCard label="Blocked Today" value={usageProtection.today.blockedRequests} />
          <KpiCard label="Tokens Today" value={usageProtection.today.totalTokens} />
          <KpiCard label="Token Budget Left" value={usageProtection.today.remainingTokens} />
        </section>

        <section className="rounded-2xl border border-border bg-white p-4 sm:p-6">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-display text-2xl font-semibold text-ink">Usage Trend (30 days)</h2>
            <p className="text-xs text-muted-ink">Daily translations</p>
          </div>
          <div className="flex items-end gap-1 overflow-x-auto pb-2">
            {stats.series.map((item) => (
              <div key={item.date} className="group flex w-3 shrink-0 flex-col items-center justify-end gap-1">
                <div
                  className="w-full rounded bg-brand-500/80"
                  style={{
                    height: `${Math.max(8, Math.round((item.translations / maxUsage) * 120))}px`,
                  }}
                  title={`${item.date}: ${item.translations} translations`}
                />
                <span className="hidden text-[10px] text-muted-ink group-hover:block">{item.date.slice(5)}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="grid gap-6 xl:grid-cols-2">
          <div className="rounded-2xl border border-border bg-white p-4 sm:p-6">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-display text-2xl font-semibold text-ink">Top Translators</h2>
              <Link href="/admin/translators" className="text-sm font-medium text-brand-700 hover:text-brand-800">
                Manage translators
              </Link>
            </div>

            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-muted-ink">
                    <th className="px-2 py-2 font-medium">Translator</th>
                    <th className="px-2 py-2 font-medium">Usage</th>
                    <th className="px-2 py-2 font-medium">Tokens</th>
                    <th className="px-2 py-2 font-medium">Spend</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.topTranslators.map((row) => (
                    <tr key={row.translatorId} className="border-b border-border/70 last:border-b-0">
                      <td className="px-2 py-2">
                        <p className="font-medium text-ink">{row.name}</p>
                        <p className="text-xs text-muted-ink">/{row.slug}</p>
                      </td>
                      <td className="px-2 py-2 text-ink">{row.usageCount}</td>
                      <td className="px-2 py-2 text-ink">{row.totalTokens}</td>
                      <td className="px-2 py-2 text-ink">{formatCurrency(row.estimatedSpend)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="rounded-2xl border border-border bg-white p-4 sm:p-6">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-display text-2xl font-semibold text-ink">Recent Activity</h2>
              <Link href="/admin/logs" className="text-sm font-medium text-brand-700 hover:text-brand-800">
                Open logs
              </Link>
            </div>
            <div className="space-y-2">
              {stats.recent.map((item) => (
                <div key={item.id} className="rounded-xl border border-border bg-muted-surface px-3 py-2">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-medium text-ink">{item.translator.name}</p>
                      <p className="text-xs text-muted-ink">/{item.translator.slug}</p>
                    </div>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                        item.status === "SUCCESS"
                          ? "bg-emerald-100 text-emerald-700"
                          : item.status === "BLOCKED"
                            ? "bg-amber-100 text-amber-700"
                            : "bg-red-100 text-red-700"
                      }`}
                    >
                      {item.status}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-muted-ink">
                    {item.model || "n/a"} · {item.totalTokens} tokens · {formatCurrency(item.estimatedCost)}
                  </p>
                  <p className="mt-1 text-[11px] text-muted-ink">{formatDateTime(item.createdAt)}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-border bg-white p-4 sm:p-6">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-display text-2xl font-semibold text-ink">Usage Protection Snapshot (UTC)</h2>
            <Link href="/admin/usage-protection" className="text-sm font-medium text-brand-700 hover:text-brand-800">
              Open controls
            </Link>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <div className="space-y-2 rounded-xl border border-border bg-muted-surface p-3">
              <p className="text-sm font-semibold text-ink">Blocked Reasons Today</p>
              {usageProtection.today.blockedByReason.length ? (
                usageProtection.today.blockedByReason.map((item) => (
                  <div key={item.code} className="flex items-center justify-between text-sm">
                    <span className="text-muted-ink">{item.code}</span>
                    <span className="font-medium text-ink">{item.count}</span>
                  </div>
                ))
              ) : (
                <p className="text-sm text-muted-ink">No blocked requests recorded.</p>
              )}
            </div>

            <div className="space-y-2 rounded-xl border border-border bg-muted-surface p-3">
              <p className="text-sm font-semibold text-ink">Top Translators by Tokens Today</p>
              {usageProtection.topTranslatorsByTokens.length ? (
                usageProtection.topTranslatorsByTokens.map((item) => (
                  <div key={item.translatorId} className="flex items-center justify-between gap-2 text-sm">
                    <span className="min-w-0 truncate text-muted-ink">
                      {item.name} <span className="text-xs">/{item.slug}</span>
                    </span>
                    <span className="whitespace-nowrap font-medium text-ink">{item.totalTokens} tokens</span>
                  </div>
                ))
              ) : (
                <p className="text-sm text-muted-ink">No successful translation usage yet today.</p>
              )}
            </div>
          </div>
        </section>
      </main>
    </>
  );
}
