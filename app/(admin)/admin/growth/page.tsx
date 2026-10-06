import { AdminTopbar } from "@/components/admin/admin-topbar";
import { GrowthSettingsForm } from "@/components/admin/growth-settings-form";
import { KpiCard } from "@/components/admin/kpi-card";
import { buttonVariants } from "@/components/ui/button";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { requireAdminRoute } from "@/lib/auth";
import { getGrowthFoundationOverview } from "@/lib/growth/admin";

export const dynamic = "force-dynamic";

function formatDate(value: Date | null | undefined) {
  return value ? new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(value) : "Never";
}

export default async function AdminGrowthPage() {
  await requireAdminRoute();
  const overview = await getGrowthFoundationOverview();
  const activeJobs = overview.jobs.claimed + overview.jobs.running;
  const failedJobs = overview.jobs.retryable + overview.jobs.terminalFailed;

  return (
    <>
      <AdminTopbar
        title="Growth"
        subtitle="Growth controls, bounded jobs, Pinterest connection, and organic analytics health."
      />
      <main className="space-y-6 p-4 sm:p-6">
        <div className="flex flex-wrap justify-end gap-3"><Link href="/admin/growth/analytics" className={cn(buttonVariants({ variant: "outline" }))}>Pinterest analytics</Link><Link href="/admin/growth/accounts" className={cn(buttonVariants({ variant: "outline" }))}>Pinterest accounts</Link></div>
        <div className="rounded-2xl border border-brand-200 bg-brand-50 p-4 text-sm leading-6 text-brand-950">
          Pinterest account, board, Pin inventory, and organic analytics synchronization are available through bounded jobs. Attribution, Ideas, publishing, and autonomous content remain inactive.
        </div>

        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label="Growth foundation status">
          <KpiCard label="Growth state" value={overview.settings.enabled ? "Enabled" : "Disabled"} hint="Global execution kill switch" />
          <KpiCard label="Queued jobs" value={overview.jobs.queued.toLocaleString()} hint={overview.jobs.oldestRunnableJob ? `Oldest due ${formatDate(overview.jobs.oldestRunnableJob.runAfter)}` : "No runnable work"} />
          <KpiCard label="Active jobs" value={activeJobs.toLocaleString()} hint={`${overview.jobs.claimed} claimed · ${overview.jobs.running} running`} />
          <KpiCard label="Failed jobs" value={failedJobs.toLocaleString()} hint={`${overview.jobs.retryable} retryable · ${overview.jobs.terminalFailed} terminal`} />
        </section>

        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label="Pinterest analytics status">
          <KpiCard label="Analytics state" value={overview.pinterestAnalytics.status} hint="Across connected Pinterest accounts" />
          <KpiCard label="Inventoried Pins" value={overview.pinterestAnalytics.pinsInventoried.toLocaleString()} hint="Active locally synchronized Pins" />
          <KpiCard label="Analytics-relevant Pins" value={overview.pinterestAnalytics.analyticsRelevantPins.toLocaleString()} hint="Active Pins linking to owned domains" />
          <KpiCard label="Pin backfill" value={`${overview.pinterestAnalytics.backfillPinsProcessed}/${overview.pinterestAnalytics.backfillPinsTotal}`} hint="Detailed Pin history progress" />
          <KpiCard label="Analytics retrieved" value={formatDate(overview.pinterestAnalytics.lastSuccessfulSyncAt)} hint="Latest successful API retrieval" />
        </section>

        <GrowthSettingsForm initial={{ enabled: overview.settings.enabled, intensity: overview.settings.intensity, workerBatchSize: overview.settings.workerBatchSize, ownedDomains: overview.settings.ownedDomains }} />

        <section className="grid gap-6 xl:grid-cols-[0.8fr_1.2fr]">
          <div className="rounded-2xl border border-border bg-white p-5 sm:p-6">
            <p className="section-kicker">Worker</p>
            <h2 className="font-display mt-1 text-2xl font-bold text-ink">Last bounded run</h2>
            <dl className="mt-5 space-y-3 text-sm">
              <div className="flex justify-between gap-4"><dt className="text-muted-ink">Status</dt><dd className="font-bold text-ink">{overview.worker?.status || "Never run"}</dd></div>
              <div className="flex justify-between gap-4"><dt className="text-muted-ink">Heartbeat</dt><dd className="text-right font-medium text-ink">{formatDate(overview.worker?.heartbeatAt)}</dd></div>
              <div className="flex justify-between gap-4"><dt className="text-muted-ink">Completed</dt><dd className="text-right font-medium text-ink">{formatDate(overview.worker?.completedAt)}</dd></div>
              <div className="flex justify-between gap-4"><dt className="text-muted-ink">Batch ceiling</dt><dd className="font-bold text-ink">{overview.settings.workerBatchSize}</dd></div>
            </dl>
          </div>

          <div className="rounded-2xl border border-border bg-white p-5 sm:p-6">
            <p className="section-kicker">Audit trail</p>
            <h2 className="font-display mt-1 text-2xl font-bold text-ink">Recent Growth activity</h2>
            <div className="mt-5 space-y-3">
              {overview.recentActivity.length ? overview.recentActivity.map((activity) => (
                <div key={activity.id} className="rounded-xl border border-border p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-bold text-ink">{activity.action.replaceAll("_", " ")}</p>
                    <time className="text-xs text-muted-ink">{formatDate(activity.createdAt)}</time>
                  </div>
                  <p className="mt-1 text-xs text-muted-ink">{activity.entityType} · {activity.entityId}</p>
                  {activity.toState ? <p className="mt-2 text-sm text-ink">{activity.fromState || "—"} → {activity.toState}</p> : null}
                </div>
              )) : <p className="rounded-xl border border-dashed border-border p-5 text-sm text-muted-ink">No Growth activity has been recorded yet.</p>}
            </div>
          </div>
        </section>
      </main>
    </>
  );
}
