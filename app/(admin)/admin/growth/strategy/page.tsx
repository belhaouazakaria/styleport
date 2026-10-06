import Link from "next/link";

import { AccountStrategyReviewButton } from "@/components/admin/account-strategy-review-button";
import { AdminTopbar } from "@/components/admin/admin-topbar";
import { KpiCard } from "@/components/admin/kpi-card";
import { buttonVariants } from "@/components/ui/button";
import { requireAdminRoute } from "@/lib/auth";
import { getAccountStrategyDashboard } from "@/lib/growth/strategy/reporting";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

function label(value: string) {
  return value.replaceAll("_", " ").toLowerCase();
}

function formatMetric(value: string | null) {
  return value === null ? "Unavailable" : BigInt(value).toLocaleString();
}

function formatDate(value: Date | string | null) {
  return value
    ? new Intl.DateTimeFormat("en", {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(new Date(value))
    : "Unavailable";
}

export default async function GrowthStrategyPage() {
  await requireAdminRoute();
  const report = await getAccountStrategyDashboard();
  const portfolio = report.current.portfolio;

  return (
    <>
      <AdminTopbar
        title="Pinterest account strategy"
        subtitle="Deterministic, advisory portfolio and board analysis from persisted local evidence."
      />
      <main className="space-y-6 p-4 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link
            href="/admin/growth"
            className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
          >
            ← Growth overview
          </Link>
          <AccountStrategyReviewButton />
        </div>

        <section className="border-brand-200 bg-brand-50 text-brand-950 rounded-2xl border p-4 text-sm leading-6">
          <p>
            <strong>Model:</strong> {report.current.modelVersion} ·{" "}
            <strong>Evidence window:</strong>{" "}
            {report.current.evidenceWindowStart} through{" "}
            {report.current.evidenceWindowEnd}, 28 complete UTC days
          </p>
          <p>
            <strong>Attribution capability:</strong> available ·{" "}
            <strong>Collection:</strong>{" "}
            {label(report.current.attributionCollection)}. QPC is unavailable
            while collection is disabled and is not treated as zero performance.
          </p>
          <p>
            This agent recommends operator actions only. It cannot create,
            rename, disconnect, or delete accounts or boards and makes no
            Pinterest API call during review.
          </p>
        </section>

        <section
          className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5"
          aria-label="Portfolio summary"
        >
          <KpiCard
            label="Planned roles"
            value={portfolio.plannedRoles.toString()}
            hint="Utility · inspiration · playground"
          />
          <KpiCard
            label="Connected roles"
            value={portfolio.connectedRoles.toString()}
            hint="Missing roles are not zero-performing roles"
          />
          <KpiCard
            label="Healthy roles"
            value={portfolio.healthyRoles.toString()}
            hint={`${portfolio.rolesNeedingAttention} need attention`}
          />
          <KpiCard
            label="Portfolio readiness"
            value={label(portfolio.readiness)}
            hint={label(portfolio.evidenceQuality)}
          />
          <KpiCard
            label="Confidence"
            value={`${portfolio.confidence}%`}
            hint="Deterministic evidence score"
          />
        </section>

        <section className="border-border rounded-2xl border bg-white p-5 sm:p-6">
          <p className="section-kicker">Recommendation</p>
          <h2 className="font-display text-ink mt-1 text-2xl font-bold">
            {label(portfolio.recommendation)}
          </h2>
          <p className="text-muted-ink mt-2 text-sm leading-6">
            {portfolio.summary}
          </p>
          <p className="text-muted-ink mt-3 text-xs">
            Reasons: {portfolio.reasonCodes.map(label).join(" · ")}
          </p>
        </section>

        <section
          className="grid gap-4 xl:grid-cols-3"
          aria-label="Account roles"
        >
          {report.current.roles.map((role) => (
            <article
              key={role.role}
              className="border-border rounded-2xl border bg-white p-5"
            >
              <p className="section-kicker">{role.intent}</p>
              <h2 className="font-display text-ink mt-1 text-2xl font-bold">
                {role.label}
              </h2>
              <p className="text-muted-ink mt-1 text-sm">{role.purpose}</p>
              <dl className="mt-4 space-y-2 text-sm">
                <div className="flex justify-between gap-3">
                  <dt>Account</dt>
                  <dd className="font-semibold">
                    {role.username ? `@${role.username}` : "Not connected"}
                  </dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt>Health</dt>
                  <dd>{label(role.health)}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt>Readiness</dt>
                  <dd>{label(role.readiness)}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt>Intent alignment</dt>
                  <dd>{label(role.alignment.status)}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt>Active/relevant Pins</dt>
                  <dd>
                    {role.activePins === null
                      ? "Unavailable"
                      : `${role.activePins}/${role.relevantPins}`}
                  </dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt>Boards</dt>
                  <dd>{role.boardCount ?? "Unavailable"}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt>Impressions</dt>
                  <dd>{formatMetric(role.metrics.impressions)}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt>Outbound clicks</dt>
                  <dd>{formatMetric(role.metrics.outboundClicks)}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt>QPC</dt>
                  <dd>{formatMetric(role.qualifiedConversions)}</dd>
                </div>
              </dl>
              <p className="bg-muted/40 text-ink mt-4 rounded-xl p-3 text-sm leading-5">
                {role.recommendedAction}
              </p>
            </article>
          ))}
        </section>

        <section className="border-border overflow-hidden rounded-2xl border bg-white">
          <div className="p-5">
            <p className="section-kicker">Boards</p>
            <h2 className="font-display text-ink text-2xl font-bold">
              Advisory board eligibility
            </h2>
            <p className="text-muted-ink mt-1 text-sm">
              Bounded to 100 locally synchronized boards. Performance informs
              context but never establishes eligibility by itself.
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-muted/40">
                <tr>
                  <th className="p-3">Account</th>
                  <th className="p-3">Board</th>
                  <th className="p-3">Active</th>
                  <th className="p-3">Pins</th>
                  <th className="p-3">Relevant</th>
                  <th className="p-3">Impressions</th>
                  <th className="p-3">Outbound</th>
                  <th className="p-3">Eligibility</th>
                  <th className="p-3">Reason</th>
                </tr>
              </thead>
              <tbody>
                {report.current.boards.map((board) => (
                  <tr
                    key={`${board.accountRole}:${board.pinterestBoardId}`}
                    className="border-border border-t"
                  >
                    <td className="p-3">@{board.accountUsername}</td>
                    <td className="p-3 font-semibold">{board.name}</td>
                    <td className="p-3">{board.active ? "Yes" : "No"}</td>
                    <td className="p-3">{board.pinCount}</td>
                    <td className="p-3">{board.relevantPinCount}</td>
                    <td className="p-3">
                      {formatMetric(board.metrics.impressions)}
                    </td>
                    <td className="p-3">
                      {formatMetric(board.metrics.outboundClicks)}
                    </td>
                    <td className="p-3">{label(board.eligibility)}</td>
                    <td className="text-muted-ink p-3 text-xs">
                      {board.reasonCodes.map(label).join(", ") ||
                        "Eligible local evidence"}
                    </td>
                  </tr>
                ))}
                {!report.current.boards.length ? (
                  <tr>
                    <td colSpan={9} className="text-muted-ink p-5">
                      No synchronized boards are available.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>

        <section className="border-border rounded-2xl border bg-white p-5 sm:p-6">
          <p className="section-kicker">Monthly review</p>
          <h2 className="font-display text-ink mt-1 text-2xl font-bold">
            Latest durable result
          </h2>
          {report.latestReview ? (
            <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2 xl:grid-cols-4">
              <div>
                <dt className="text-muted-ink">Period</dt>
                <dd className="font-semibold">
                  {report.latestReview.reviewMonth.toISOString().slice(0, 7)}
                </dd>
              </div>
              <div>
                <dt className="text-muted-ink">Recommendation</dt>
                <dd className="font-semibold">
                  {label(report.latestReview.recommendation)}
                </dd>
              </div>
              <div>
                <dt className="text-muted-ink">Recommended count</dt>
                <dd className="font-semibold">
                  {report.latestReview.recommendedAccountCount}
                </dd>
              </div>
              <div>
                <dt className="text-muted-ink">Confidence</dt>
                <dd className="font-semibold">
                  {report.latestReview.confidence}%
                </dd>
              </div>
              <div className="sm:col-span-2 xl:col-span-4">
                <dt className="text-muted-ink">Major evidence and blockers</dt>
                <dd>
                  {report.latestReview.reasonCodes.map(label).join(" · ")}
                </dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="text-muted-ink">Generated</dt>
                <dd>{formatDate(report.latestReview.completedAt)}</dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="text-muted-ink">Summary</dt>
                <dd>{report.latestReview.recommendationSummary}</dd>
              </div>
            </dl>
          ) : (
            <p className="text-muted-ink mt-3 text-sm">
              No durable monthly review has completed yet.
            </p>
          )}
        </section>
      </main>
    </>
  );
}
