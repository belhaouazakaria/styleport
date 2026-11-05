"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import type { MarketDiscoveryReport } from "@/lib/growth/market-research/gaps";

export function MarketResearchPanel({ enabled }: { enabled: boolean }) {
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<MarketDiscoveryReport | null>(null);
  async function run() {
    setRunning(true);
    setError(null);
    try {
      const response = await fetch("/api/admin/growth/market-research", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      const result = await response.json();
      if (!response.ok || !result.ok) {
        setError(result.error?.message ||
          "Market research could not be completed.");
        return;
      }
      setReport(result.report);
    } catch {
      setError("Research is unavailable. No content was created.");
    } finally {
      setRunning(false);
    }
  }
  return (
    <section className="space-y-4 rounded-2xl border border-border bg-white p-5">
      <div>
        <h2 className="font-display text-xl font-bold text-ink">
          Research market gaps
        </h2>
        <p className="mt-2 text-sm text-muted-ink">
          Compare official U.S. Pinterest Trends signals with existing SayTwist
          Translators and Ideas. Suggested topics are drafts for editorial
          review, not claims of proven demand or permission to publish.
        </p>
      </div>
      {!enabled && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm">
          Research is currently disabled. Official Trends access must be
          confirmed and the two independent research flags enabled before
          calling this source.
        </p>
      )}
      <Button type="button" onClick={run} disabled={!enabled || running}>
        {running ? "Analyzing market…" : "Run one market scan"}
      </Button>
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      {report && (
        <div className="space-y-3">
          <p className="text-sm font-semibold text-ink">
            {report.signals.length} topics for review from {report.inspected}
            {" "}source trends ({report.coveredAlready} covered already)
          </p>
          {report.signals.length === 0 && (
            <p className="text-sm text-muted-ink">
              No sufficiently relevant, original topics in this scan.
              Existing opportunities are unchanged.
            </p>
          )}
          <div className="grid gap-3 md:grid-cols-2">
            {report.signals.map(item => (
              <article key={item.topicKey} className="rounded-xl border border-border p-3">
                <h3 className="font-semibold text-ink">{item.keyword}</h3>
                <p className="mt-1 text-xs text-muted-ink">
                  {item.role.replaceAll("_", " ")} · {item.suggestedKind} ·
                  Evidence score {item.evidenceScore}/85
                </p>
                <p className="mt-1 text-xs text-muted-ink">
                  Week-over-week growth: {item.marketGrowthWeek === null ?
                    "Unavailable" : `${item.marketGrowthWeek}%`}
                </p>
                <p className="mt-1 text-xs text-muted-ink">
                  {item.rationale === "MARKET_GAP" ?
                    "Potential uncovered topic" : "Needs additional validation"}
                </p>
              </article>
            ))}
          </div>
          <p className="text-xs text-muted-ink">
            Source: official Pinterest Trends (US). Research only.
            No Pin, Translator or Idea is created by this screen.
          </p>
        </div>
      )}
    </section>
  );
}
