"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";

interface EligiblePin {
  id: string;
  pinterestPinId: string;
  title: string | null;
  attributionRefs: Array<{ publicRef: string; isActive: boolean }>;
}

export function AttributionTools({ pins }: { pins: EligiblePin[] }) {
  const [pinId, setPinId] = useState(pins[0]?.id || "");
  const [url, setUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const router = useRouter();

  async function issueRef() {
    if (!pinId) return;
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch("/api/admin/growth/attribution/refs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pinId }),
      });
      const result = await response.json();
      if (!response.ok || !result.ok) throw new Error(result?.error?.message || "Unable to issue ref.");
      setUrl(result.url);
      setMessage(result.created ? "Attribution ref issued." : "Existing stable attribution ref reused.");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to issue ref.");
    } finally {
      setBusy(false);
    }
  }

  async function enqueueCleanup() {
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch("/api/admin/growth/attribution/cleanup", { method: "POST" });
      const result = await response.json();
      if (!response.ok || !result.ok) throw new Error(result?.error?.message || "Unable to queue cleanup.");
      setMessage(result.created ? "Bounded retention cleanup queued." : "A cleanup for this hour is already queued.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to queue cleanup.");
    } finally {
      setBusy(false);
    }
  }

  return <section className="rounded-2xl border border-border bg-white p-5 sm:p-6">
    <p className="section-kicker">Controlled testing</p>
    <h2 className="font-display mt-1 text-2xl font-bold text-ink">Existing Pin test destination</h2>
    <p className="mt-2 text-sm leading-6 text-muted-ink">Generates or reuses a stable attribution URL for an active, analytics-relevant Pin. This does not edit the Pinterest Pin or call a Pinterest write API.</p>
    <div className="mt-4 flex flex-col gap-3 sm:flex-row">
      <select value={pinId} onChange={(event) => setPinId(event.target.value)} className="min-h-11 flex-1 rounded-xl border border-border bg-white px-3 text-sm" disabled={!pins.length || busy}>
        {pins.map((pin) => <option key={pin.id} value={pin.id}>{pin.title || `Pin ${pin.pinterestPinId}`}{pin.attributionRefs[0]?.isActive ? " · ref issued" : ""}</option>)}
      </select>
      <Button type="button" onClick={() => void issueRef()} disabled={!pinId || busy}>{busy ? "Working…" : "Generate/reuse test URL"}</Button>
      <Button type="button" variant="outline" onClick={() => void enqueueCleanup()} disabled={busy}>Queue retention cleanup</Button>
    </div>
    {message ? <p className="mt-3 text-sm text-muted-ink">{message}</p> : null}
    {url ? <div className="mt-3 rounded-xl bg-muted/40 p-3"><p className="text-xs font-bold uppercase text-muted-ink">Generated attribution/test destination URL</p><code className="mt-1 block break-all text-xs text-ink">{url}</code></div> : null}
  </section>;
}
