import Link from "next/link";
import { requireAdminRoute } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { AdminTopbar } from "@/components/admin/admin-topbar";
export const dynamic = "force-dynamic";
export default async function GrowthIntelligencePage() {
  await requireAdminRoute();
  const [coverage, conversions, publications, activity] = await Promise.all([
    prisma.growthAnalyticsCoverage.findMany({
      orderBy: { observedAt: "desc" },
      take: 12,
    }),
    prisma.growthViralConversion.findMany({
      orderBy: { createdAt: "desc" },
      take: 30,
    }),
    prisma.growthPinPublication.findMany({
      orderBy: { scheduledAt: "desc" },
      take: 30,
      select: {
        id: true,
        candidate: { select: { title: true } },
        scheduledAt: true,
        status: true,
        pinterestPinId: true,
        lastErrorCode: true,
      },
    }),
    prisma.growthActivity.findMany({
      orderBy: { createdAt: "desc" },
      take: 25,
      select: { id: true, action: true, entityId: true, createdAt: true },
    }),
  ]);
  return (
    <>
      <AdminTopbar
        title="Growth Intelligence"
        subtitle="Source experiments, native campaigns and operational evidence."
      />
      <main className="mx-auto max-w-7xl space-y-8 p-4 sm:p-8">
        <nav className="flex flex-wrap gap-5 text-sm font-bold underline underline-offset-4">
          <Link href="/admin/growth/approvals">Approval Center</Link>
          <Link href="/admin/growth/accounts">Account readiness</Link>
          <Link href="/admin/growth/spend">Finance</Link>
          <Link href="/admin/growth/reports">Daily reports</Link>
        </nav>
        <section className="space-y-4">
          <h1 className="font-display text-3xl font-bold">
            Evidence before expansion.
          </h1>
          <p className="text-muted-ink text-sm">
            Qualified source Pins lead to original Translator proposals and
            separate native campaigns. Original Pin destinations stay fixed.
          </p>
          <div className="overflow-x-auto rounded-2xl border bg-white">
            <table className="w-full text-left text-sm">
              <caption className="p-4 text-left font-bold">
                Winner → native Translator pipeline
              </caption>
              <thead className="border-y bg-[#f5f6ef]">
                <tr>
                  {[
                    "Source experiment",
                    "State",
                    "Translator",
                    "New campaign",
                  ].map((h) => (
                    <th className="p-4" key={h}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {conversions.map((c) => (
                  <tr key={c.id} className="border-b">
                    <td className="max-w-52 p-4 break-all">
                      <Link href="/admin/growth/viral" className="underline">
                        {c.winningPinTestId}
                      </Link>
                    </td>
                    <td className="p-4 font-bold">
                      {c.status.replaceAll("_", " ")}
                      {c.lastErrorCode ? (
                        <p className="mt-2 text-xs">{c.lastErrorCode}</p>
                      ) : null}
                    </td>
                    <td className="max-w-48 p-4 break-all">
                      {c.translatorId ?? "Awaiting qualified creation"}
                    </td>
                    <td className="max-w-48 p-4 break-all">
                      {c.campaignJobId ?? "Not prepared"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!conversions.length ? (
              <p className="p-6 text-sm">
                No qualified winner conversions have been recorded.
              </p>
            ) : null}
          </div>
        </section>
        <section className="space-y-4">
          <h2 className="font-display text-2xl font-bold">
            Analytics coverage
          </h2>
          <p className="text-muted-ink text-sm">
            GA4 and Search Console ingestion are not connected to this ledger.
            Their metrics are unavailable here.
          </p>
          <div className="grid gap-4 md:grid-cols-2">
            {coverage.map((c) => (
              <article key={c.id} className="rounded-2xl border bg-white p-5">
                <div className="flex flex-wrap justify-between gap-2">
                  <h3 className="font-bold">
                    {c.source} · {c.metricType}
                  </h3>
                  <span className="text-xs font-bold">{c.status}</span>
                </div>
                <p className="mt-3 text-xs break-all">Account {c.accountId}</p>
                <p className="mt-3 text-sm">
                  {c.windowStart.toISOString().slice(0, 10)} →{" "}
                  {c.windowEnd.toISOString().slice(0, 10)}
                </p>
                <p className="text-muted-ink mt-2 text-xs">
                  Observed {c.observedAt.toISOString()} · Supported history{" "}
                  {c.supportedDays} days
                </p>
                <p className="text-muted-ink mt-2 text-xs">
                  {c.qualityFlags.join(" · ")}
                </p>
              </article>
            ))}
          </div>
          {!coverage.length ? (
            <p className="rounded-xl border border-dashed p-6 text-sm">
              No coverage audit has run. No completeness estimate is available.
            </p>
          ) : null}
        </section>
        <section className="space-y-4">
          <h2 className="font-display text-2xl font-bold">
            Publishing calendar &amp; outcomes
          </h2>
          <div className="overflow-x-auto rounded-2xl border bg-white">
            <table className="w-full text-left text-sm">
              <thead>
                <tr>
                  {["Pin", "Scheduled UTC", "State", "Provider evidence"].map(
                    (h) => (
                      <th className="p-4" key={h}>
                        {h}
                      </th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody>
                {publications.map((p) => (
                  <tr key={p.id} className="border-t">
                    <td className="p-4">{p.candidate.title}</td>
                    <td className="p-4">{p.scheduledAt.toISOString()}</td>
                    <td className="p-4">{p.status}</td>
                    <td className="p-4">
                      {p.pinterestPinId ? (
                        <a
                          href={
                            "https://www.pinterest.com/pin/" +
                            p.pinterestPinId +
                            "/"
                          }
                          className="underline"
                          target="_blank"
                          rel="noreferrer"
                        >
                          View Pin
                        </a>
                      ) : (
                        (p.lastErrorCode ?? "No confirmed Pin ID")
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
        <section>
          <h2 className="font-display text-2xl font-bold">Agent activity</h2>
          <ol className="mt-4 divide-y rounded-2xl border bg-white px-5">
            {activity.map((a) => (
              <li
                key={a.id}
                className="flex flex-wrap justify-between gap-3 py-4 text-sm"
              >
                <span className="font-bold">
                  {a.action.replaceAll("_", " ")}
                </span>
                <time className="text-muted-ink text-xs">
                  {a.createdAt.toISOString()}
                </time>
              </li>
            ))}
          </ol>
        </section>
      </main>
    </>
  );
}
