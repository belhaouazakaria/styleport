"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type BudgetWarning = {
  id: string;
  createdAt: string;
  thresholdPercent: 70 | 90 | null;
  state: "OPEN" | "ACKNOWLEDGED" | "RESOLVED";
};

export function GrowthBudgetWarnings({ warnings }: { warnings: BudgetWarning[] }) {
  const router = useRouter();
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function act(warningId: string, transition: "ACKNOWLEDGE" | "RESOLVE") {
    setPending(warningId);
    setError(null);
    try {
      const response = await fetch("/api/admin/growth/warnings/transition", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ warningId, transition }),
      });
      if (!response.ok) throw new Error("The warning state changed or the request was not authorized.");
      router.refresh();
    } catch {
      setError("Could not update the warning. Refresh the page and verify administrator permissions.");
    } finally {
      setPending(null);
    }
  }

  return (
    <section className="overflow-hidden rounded-2xl border border-border bg-white">
      <div className="p-5">
        <h2 className="font-display text-xl font-bold text-ink">Growth budget warnings</h2>
        <p className="mt-2 text-sm text-muted-ink">
          Warnings are recorded at 70% and 90% of reserved budget. Acknowledging or resolving
          changes the audit state only; it does not release reserved money, change the budget or enable Growth.
        </p>
        {error ? <p role="alert" className="mt-2 text-sm text-red-700">{error}</p> : null}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="bg-muted/40"><tr>
            <th className="p-3">UTC occurrence</th><th className="p-3">Threshold</th>
            <th className="p-3">State</th><th className="p-3">Operator action</th>
          </tr></thead>
          <tbody>
            {warnings.map((w) => <tr key={w.id} className="border-t border-border">
              <td className="p-3">{w.createdAt.slice(0, 16).replace("T", " ")}</td>
              <td className="p-3">{w.thresholdPercent === null ? "Unknown" : `${w.thresholdPercent}%`}</td>
              <td className="p-3">{w.state}</td>
              <td className="p-3">
                {w.state === "OPEN" ? <button type="button" disabled={pending !== null}
                  className="rounded-lg border border-border px-3 py-1 disabled:opacity-50"
                  onClick={() => void act(w.id, "ACKNOWLEDGE")}>Acknowledge</button> : null}
                {w.state === "ACKNOWLEDGED" ? <button type="button" disabled={pending !== null}
                  className="rounded-lg border border-border px-3 py-1 disabled:opacity-50"
                  onClick={() => void act(w.id, "RESOLVE")}>Resolve</button> : null}
                {w.state === "RESOLVED" ? "Closed" : null}
              </td>
            </tr>)}
            {!warnings.length && <tr><td colSpan={4} className="p-5 text-muted-ink">No persisted Growth budget warnings.</td></tr>}
          </tbody>
        </table>
      </div>
      <p className="p-4 text-xs text-muted-ink">Showing 50 most recent warning events; original audit history remains immutable.</p>
    </section>
  );
}
