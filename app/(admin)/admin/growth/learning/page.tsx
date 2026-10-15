import Link from "next/link";

import { AdminTopbar } from "@/components/admin/admin-topbar";
import {
  ExperimentActionButton,
  LearningAnalyzeButton,
  PrepareEvergreenButton,
} from "@/components/admin/growth-learning-actions";
import { requireAdminRoute } from "@/lib/auth";
import { getLearningOverview } from "@/lib/growth/learning/service";

export const dynamic = "force-dynamic";
const humanize = (value: string) =>
  value
    .toLowerCase()
    .replaceAll("_", " ")
    .replace(/^./, (letter) => letter.toUpperCase());

function jsonRecords(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (item): item is Record<string, unknown> =>
      typeof item === "object" && item !== null && !Array.isArray(item),
  );
}

export default async function GrowthLearningPage() {
  await requireAdminRoute();
  const overview = await getLearningOverview();
  const run = overview.run;
  const evaluatedExperimentIds = new Set(
    run?.experimentEvaluations.map((evaluation) => evaluation.experimentId) ||
      [],
  );
  const performanceFindings = jsonRecords(run?.performanceFindings).slice(
    0,
    25,
  );
  const opportunityAdjustments = jsonRecords(run?.opportunityAdjustments).slice(
    0,
    25,
  );
  return (
    <>
      <AdminTopbar
        title="Evergreen & learning"
        subtitle="Evidence-led revival, performance comparisons, learned timing, and experiment findings."
      />
      <main className="space-y-8 p-4 sm:p-6 lg:p-8">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <Link
            href="/admin/growth"
            className="text-brand-700 text-sm font-bold"
          >
            ← Growth overview
          </Link>
          <LearningAnalyzeButton />
        </div>
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-950">
          <strong>Advisory boundary:</strong> evaluation never writes content,
          approves a Pin, or publishes. Preparation creates a new creative
          candidate and preserves the individual approval gate.
        </div>
        <section>
          <h2 className="font-display text-2xl font-bold">
            Controlled experiments
          </h2>
          <p className="text-muted-ink mt-1 text-sm">
            Lifecycle changes require an explicit ADMIN action; findings never
            auto-apply.
          </p>
          <div className="mt-4 space-y-3">
            {overview.experiments.length ? (
              overview.experiments.map((experiment) => {
                const readyVariants = new Set(
                  experiment.candidates
                    .filter((candidate) => candidate.status === "READY")
                    .map((candidate) => candidate.experimentVariantKey)
                    .filter(Boolean),
                ).size;
                return (
                  <article
                    key={experiment.id}
                    className="border-border flex flex-wrap items-center justify-between gap-4 rounded-2xl border bg-white p-4"
                  >
                    <div>
                      <p className="font-bold">{experiment.hypothesis}</p>
                      <p className="text-muted-ink mt-1 text-xs">
                        {humanize(experiment.dimension)} ·{" "}
                        {humanize(experiment.status)} · {readyVariants} ready
                        variants
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {experiment.status === "DRAFT" ? (
                        <ExperimentActionButton
                          experimentId={experiment.id}
                          action="START"
                          label="Start"
                        />
                      ) : null}
                      {experiment.status === "RUNNING" ? (
                        <>
                          <ExperimentActionButton
                            experimentId={experiment.id}
                            action="PAUSE"
                            label="Pause"
                          />
                          <ExperimentActionButton
                            experimentId={experiment.id}
                            action="REQUEST_ANALYSIS"
                            label="Request analysis"
                          />
                        </>
                      ) : null}
                      {experiment.status === "PAUSED" ? (
                        <>
                          <ExperimentActionButton
                            experimentId={experiment.id}
                            action="RESUME"
                            label="Resume"
                          />
                          <ExperimentActionButton
                            experimentId={experiment.id}
                            action="REQUEST_ANALYSIS"
                            label="Request analysis"
                          />
                        </>
                      ) : null}
                      {experiment.status === "ANALYZING" &&
                      evaluatedExperimentIds.has(experiment.id) ? (
                        <ExperimentActionButton
                          experimentId={experiment.id}
                          action="FINALIZE"
                          label="Finalize retained result"
                        />
                      ) : null}
                    </div>
                  </article>
                );
              })
            ) : (
              <p className="border-border text-muted-ink rounded-2xl border border-dashed p-5 text-sm">
                No active experiment lifecycle is available.
              </p>
            )}
          </div>
        </section>
        {!run ? (
          <section className="border-border rounded-2xl border border-dashed bg-white p-8 text-center">
            <h2 className="font-display text-2xl font-bold">
              No learning run yet
            </h2>
            <p className="text-muted-ink mt-2 text-sm">
              Run an explicit bounded evaluation after analytics are fresh.
            </p>
          </section>
        ) : (
          <>
            <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {[
                ["Evidence", humanize(run.evidenceQuality)],
                ["Targets", run.targetsConsidered],
                ["Recommendations", run.recommendationsProduced],
                ["Fresh through", run.completedAt.toISOString().slice(0, 10)],
              ].map(([label, value]) => (
                <div
                  key={label}
                  className="border-border rounded-2xl border bg-white p-5"
                >
                  <p className="text-muted-ink text-xs font-bold uppercase">
                    {label}
                  </p>
                  <p className="font-display mt-1 text-2xl font-bold">
                    {value}
                  </p>
                </div>
              ))}
            </section>
            <section>
              <h2 className="font-display text-2xl font-bold">
                Creative performance comparisons
              </h2>
              <p className="text-muted-ink mt-1 text-sm">
                Exposure-normalized observations from the shared 90-day evidence
                window. Missing conversion data remains unavailable, never zero.
              </p>
              {performanceFindings.length ? (
                <div className="border-border mt-4 overflow-x-auto rounded-2xl border bg-white">
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="border-border border-b">
                        <th className="p-3">Dimension</th>
                        <th className="p-3">Value</th>
                        <th className="p-3">Sample</th>
                        <th className="p-3">Outbound rate</th>
                        <th className="p-3">Evidence</th>
                        <th className="p-3">Confidence</th>
                      </tr>
                    </thead>
                    <tbody>
                      {performanceFindings.map((finding, index) => (
                        <tr
                          key={`${String(finding.dimension)}:${String(finding.value)}:${index}`}
                          className="border-border border-b last:border-0"
                        >
                          <td className="p-3 font-semibold">
                            {humanize(String(finding.dimension))}
                          </td>
                          <td className="p-3">{String(finding.value)}</td>
                          <td className="p-3">
                            {Number(finding.samples || 0)}
                          </td>
                          <td className="p-3">
                            {typeof finding.outboundRate === "number"
                              ? `${(finding.outboundRate * 100).toFixed(2)}%`
                              : "Unavailable"}
                          </td>
                          <td className="p-3">
                            {humanize(String(finding.evidenceQuality))}
                          </td>
                          <td className="p-3">
                            {Number(finding.confidence || 0)}%
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="border-border text-muted-ink mt-4 rounded-2xl border border-dashed p-5 text-sm">
                  No comparable performance sample is available.
                </p>
              )}
            </section>
            <section>
              <h2 className="font-display text-2xl font-bold">
                Revival recommendations
              </h2>
              <p className="text-muted-ink mt-1 text-sm">
                Model {run.evergreenModelVersion}; outcomes remain explainable
                and conservative.
              </p>
              <div className="mt-4 space-y-3">
                {run.recommendations.map((item) => (
                  <article
                    key={item.id}
                    className="border-border rounded-2xl border bg-white p-5"
                  >
                    <div className="flex flex-wrap justify-between gap-4">
                      <div>
                        <p className="text-brand-700 text-xs font-bold uppercase">
                          {humanize(item.destinationKind)} · {item.confidence}%
                          confidence
                        </p>
                        <h3 className="mt-1 text-lg font-bold">
                          {item.translator?.name ||
                            item.idea?.currentVersion?.title ||
                            "Unavailable destination"}
                        </h3>
                        <p className="mt-2 text-sm font-semibold">
                          {humanize(item.recommendation)} ·{" "}
                          {humanize(item.evidenceQuality)}
                        </p>
                        <p className="text-muted-ink mt-2 text-xs">
                          {item.reasonCodes.map(humanize).join(" · ")}
                        </p>
                        {item.proposedAngle ? (
                          <p className="text-muted-ink mt-2 text-sm">
                            {item.proposedAngle}
                          </p>
                        ) : null}
                      </div>
                      {item.recommendation === "REVIVE" &&
                      item.status === "PROPOSED" ? (
                        <div className="max-w-xs text-right">
                          {item.proposedArchetype === "BEFORE_AFTER" ? (
                            <p className="text-muted-ink mb-2 text-xs">
                              This queues paid AI creative generation and may
                              incur provider cost. A second confirmation is
                              required.
                            </p>
                          ) : null}
                          <PrepareEvergreenButton
                            recommendationId={item.id}
                            requiresPaidAi={
                              item.proposedArchetype === "BEFORE_AFTER"
                            }
                          />
                        </div>
                      ) : (
                        <span className="bg-muted-surface h-fit rounded-full px-3 py-1 text-xs font-bold">
                          {humanize(item.status)}
                        </span>
                      )}
                    </div>
                  </article>
                ))}
              </div>
            </section>
            <section>
              <h2 className="font-display text-2xl font-bold">
                Opportunity feedback proposals
              </h2>
              <p className="text-muted-ink mt-1 text-sm">
                Versioned advisory adjustments do not rewrite Phase 7 scores.
                Repeated cluster amplification is suppressed.
              </p>
              <div className="mt-4 space-y-3">
                {opportunityAdjustments.length ? (
                  opportunityAdjustments.map((adjustment, index) => (
                    <article
                      key={`${String(adjustment.opportunityId)}:${index}`}
                      className="border-border rounded-2xl border bg-white p-4"
                    >
                      <p className="font-bold">
                        Opportunity {String(adjustment.opportunityId)}
                      </p>
                      <p className="mt-1 text-sm">
                        Score {Number(adjustment.originalScore || 0)} →{" "}
                        {Number(adjustment.adjustedScore || 0)}
                      </p>
                      <p className="text-muted-ink mt-1 text-xs">
                        {Array.isArray(adjustment.reasonCodes)
                          ? adjustment.reasonCodes
                              .map((reason) => humanize(String(reason)))
                              .join(" · ")
                          : "No reason recorded"}
                      </p>
                    </article>
                  ))
                ) : (
                  <p className="border-border text-muted-ink rounded-2xl border border-dashed p-5 text-sm">
                    No opportunity feedback proposal is available.
                  </p>
                )}
              </div>
            </section>
            <section>
              <h2 className="font-display text-2xl font-bold">
                Learned publishing windows
              </h2>
              <p className="text-muted-ink mt-1 text-sm">
                Account-specific America/New_York evidence; insufficient samples
                remain cold start.
              </p>
              <div className="border-border mt-4 overflow-x-auto rounded-2xl border bg-white">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-border border-b">
                      <th className="p-3">Account</th>
                      <th className="p-3">Hour</th>
                      <th className="p-3">Mode</th>
                      <th className="p-3">Sample</th>
                      <th className="p-3">Confidence</th>
                    </tr>
                  </thead>
                  <tbody>
                    {run.scheduleWindows.map((window) => (
                      <tr
                        key={window.id}
                        className="border-border border-b last:border-0"
                      >
                        <td className="p-3 font-semibold">
                          @{window.account.username}
                        </td>
                        <td className="p-3">
                          {String(window.localHour).padStart(2, "0")}:00
                        </td>
                        <td className="p-3">{humanize(window.mode)}</td>
                        <td className="p-3">{window.samplePins} Pins</td>
                        <td className="p-3">{window.confidence}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
            <section>
              <h2 className="font-display text-2xl font-bold">
                Experiment findings
              </h2>
              <div className="mt-4 space-y-3">
                {run.experimentEvaluations.length ? (
                  run.experimentEvaluations.map((evaluation) => (
                    <article
                      key={evaluation.id}
                      className="border-border rounded-2xl border bg-white p-4"
                    >
                      <p className="font-bold">
                        {evaluation.experiment.hypothesis}
                      </p>
                      <p className="mt-1 text-sm">
                        {humanize(evaluation.outcome)} · {evaluation.confidence}
                        % confidence
                      </p>
                      <p className="text-muted-ink mt-1 text-xs">
                        {evaluation.reasonCodes.map(humanize).join(" · ")}
                      </p>
                    </article>
                  ))
                ) : (
                  <p className="border-border text-muted-ink rounded-2xl border border-dashed p-5 text-sm">
                    No mature controlled experiments were available.
                  </p>
                )}
              </div>
            </section>
          </>
        )}
      </main>
    </>
  );
}
