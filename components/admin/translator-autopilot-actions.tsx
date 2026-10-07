"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";

export function QueueTranslatorDecisionButton({ opportunityId }: { opportunityId: string }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const router = useRouter();
  async function run() {
    setBusy(true); setMessage(null);
    try {
      const response = await fetch("/api/admin/growth/translators/decisions", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ opportunityId }) });
      const result = await response.json();
      if (!response.ok || !result.ok) throw new Error(result?.error?.message || "Unable to queue Translator Autopilot.");
      setMessage(result.created ? "Decision queued." : "Decision is already queued or complete.");
      router.refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Unable to queue Translator Autopilot."); }
    finally { setBusy(false); }
  }
  return <div className="space-y-1"><Button size="sm" type="button" disabled={busy} onClick={() => void run()}>{busy ? "Queueing…" : "Queue decision"}</Button>{message ? <p className="text-muted-ink max-w-48 text-xs">{message}</p> : null}</div>;
}

export function RollbackTranslatorButton({ translatorId, targetVersionId, expectedCurrentChecksum }: { translatorId: string; targetVersionId: string; expectedCurrentChecksum: string }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const router = useRouter();
  async function run() {
    setBusy(true); setMessage(null);
    try {
      const response = await fetch(`/api/admin/growth/translators/${translatorId}/rollback`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ targetVersionId, expectedCurrentChecksum }) });
      const result = await response.json();
      if (!response.ok || !result.ok) throw new Error(result?.error?.message || "Unable to roll back Translator.");
      setMessage(result.changed ? "Rollback completed." : "Translator already matches this version.");
      router.refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Unable to roll back Translator."); }
    finally { setBusy(false); }
  }
  return <div className="space-y-1"><Button variant="outline" size="sm" type="button" disabled={busy} onClick={() => void run()}>{busy ? "Rolling back…" : "Roll back"}</Button>{message ? <p className="text-muted-ink max-w-48 text-xs">{message}</p> : null}</div>;
}
