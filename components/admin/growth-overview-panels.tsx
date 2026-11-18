"use client";

import Link from "next/link";
import { useState } from "react";
import type { GrowthPublishingOverview } from "@/lib/growth/overview";

const number = (value: number | null) =>
  value === null ? "—" : new Intl.NumberFormat("en").format(value);
const change = (value: number | null) =>
  value === null
    ? "Comparison needs 14 complete days"
    : `${value > 0 ? "+" : ""}${number(value)} vs previous 7 days`;
function time(value: string | null, zone: string) {
  return value
    ? new Intl.DateTimeFormat("en-GB", {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: zone,
      }).format(new Date(value))
    : "Not available";
}
const statusStyle: Record<string, string> = {
  Posted: "bg-emerald-50 text-emerald-800",
  Scheduled: "bg-sky-50 text-sky-800",
  Failed: "bg-rose-50 text-rose-800",
  Cancelled: "bg-stone-100 text-stone-600",
  Posting: "bg-amber-50 text-amber-900",
  "Retry pending": "bg-amber-50 text-amber-900",
  "Checking outcome": "bg-amber-50 text-amber-900",
};

export function MetricChart({
  points,
  metric,
  account,
}: {
  points: GrowthPublishingOverview["accounts"][number]["points"];
  metric: "clicks" | "impressions";
  account: string;
}) {
  const max = Math.max(1, ...points.map((p) => p[metric] ?? 0));
  const y = (n: number) => 88 - (n / max) * 68;
  const x = (i: number) => 12 + (i * 276) / Math.max(1, points.length - 1);
  return (
    <svg
      viewBox="0 0 300 108"
      role="img"
      aria-label={`${account}: ${metric === "clicks" ? "outbound clicks" : "impressions"}, 14 completed UTC days. Gaps indicate missing data.`}
      className="mt-5 w-full overflow-visible"
    >
      {[20, 54, 88].map((v) => (
        <line
          key={v}
          x1="12"
          x2="288"
          y1={v}
          y2={v}
          stroke="currentColor"
          className="text-stone-200"
          strokeDasharray="3 5"
        />
      ))}
      {points.map((p, i) => {
        const value = p[metric],
          previous = points[i - 1]?.[metric];
        if (value === null)
          return (
            <path
              key={p.day}
              d={`M ${x(i) - 2} 93 l 4 4 m -4 0 l 4 -4`}
              stroke="#a8a29e"
            >
              <title>{p.day}: unavailable</title>
            </path>
          );
        return (
          <g key={p.day}>
            {i > 0 && previous !== null && previous !== undefined && (
              <line
                x1={x(i - 1)}
                y1={y(previous)}
                x2={x(i)}
                y2={y(value)}
                stroke={metric === "clicks" ? "#17634c" : "#bb691e"}
                strokeWidth="2.5"
              />
            )}
            <circle
              cx={x(i)}
              cy={y(value)}
              r="3"
              fill={metric === "clicks" ? "#17634c" : "#bb691e"}
            >
              <title>
                {p.day}: {number(value)} {metric}
              </title>
            </circle>
          </g>
        );
      })}
      <text x="12" y="106" fontSize="9" fill="#78716c">
        {points[0]?.day.slice(5)}
      </text>
      <text x="288" y="106" textAnchor="end" fontSize="9" fill="#78716c">
        {points.at(-1)?.day.slice(5)}
      </text>
      <text x="288" y="12" textAnchor="end" fontSize="9" fill="#78716c">
        {points.every((p) => p[metric] === null)
          ? "No ready data"
          : `Peak ${number(Math.max(0, ...points.map((p) => p[metric] ?? 0)))}`}
      </text>
    </svg>
  );
}

