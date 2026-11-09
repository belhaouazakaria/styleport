"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import type { ViralPortfolioPolicy } from "@/lib/growth/viral/portfolio";

export function GrowthViralIntelligencePanel({
  initialPolicy, concepts,
}: { initialPolicy: ViralPortfolioPolicy;
  concepts: Array<{ id: string; title: string }> }) {
  const router = useRouter();
  const [policy, setPolicy] = useState(initialPolicy);
  const [busy, setBusy] = useState(false);
  const [selectedConcept, setSelectedConcept] = useState(concepts[0]?.id ?? "");
  const [ownedPinId, setOwnedPinId] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  async function request(method: "PUT" | "POST", body: object) {
    setBusy(true); setError(""); setMessage("");
    try {
      const response = await fetch("/api/admin/growth/viral", {
        method, headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const result = await response.json();
      if (!response.ok || !result.ok) {
        setError(result.error?.message || "Request rejected by Growth safety gates.");
        return;
      }
      setMessage(method === "PUT" ?
        "Policy saved. No existing Growth schedule or Pin approval changed." :
        (body as { action?: string }).action === "TRACK_PIN" ?
        "Owned Pin registered for read-only tracking." :
        (body as { action?: string }).action === "EVALUATE_WINNERS" ?
        "Saved metrics evaluated. Newly qualified winners: " +
        String(result.result?.newlyQualifiedWinners ?? 0) :
        "Source scan archived: " + String(result.result?.created ?? 0) +
        " new concepts. No Pins, images or paid AI calls.");
      router.refresh();
    } catch {
      setError("Request unavailable. No publishing action was performed.");
    } finally { setBusy(false); }
  }
  return (
    <section className="space-y-4 rounded-2xl border border-border bg-white p-5">
      <h2 className="font-display text-xl font-bold text-ink">
        Viral Growth experiment
      </h2>
      <p className="text-sm text-muted-ink">
        Research and quota settings only. New source-linked Pins must contain
        original licensed creative and link honestly to the source. Every Pin
        still needs individual approval. Successful concepts receive new,
        original SayTwist translators and Pins, not an edited destination.
      </p>
      <div className="grid gap-4 sm:grid-cols-3">
        <label className="grid gap-1 text-sm font-medium" htmlFor="viral-mode">
          Research and planning mode
          <select id="viral-mode" className="rounded-lg border border-border bg-white p-2"
            value={policy.mode} onChange={e => setPolicy({
              ...policy, mode: e.target.value as ViralPortfolioPolicy["mode"],
            })}>
            <option value="PAUSED">Paused</option>
            <option value="REVIEW">Review only</option>
            <option value="ACTIVE">Plan approved experiments</option>
          </select>
        </label>
        <label className="grid gap-1 text-sm font-medium" htmlFor="viral-share">
          Source-linked quota share (%)
          <input id="viral-share" type="number" min={0} max={100}
            className="rounded-lg border border-border p-2"
            value={policy.sourceSharePercent}
            onChange={e => setPolicy({ ...policy, sourceSharePercent:
              Math.max(0, Math.min(100, Number(e.target.value) || 0)) })}/>
        </label>
        <label className="grid gap-1 text-sm font-medium" htmlFor="viral-cap">
          Desired daily Pin limit (existing hard caps still apply)
          <input id="viral-cap" type="number" min={0} max={10}
            className="rounded-lg border border-border p-2"
            value={policy.maxPinsPerDay}
            onChange={e => setPolicy({ ...policy, maxPinsPerDay:
              Math.max(0, Math.min(10, Number(e.target.value) || 0)) })}/>
        </label>
      </div>
      <div className="flex flex-wrap gap-3">
        <Button type="button" disabled={busy}
          onClick={() => request("PUT", policy)}>
          {busy ? "Working…" : "Save planning policy"}
        </Button>
        <Button type="button" disabled={busy || policy.mode === "PAUSED"}
          onClick={() => request("POST", { action: "SCAN_CATALOG" })}>
          Scan one public catalog page
        </Button>
      </div>
      <div className="border-t border-border pt-4">
        <h3 className="font-semibold text-ink">Owned Pinterest Pin evidence</h3>
        <p className="mt-1 text-xs text-muted-ink">
          Attach an already-inventoried Pin on your own connected account to
          the same actual destination. This does not edit or publish it.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <select aria-label="Discovered concept"
            className="min-w-44 rounded-lg border border-border bg-white p-2"
            value={selectedConcept}
            onChange={e => setSelectedConcept(e.target.value)}>
            <option value="">Select a concept</option>
            {concepts.map(x => <option key={x.id} value={x.id}>{x.title}</option>)}
          </select>
          <input aria-label="Owned Pinterest Pin ID" inputMode="numeric"
            placeholder="Owned Pinterest Pin ID" value={ownedPinId}
            onChange={e => setOwnedPinId(e.target.value.replace(/[^0-9]/g, ""))}
            className="rounded-lg border border-border p-2"/>
          <Button type="button" disabled={busy || !selectedConcept ||
            !/^[0-9]{5,24}$/.test(ownedPinId)}
            onClick={() => request("POST", { action: "TRACK_PIN",
              conceptId: selectedConcept, pinterestPinId: ownedPinId })}>
            Track owned Pin
          </Button>
          <Button type="button" disabled={busy || policy.mode === "PAUSED"}
            onClick={() => request("POST", { action: "EVALUATE_WINNERS" })}>
            Analyze saved official metrics
          </Button>
        </div>
      </div>
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      {message && <p role="status" className="text-sm text-ink">{message}</p>}
    </section>
  );
}
