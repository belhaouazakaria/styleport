"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

async function mutate(url: string, body: unknown) {
  const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const payload = await response.json() as { ok: boolean; error?: { message?: string } };
  if (!response.ok || !payload.ok) throw new Error(payload.error?.message || "Request failed.");
}

export function QueueIdeaDecisionButton({ opportunityId }: { opportunityId: string }) {
  const router = useRouter(); const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  return <div className="sm:text-right"><button type="button" disabled={busy} onClick={async () => { setBusy(true); setError(""); try { await mutate("/api/admin/growth/ideas/decisions", { opportunityId }); router.refresh(); } catch (value) { setError(value instanceof Error ? value.message : "Request failed."); } finally { setBusy(false); } }} className="min-h-10 rounded-full bg-ink px-5 py-2 text-sm font-bold text-white transition hover:bg-brand-800 disabled:opacity-60">{busy ? "Adding to queue…" : "Plan this Idea"}</button>{error ? <p role="alert" className="mt-2 max-w-xs text-xs text-red-700">{error}</p> : null}</div>;
}

export function IdeaVersionActions({ ideaId, checksum, versions, archived }: { ideaId: string; checksum: string; versions: Array<{ id: string; version: number }>; archived: boolean }) {
  const router = useRouter(); const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  async function run(url: string, body: unknown) { setBusy(true); setError(""); try { await mutate(url, body); router.refresh(); } catch (value) { setError(value instanceof Error ? value.message : "Request failed."); } finally { setBusy(false); } }
  return <div className="space-y-2"><div className="flex flex-wrap gap-2">{!archived ? <><button type="button" disabled={busy} onClick={() => run(`/api/admin/growth/ideas/${ideaId}/archive`, { expectedCurrentChecksum: checksum })} className="rounded-full border border-border px-3.5 py-2 text-xs font-bold text-muted-ink transition hover:border-red-200 hover:bg-red-50 hover:text-red-800">Archive</button>{versions.map((item) => <button key={item.id} type="button" disabled={busy} onClick={() => run(`/api/admin/growth/ideas/${ideaId}/rollback`, { targetVersionId: item.id, expectedCurrentChecksum: checksum })} className="rounded-full border border-border px-3.5 py-2 text-xs font-bold text-ink transition hover:border-brand-300 hover:bg-brand-50">Restore v{item.version}</button>)}</> : null}</div>{error ? <p role="alert" className="text-xs text-red-700">{error}</p> : null}</div>;
}