export function GrowthOverviewPanels({
  data,
}: {
  data: GrowthPublishingOverview;
}) {
  const [zone, setZone] = useState("Africa/Algiers");
  const [account, setAccount] = useState("all");
  const [state, setState] = useState("all");
  const [metric, setMetric] = useState<"clicks" | "impressions">("clicks");
  const [ranking, setRanking] = useState<"clicks" | "impressions">("clicks");
  const rows = data.schedule.filter(
    (p) =>
      (account === "all" || p.accountId === account) &&
      (state === "all" || p.state === state),
  );
  const posted = data.schedule.filter((p) => p.state === "Posted").length;
  const failed = data.schedule.filter((p) => p.state === "Failed").length;
  const overdue = data.schedule.filter((p) => p.overdue).length;
  const uncertain = data.schedule.filter((p) =>
    ["Checking outcome", "Retry pending", "Needs attention"].includes(p.state),
  ).length;
  const allocated = data.nativeAllocated + data.sourceAllocated;
  const trending = [...data.trending].sort(
    (a, b) => b[ranking] - a[ranking] || b.clicks - a.clicks,
  );
  return (
    <>
      <section
        aria-labelledby="today-heading"
        className="border-border overflow-hidden rounded-2xl border bg-white"
      >
        <div className="border-border flex flex-wrap items-start justify-between gap-5 border-b p-5 sm:p-6">
          <div>
            <p className="text-xs font-bold tracking-widest text-[#5e7868] uppercase">
              Today · {data.day} · UTC day
            </p>
            <h2
              id="today-heading"
              className="font-display mt-2 text-2xl font-bold"
            >
              {data.rotationAccountId
                ? `@${data.rotationAccount}`
                : "No eligible account"}
            </h2>
            <p className="text-muted-ink mt-2 max-w-xl text-sm">
              {data.rotationActive
                ? "Today's account for new approvals. Previously approved Pins keep their committed account and time."
                : "Account rotation is inactive. Existing approved schedules are shown below."}
            </p>
          </div>
          <label className="text-muted-ink text-xs font-medium">
            Display timezone
            <select
              value={zone}
              onChange={(e) => setZone(e.target.value)}
              className="border-border text-ink mt-2 block rounded-lg border bg-white px-3 py-2 text-sm"
            >
              <option value="Africa/Algiers">Algeria · UTC+1</option>
              <option value="UTC">UTC</option>
              <option value="America/New_York">New York</option>
            </select>
          </label>
        </div>
        <div className="divide-border grid divide-y bg-[#f7f8f3] sm:grid-cols-4 sm:divide-x sm:divide-y-0">
          {[
            {
              label: "SayTwist allocation",
              value: `${data.nativeAllocated} / ${data.nativeCap}`,
              hint: "Approved native Pins",
            },
            {
              label: "Anything Translate",
              value: `${data.sourceAllocated} / ${data.sourceCap}`,
              hint: "Approved source Pins",
            },
            {
              label: "Posted",
              value: String(posted),
              hint: "Confirmed on Pinterest",
            },
            {
              label: "Need attention",
              value: String(failed + overdue + uncertain),
              hint: `${failed} failed · ${overdue} overdue · ${uncertain} to inspect`,
            },
          ].map((item) => (
            <div key={item.label} className="p-5">
              <p className="text-muted-ink text-xs font-semibold">
                {item.label}
              </p>
              <p className="font-display mt-2 text-3xl font-bold tabular-nums">
                {item.value}
              </p>
              <p className="text-muted-ink mt-1 text-xs">{item.hint}</p>
            </div>
          ))}
        </div>
        <div className="border-border border-y px-5 py-4 text-sm">
          <p className="font-semibold">
            {allocated >= data.cap
              ? "Today's total allocation is full."
              : `${allocated} of ${data.cap} total daily slots already approved.`}
            {data.rotationActive && data.nativeAllocated >= data.nativeCap
              ? " The SayTwist allocation is full."
              : ""}
          </p>
          <p className="text-muted-ink mt-1 text-xs">
            Posted Pins count toward the daily allocation. New reviews also
            reserve available slots. Account rotation, channel limits, pending
            reviews and 90-minute spacing can move a recommendation to a later
            day. Quotas reset at 00:00 UTC.
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
          <h3 className="font-semibold">Today&apos;s publishing ledger</h3>
          <div className="flex flex-wrap gap-2">
            <label className="sr-only" htmlFor="schedule-account">
              Filter account
            </label>
            <select
              id="schedule-account"
              value={account}
              onChange={(e) => setAccount(e.target.value)}
              className="border-border rounded-lg border bg-white px-3 py-2 text-xs"
            >
              <option value="all">All accounts</option>
              {data.accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  @{a.username}
                </option>
              ))}
            </select>
            <label className="sr-only" htmlFor="schedule-state">
              Filter status
            </label>
            <select
              id="schedule-state"
              value={state}
              onChange={(e) => setState(e.target.value)}
              className="border-border rounded-lg border bg-white px-3 py-2 text-xs"
            >
              <option value="all">All states</option>
              {[
                "Scheduled",
                "Posted",
                "Failed",
                "Posting",
                "Checking outcome",
                "Retry pending",
                "Cancelled",
                "Needs attention",
              ].map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </div>
        </div>
        {rows.length ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <caption className="sr-only">
                Pins scheduled for or posted during today&apos;s UTC day. Times
                displayed in {zone}.
              </caption>
              <thead className="bg-muted-surface text-muted-ink text-xs">
                <tr>
                  {["Pin / account", "Channel", "Scheduled time", "State"].map(
                    (h) => (
                      <th scope="col" key={h} className="px-5 py-3">
                        {h}
                      </th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody>
                {rows.map((p) => (
                  <tr key={p.channel + p.id} className="border-border border-t">
                    <td className="max-w-sm min-w-60 px-5 py-4">
                      <p className="font-semibold">
                        {p.pinUrl ? (
                          <a
                            href={p.pinUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="underline decoration-stone-300 underline-offset-4"
                          >
                            {p.title} ↗
                          </a>
                        ) : (
                          p.title
                        )}
                      </p>
                      <p className="text-muted-ink mt-1 text-xs">
                        @{p.account}
                      </p>
                    </td>
                    <td className="px-5 py-4 text-xs whitespace-nowrap">
                      {p.channel}
                    </td>
                    <td className="px-5 py-4 text-xs whitespace-nowrap">
                      <time dateTime={p.scheduledAt ?? undefined}>
                        {time(p.scheduledAt, zone)}
                      </time>
                      {p.publishedAt && (
                        <p className="text-muted-ink mt-1">
                          Posted {time(p.publishedAt, zone)}
                        </p>
                      )}
                    </td>
                    <td className="px-5 py-4 whitespace-nowrap">
                      <span
                        className={`rounded-full px-2.5 py-1 text-xs font-bold ${statusStyle[p.state] ?? "bg-stone-100 text-stone-700"}`}
                      >
                        {p.state}
                      </span>
                      {p.overdue && (
                        <p className="mt-2 text-xs text-amber-800">
                          Past scheduled time
                        </p>
                      )}
                      {p.state === "Failed" && (
                        <Link
                          href="/admin/growth/intelligence"
                          className="mt-2 block text-xs underline"
                        >
                          Inspect failure
                        </Link>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-muted-ink px-5 py-8 text-sm">
            {data.schedule.length
              ? "No Pins match these filters."
              : "No approved Pins scheduled or posted in today's UTC day. Open reviews to prepare your next publication."}
          </p>
        )}
        {data.scheduleTruncated && (
          <p className="p-5 text-xs text-amber-800">
            Showing a limited ledger. Open Operations for the complete history.
          </p>
        )}
      </section>

      <section aria-labelledby="performance-heading" className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs font-bold tracking-widest text-[#5e7868] uppercase">
              The signal
            </p>
            <h2
              id="performance-heading"
              className="font-display mt-2 text-2xl font-bold"
            >
              Is your audience growing?
            </h2>
            <p className="text-muted-ink mt-2 text-sm">
              14 completed UTC days. Totals cover the latest seven days;
              comparisons require complete periods.
            </p>
          </div>
          <div
            className="border-border flex rounded-full border bg-white p-1"
            aria-label="Chart metric"
          >
            {(["clicks", "impressions"] as const).map((m) => (
              <button
                key={m}
                aria-pressed={metric === m}
                onClick={() => setMetric(m)}
                className={`rounded-full px-4 py-2 text-xs font-bold ${metric === m ? "bg-[#173e35] text-white" : "text-muted-ink"}`}
              >
                {m === "clicks" ? "Outbound clicks" : "Impressions"}
              </button>
            ))}
          </div>
        </div>
        <div className="grid gap-4 lg:grid-cols-3">
          {data.accounts.map((a) => (
            <article
              key={a.id}
              className="border-border rounded-2xl border bg-white p-5"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Link
                  href={`/admin/growth/analytics?account=${encodeURIComponent(a.id)}`}
                  className="font-bold underline decoration-stone-300 underline-offset-4"
                >
                  @{a.username} ↗
                </Link>
                <span
                  className={`rounded-full px-2 py-1 text-[10px] font-bold ${a.connection === "CONNECTED" ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-900"}`}
                >
                  {a.connection.replaceAll("_", " ")}
                </span>
              </div>
              <p className="font-display mt-5 text-4xl font-bold tabular-nums">
                {number(a[metric])}
              </p>
              <p className="text-muted-ink mt-1 text-xs">
                {metric === "clicks" ? "outbound clicks" : "impressions"} ·{" "}
                {a.readyDays}/7 days available
              </p>
              <p
                className={`mt-2 text-xs ${a[metric === "clicks" ? "clickChange" : "impressionChange"] === null ? "text-muted-ink" : "font-semibold"}`}
              >
                {change(
                  a[metric === "clicks" ? "clickChange" : "impressionChange"],
                )}
              </p>
              <MetricChart
                account={a.username}
                points={a.points}
                metric={metric}
              />
              <div className="border-border mt-4 grid grid-cols-2 gap-3 border-t pt-4 text-xs">
                <div>
                  <span className="text-muted-ink">Impressions</span>
                  <p className="mt-1 font-bold">{number(a.impressions)}</p>
                </div>
                <div>
                  <span className="text-muted-ink">Outbound clicks</span>
                  <p className="mt-1 font-bold">{number(a.clicks)}</p>
                </div>
              </div>
              <p className="text-muted-ink mt-4 text-[11px]">
                Account analytics retrieved {time(a.lastAccountSync, zone)}. Pin
                detail retrieved {time(a.lastPinSync, zone)}.
              </p>
              {(a.analyticsStatus !== "FRESH" ||
                a.readyDays < 7 ||
                !a.lastAccountSync ||
                Date.parse(data.generatedAt) - Date.parse(a.lastAccountSync) >
                  36 * 3_600_000) && (
                <p className="mt-2 text-xs text-amber-800">
                  {a.analyticsStatus.replaceAll("_", " ").toLowerCase()} ·
                  incomplete or older data may hide recent changes.
                </p>
              )}
              <details className="mt-3 text-xs">
                <summary className="text-muted-ink cursor-pointer">
                  Daily values and missing dates
                </summary>
                <table className="mt-2 w-full text-left">
                  <thead>
                    <tr>
                      <th scope="col">UTC date</th>
                      <th scope="col">Clicks</th>
                      <th scope="col">Impressions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {a.points.map((p) => (
                      <tr key={p.day}>
                        <th scope="row" className="py-1 font-normal">
                          {p.day}
                        </th>
                        <td>{number(p.clicks)}</td>
                        <td>{number(p.impressions)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </details>
            </article>
          ))}
        </div>
        {!data.accounts.length && (
          <p className="border-border text-muted-ink rounded-2xl border bg-white p-6 text-sm">
            Connect a production Pinterest account to see performance.
          </p>
        )}
        <p className="text-muted-ink text-xs">
          Charts use individual scales. Missing or processing dates are gaps,
          not zero. No data is fetched from Pinterest by opening this page.
        </p>
      </section>

      <section
        aria-labelledby="trending-heading"
        className="border-border overflow-hidden rounded-2xl border bg-white"
      >
        <div className="border-border flex flex-wrap items-center justify-between gap-3 border-b p-5">
          <div>
            <h2
              id="trending-heading"
              className="font-display text-xl font-bold"
            >
              Pins gaining attention
            </h2>
            <p className="text-muted-ink mt-1 text-xs">
              All production accounts, including source Pins · latest seven
              completed UTC days · up to 12 leaders by outbound clicks
            </p>
          </div>
          <label className="text-xs">
            Rank shortlist by
            <select
              value={ranking}
              onChange={(e) => setRanking(e.target.value as typeof ranking)}
              className="border-border ml-2 rounded-lg border bg-white p-2"
            >
              <option value="clicks">Outbound clicks</option>
              <option value="impressions">Impressions</option>
            </select>
          </label>
        </div>
        {trending.length ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-muted-surface text-muted-ink text-xs">
                <tr>
                  {[
                    "Pin",
                    "Account",
                    "Clicks",
                    "Impressions",
                    "Outbound rate",
                    "Change / coverage",
                  ].map((h) => (
                    <th scope="col" key={h} className="px-5 py-3">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {trending.map((p) => (
                  <tr key={p.id} className="border-border border-t">
                    <td className="max-w-sm min-w-52 px-5 py-4 font-semibold">
                      {p.pinUrl ? (
                        <a
                          href={p.pinUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="underline decoration-stone-300 underline-offset-4"
                        >
                          {p.title} ↗
                        </a>
                      ) : (
                        p.title
                      )}
                    </td>
                    <td className="px-5 py-4 text-xs">@{p.account}</td>
                    <td className="px-5 py-4 font-bold tabular-nums">
                      {number(p.clicks)}
                    </td>
                    <td className="px-5 py-4 tabular-nums">
                      {number(p.impressions)}
                    </td>
                    <td className="px-5 py-4 tabular-nums">
                      {p.impressions > 0
                        ? `${((100 * p.clicks) / p.impressions).toFixed(2)}%`
                        : "—"}
                    </td>
                    <td className="min-w-44 px-5 py-4 text-xs">
                      <p>
                        {p.clickChange === null
                          ? "Comparison unavailable"
                          : `${p.clickChange > 0 ? "+" : ""}${number(p.clickChange)} clicks vs previous week`}
                      </p>
                      <p className="text-muted-ink mt-1">
                        {p.readyDays}/7 days available
                      </p>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-muted-ink p-8 text-sm">
            No ready daily Pin metrics in this period. Rankings will appear as
            analytics coverage arrives.
          </p>
        )}
        <p className="border-border text-muted-ink border-t px-5 py-3 text-xs">
          Ranks reflect recorded metrics. Partial coverage can undercount
          performance; no growth claim is made without two complete weeks.
        </p>
      </section>

      <section
        aria-labelledby="attention-heading"
        className="border-border rounded-2xl border bg-[#f7f8f3] p-5 sm:p-6"
      >
        <h2 id="attention-heading" className="font-display text-xl font-bold">
          Keep things moving
        </h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          {[
            {
              href: "/admin/growth/approvals",
              value: data.pendingReviews,
              label: "Open reviews",
              detail: "Awaiting your decision before they can be scheduled.",
            },
            {
              href: "/admin/growth/creative",
              value: data.readyCreatives,
              label: "Ready creatives",
              detail:
                "Unapproved drafts in Studio, including any already in review.",
            },
            {
              href: "/admin/growth/intelligence",
              value: data.deliveryIssues,
              label: "Delivery incidents",
              detail: "Unresolved or uncertain notifications to inspect.",
            },
          ].map((item) => (
            <Link
              key={item.label}
              href={item.href}
              className="border-border rounded-xl border bg-white p-4 transition hover:border-[#173e35]"
            >
              <p className="font-display text-2xl font-bold">{item.value}</p>
              <p className="mt-1 text-sm font-bold">{item.label} →</p>
              <p className="text-muted-ink mt-2 text-xs">{item.detail}</p>
            </Link>
          ))}
        </div>
        {data.lastBlockedAt && (
          <p className="mt-4 text-xs text-amber-900">
            A review preparation was blocked in the past 24 hours (last seen{" "}
            {time(data.lastBlockedAt, zone)}). This may have since been
            repaired.{" "}
            <Link href="/admin/growth/intelligence" className="underline">
              Inspect activity →
            </Link>
          </p>
        )}
      </section>

      <section className="border-border overflow-hidden rounded-2xl border bg-white">
        <div className="border-border flex justify-between gap-4 border-b p-5">
          <h2 className="font-display text-xl font-bold">Coming up</h2>
          <span className="text-muted-ink text-xs">
            {data.scheduledCount} approved · showing next {data.upcoming.length}
          </span>
        </div>
        {data.upcoming.length ? (
          <ol className="divide-border divide-y">
            {data.upcoming.map((p) => (
              <li
                key={p.id}
                className="flex flex-wrap justify-between gap-3 px-5 py-4 text-sm"
              >
                <div>
                  <p className="font-semibold">{p.title}</p>
                  <p className="text-muted-ink mt-1 text-xs">@{p.account}</p>
                </div>
                <time
                  dateTime={p.scheduledAt}
                  className="text-muted-ink text-xs"
                >
                  {time(p.scheduledAt, zone)}
                </time>
              </li>
            ))}
          </ol>
        ) : (
          <p className="text-muted-ink p-6 text-sm">
            No upcoming approved Pins. Approve a review to add one.
          </p>
        )}
      </section>
    </>
  );
}
