import Link from "next/link";
import { AdminTopbar } from "@/components/admin/admin-topbar";
import { KpiCard } from "@/components/admin/kpi-card";
import { requireAdminRoute } from "@/lib/auth";
import { getGrowthFoundationOverview } from "@/lib/growth/admin";
import { prisma } from "@/lib/prisma";
export const dynamic = "force-dynamic";
const date = (value: Date | null | undefined) => value ? new Intl.DateTimeFormat("en", {
  dateStyle: "medium", timeStyle: "short", timeZone: "UTC", hour12: false,
}).format(value) + " UTC" : "Not yet";
export default async function AdminGrowthPage() {
  await requireAdminRoute();
  const now = new Date();
  const [overview, pending, native, sources, accounts] = await Promise.all([
    getGrowthFoundationOverview(),
    prisma.growthApprovalRequest.count({ where: { status: "PENDING", expiresAt: { gt: now } } }),
    prisma.growthPinPublication.findMany({ where: { scheduledAt: { gte: now }, status: "SCHEDULED" },
      select: { id: true, scheduledAt: true, candidate: { select: { title: true } }, account: { select: { username: true } } },
      orderBy: { scheduledAt: "asc" }, take: 10 }),
    prisma.growthViralPinTest.findMany({ where: { status: "APPROVED", scheduledAt: { gte: now } },
      select: { id: true, scheduledAt: true, title: true, accountId: true },
      orderBy: { scheduledAt: "asc" }, take: 10 }),
    prisma.growthPinterestAccount.findMany({ select: { id: true, username: true }, take: 10 }),
  ]);
  const analyticsLabel = overview.pinterestAnalytics.status === "WAITING_FOR_CAPACITY" ? "Queued"
    : overview.pinterestAnalytics.status.replaceAll("_", " ").toLowerCase();
  const upcoming = [...native.map(p => ({ ...p, title: p.candidate.title })), ...sources.map(p => ({ ...p, account: accounts.find(a => a.id === p.accountId) }))]
    .sort((a,b) => a.scheduledAt!.getTime() - b.scheduledAt!.getTime()).slice(0,10);
  return <><AdminTopbar title="Growth" subtitle="Review Pins, follow your schedule and track results." />
    <main className="mx-auto max-w-7xl space-y-8 p-4 sm:p-8">
      <section className="flex flex-wrap items-center justify-between gap-6 rounded-2xl bg-[#173e35] p-6 text-white sm:p-8">
        <div><p className="text-xs font-semibold tracking-widest text-[#a9cdb8] uppercase">Your publishing desk</p>
          <h2 className="font-display mt-3 text-3xl font-bold">{pending ? `${pending} reviews need your eye.` : "You're up to date."}</h2>
          <p className="mt-2 text-sm text-[#d4e4d9]">Every Pin is reviewed by you before it is scheduled.</p></div>
        <Link href="/admin/growth/approvals" className="rounded-full bg-white px-5 py-3 text-sm font-bold text-[#173e35]">Open reviews →</Link>
      </section>
      <section aria-label="Growth status" className="grid gap-4 sm:grid-cols-3">
        <KpiCard label="Scheduled Pins" value={String(upcoming.length)} hint="Upcoming approved publications" />
        <KpiCard label="Analytics" value={analyticsLabel} hint={"Last retrieved " + date(overview.pinterestAnalytics.lastSuccessfulSyncAt)} />
        <KpiCard label="Pin history" value={`${overview.pinterestAnalytics.backfillPinsProcessed}/${overview.pinterestAnalytics.backfillPinsTotal}`} hint="Detailed analytics progress" />
      </section>
      <section className="overflow-hidden rounded-2xl border border-border bg-white">
        <div className="flex items-center justify-between border-b border-border p-5"><h2 className="font-display text-xl font-bold">Coming up</h2><Link href="/admin/growth/creative" className="text-sm font-semibold underline underline-offset-4">Open studio</Link></div>
        {upcoming.length ? <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="bg-muted-surface text-muted-ink"><tr><th className="p-4">Pin</th><th className="p-4">Account</th><th className="p-4">Publishing time (UTC)</th></tr></thead><tbody>
          {upcoming.map(p => <tr key={p.id} className="border-t border-border"><td className="max-w-md p-4 font-medium">{p.title}</td><td className="p-4">@{p.account?.username}</td><td className="whitespace-nowrap p-4">{date(p.scheduledAt)}</td></tr>)}
        </tbody></table></div> : <p className="text-muted-ink p-8 text-sm">No upcoming Pins. Approve a review to add one to the schedule.</p>}
      </section>
      <details className="rounded-2xl border border-border bg-white p-5"><summary className="cursor-pointer text-sm font-semibold">Recent system activity</summary>
        <div className="mt-4 divide-y divide-border">{overview.recentActivity.slice(0,8).map(a => <div key={a.id} className="flex flex-wrap justify-between gap-2 py-3 text-sm"><span>{a.action.replaceAll("_", " ").toLowerCase()}</span><time className="text-muted-ink">{date(a.createdAt)}</time></div>)}</div>
        <Link href="/admin/growth/intelligence" className="mt-4 inline-block text-sm underline">View operations</Link>
      </details>
    </main></>;
}
