"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";

type RecoveryPreview = {
  startDate: string;
  endDate: string;
  affectedPinCount: number;
  missingObservationCount: number;
  processingObservationCount: number;
  estimatedApiRequests: number;
  perExecutionRequestBudget: number;
  capExhausted: boolean;
  previewToken: string;
  dates: Array<{
    date: string;
    missingPins: number;
    processingPins: number;
  }>;
  expectedRateLimitBudget: {
    observedRemaining: number | null;
    reserve: number;
    usableAtLastObservation: number | null;
    observedAt: string | null;
  };
};

export function GrowthAnalyticsRecovery({ accountId }: { accountId: string }) {
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [preview, setPreview] = useState<RecoveryPreview | null>(null);
  const [state, setState] = useState<
    "idle" | "previewing" | "ready" | "queueing" | "queued" | "error"
  >("idle");
  const [message, setMessage] = useState("");
  const endpoint = `/api/admin/growth/pinterest/accounts/${accountId}/analytics/recovery`;

  async function requestPreview() {
    setState("previewing");
    setMessage("");
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        mode: "PREVIEW",
        ...(startDate ? { startDate } : {}),
        ...(endDate ? { endDate } : {}),
      }),
    }).catch(() => null);
    const result = await response?.json().catch(() => null);
    if (!response?.ok || !result?.ok) {
      setState("error");
      setMessage(result?.error?.message || "Recovery preview failed.");
      return;
    }
    setPreview(result.preview);
    setStartDate(result.preview.startDate);
    setEndDate(result.preview.endDate);
    setState("ready");
  }

  async function queueRecovery() {
    if (!preview || preview.capExhausted || !preview.estimatedApiRequests)
      return;
    const confirmation = window.prompt(
      "Type RECOVER PINTEREST ANALYTICS to queue the read-only recovery.",
    );
    if (confirmation !== "RECOVER PINTEREST ANALYTICS") {
      setMessage("Recovery was not queued because confirmation did not match.");
      return;
    }
    setState("queueing");
    setMessage("");
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        mode: "QUEUE",
        startDate: preview.startDate,
        endDate: preview.endDate,
        previewToken: preview.previewToken,
        confirmation,
      }),
    }).catch(() => null);
    const result = await response?.json().catch(() => null);
    if (!response?.ok || !result?.ok) {
      setState("error");
      setMessage(result?.error?.message || "Recovery could not be queued.");
      return;
    }
    setState("queued");
    setMessage(
      result.growthEnabled
        ? "Bounded recovery queued. Run the one-shot Growth worker."
        : "Recovery queued, but Growth is disabled; the worker will not execute it until an operator enables Growth.",
    );
  }

  return (
    <section className="rounded-2xl border border-border bg-white p-5">
      <p className="section-kicker">Historical completeness</p>
      <h2 className="font-display mt-1 text-xl font-bold text-ink">
        Pinterest analytics gap recovery
      </h2>
      <p className="mt-2 text-sm leading-6 text-muted-ink">
        Preview missing and PROCESSING observations inside Pinterest&apos;s
        completed 90-day UTC window. Previewing performs no Pinterest request;
        recovery uses only read-only Pin analytics GETs.
      </p>
      <div className="mt-4 flex flex-wrap items-end gap-3">
        <label className="space-y-1 text-xs font-semibold text-muted-ink">
          <span>Start date (optional)</span>
          <input
            type="date"
            value={startDate}
            onChange={(event) => {
              setStartDate(event.target.value);
              setPreview(null);
              setState("idle");
            }}
            className="block min-h-10 rounded-xl border border-border px-3 text-sm text-ink"
          />
        </label>
        <label className="space-y-1 text-xs font-semibold text-muted-ink">
          <span>End date (optional)</span>
          <input
            type="date"
            value={endDate}
            onChange={(event) => {
              setEndDate(event.target.value);
              setPreview(null);
              setState("idle");
            }}
            className="block min-h-10 rounded-xl border border-border px-3 text-sm text-ink"
          />
        </label>
        <Button
          type="button"
          variant="outline"
          onClick={requestPreview}
          disabled={state === "previewing" || state === "queueing"}
        >
          {state === "previewing" ? "Checking…" : "Preview recovery"}
        </Button>
      </div>
      {preview ? (
        <div className="mt-4 space-y-3 rounded-xl bg-muted-surface p-4 text-sm">
          <p className="font-semibold text-ink">
            Completed UTC dates: {preview.startDate} through {preview.endDate}
          </p>
          <dl className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            <div>
              <dt className="text-muted-ink">Affected Pins</dt>
              <dd className="font-bold text-ink">{preview.affectedPinCount}</dd>
            </div>
            <div>
              <dt className="text-muted-ink">Missing observations</dt>
              <dd className="font-bold text-ink">
                {preview.missingObservationCount}
              </dd>
            </div>
            <div>
              <dt className="text-muted-ink">PROCESSING observations</dt>
              <dd className="font-bold text-ink">
                {preview.processingObservationCount}
              </dd>
            </div>
            <div>
              <dt className="text-muted-ink">Estimated GET requests</dt>
              <dd className="font-bold text-ink">
                {preview.estimatedApiRequests} · max {preview.perExecutionRequestBudget}
                /worker execution
              </dd>
            </div>
          </dl>
          <p className="text-xs text-muted-ink">
            Last observed provider budget: {preview.expectedRateLimitBudget.observedRemaining ?? "unknown"}; reserved: {preview.expectedRateLimitBudget.reserve}; usable at that observation: {preview.expectedRateLimitBudget.usableAtLastObservation ?? "unknown"}.
          </p>
          {preview.capExhausted ? (
            <p className="font-semibold text-red-700">
              Safety cap exhausted. Recovery cannot be queued from this preview.
            </p>
          ) : null}
          {preview.dates.length ? (
            <div className="max-h-48 overflow-auto rounded-lg border border-border bg-white">
              <table className="w-full text-left text-xs">
                <thead className="sticky top-0 bg-white">
                  <tr>
                    <th className="p-2">UTC date</th>
                    <th className="p-2">Missing Pins</th>
                    <th className="p-2">PROCESSING Pins</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.dates.map((row) => (
                    <tr key={row.date} className="border-t border-border">
                      <td className="p-2">{row.date}</td>
                      <td className="p-2">{row.missingPins}</td>
                      <td className="p-2">{row.processingPins}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="font-semibold text-emerald-700">
              No recoverable gaps were found.
            </p>
          )}
          <Button
            type="button"
            onClick={queueRecovery}
            disabled={
              state === "queueing" ||
              state === "queued" ||
              preview.capExhausted ||
              preview.estimatedApiRequests === 0
            }
          >
            {state === "queueing" ? "Queuing…" : "Queue confirmed recovery"}
          </Button>
        </div>
      ) : null}
      <p className="mt-3 text-sm text-muted-ink" aria-live="polite">
        {message}
      </p>
    </section>
  );
}
