import Link from "next/link";
import { AdminTopbar } from "@/components/admin/admin-topbar";
import { KpiCard } from "@/components/admin/kpi-card";
import { requireAdminRoute } from "@/lib/auth";
import { getGrowthFoundationOverview } from "@/lib/growth/admin";
import { getGrowthPublishingOverview } from "@/lib/growth/overview";
import { GrowthOverviewPanels } from "@/components/admin/growth-overview-panels";
export const dynamic = "force-dynamic";
const date = (value: Date | null | undefined) =>
  value
    ? new Intl.DateTimeFormat("en", {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: "UTC",
        hour12: false,
      }).format(value) + " UTC"
    : "Not yet";
export default async function AdminGrowthPage() {
  await requireAdminRoute();
  const [overview, publishing] = await Promise.all([
    getGrowthFoundationOverview(),
    getGrowthPublishingOverview(),
  ]);
  const pending = publishing.pendingReviews;
  const analyticsLabel =
    overview.pinterestAnalytics.status === "WAITING_FOR_CAPACITY"
      ? "Queued"
      : overview.pinterestAnalytics.status.replaceAll("_", " ").toLowerCase();
  return (
    <>
      <AdminTopbar
        title="Growth"
        subtitle="Review Pins, follow your schedule and track results."
      />
      <main className="mx-auto max-w-7xl space-y-8 p-4 sm:p-8">
        <section className="flex flex-wrap items-center justify-between gap-6 rounded-2xl bg-[#173e35] p-6 text-white sm:p-8">
          <div>
            <p className="text-xs font-semibold tracking-widest text-[#a9cdb8] uppercase">
              Your publishing desk
            </p>
            <h2 className="font-display mt-3 text-3xl font-bold">
              {pending
                ? `${pending} reviews need your eye.`
                : "You're up to date."}
            </h2>
            <p className="mt-2 text-sm text-[#d4e4d9]">
              Every Pin is reviewed by you before it is scheduled.
            </p>
          </div>
          <Link
            href="/admin/growth/approvals"
            className="rounded-full bg-white px-5 py-3 text-sm font-bold text-[#173e35]"
          >
            Open reviews →
          </Link>
        </section>
        <section
          aria-label="Growth status"
          className="grid gap-4 sm:grid-cols-3"
        >
          <KpiCard
            label="Scheduled Pins"
            value={String(publishing.scheduledCount)}
            hint="Upcoming approved publications"
          />
          <KpiCard
            label="Analytics"
            value={analyticsLabel}
            hint={
              "Last retrieved " +
              date(overview.pinterestAnalytics.lastSuccessfulSyncAt)
            }
          />
          <KpiCard
            label="Pin history"
            value={`${overview.pinterestAnalytics.backfillPinsProcessed}/${overview.pinterestAnalytics.backfillPinsTotal}`}
            hint="Detailed analytics progress"
          />
        </section>
        <GrowthOverviewPanels data={publishing} />
        <details className="border-border rounded-2xl border bg-white p-5">
          <summary className="cursor-pointer text-sm font-semibold">
            Recent system activity
          </summary>
          <div className="divide-border mt-4 divide-y">
            {overview.recentActivity.slice(0, 8).map((a) => (
              <div
                key={a.id}
                className="flex flex-wrap justify-between gap-2 py-3 text-sm"
              >
                <span>{a.action.replaceAll("_", " ").toLowerCase()}</span>
                <time className="text-muted-ink">{date(a.createdAt)}</time>
              </div>
            ))}
          </div>
          <Link
            href="/admin/growth/intelligence"
            className="mt-4 inline-block text-sm underline"
          >
            View operations
          </Link>
        </details>
      </main>
    </>
  );
}
