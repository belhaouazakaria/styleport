"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

interface DraftSummary { id: string; status: string; generatedAt: string; translator: { id: string; name: string; slug: string }; jobItem: { operation: string; attemptCount: number; lastError: string | null }; validation: { duplicateFlags?: string[]; errors?: string[] }; }

export function EditorialReviewQueue() {
  const [drafts, setDrafts] = useState<DraftSummary[]>([]);
  const [status, setStatus] = useState("NEEDS_REVIEW");
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async (nextStatus: string) => {
    const response = await fetch(`/api/admin/translators/review?status=${nextStatus}`);
    const payload = await response.json();
    if (payload.ok) setDrafts(payload.drafts);
  }, []);
  useEffect(() => {
    const timer = window.setTimeout(() => { void load(status); }, 0);
    return () => window.clearTimeout(timer);
  }, [load, status]);

  async function action(id: string, value: "approve" | "discard" | "publish") {
    setBusy(id);
    await fetch(`/api/admin/translators/review/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: value }) });
    await load(status);
    setBusy(null);
  }

  return <section className="overflow-hidden rounded-2xl border border-border bg-white"><div className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-slate-50 p-4"><div><h2 className="font-display text-xl font-bold text-ink">Generated drafts</h2><p className="mt-1 text-sm text-muted-ink">Approve and publish are separate actions. Generation never publishes.</p></div><select value={status} onChange={(event) => setStatus(event.target.value)} className="h-10 rounded-xl border border-border bg-white px-3 text-sm"><option value="NEEDS_REVIEW">Needs review</option><option value="APPROVED">Approved</option><option value="PUBLISHED">Published</option><option value="DISCARDED">Discarded</option></select></div><div className="divide-y divide-border">{drafts.length ? drafts.map((draft) => <article key={draft.id} className="flex flex-col gap-3 p-4 lg:flex-row lg:items-center lg:justify-between"><div><Link href={`/admin/translators/review/${draft.id}`} className="font-bold text-ink hover:text-brand-700">{draft.translator.name}</Link><p className="mt-1 text-xs text-muted-ink">{draft.jobItem.operation.replaceAll("_", " ")} · generated {new Date(draft.generatedAt).toLocaleString()}</p>{draft.validation?.duplicateFlags?.length ? <p className="mt-2 text-xs font-semibold text-amber-700">Duplicate-content flags: {draft.validation.duplicateFlags.length}</p> : null}</div><div className="flex flex-wrap gap-2">{draft.status === "NEEDS_REVIEW" ? <><button disabled={busy === draft.id} onClick={() => void action(draft.id, "approve")} className="rounded-xl bg-ink px-3 py-2 text-xs font-bold text-white">Approve</button><button disabled={busy === draft.id} onClick={() => void action(draft.id, "discard")} className="rounded-xl border border-border px-3 py-2 text-xs font-semibold text-ink">Discard</button></> : null}{draft.status === "APPROVED" ? <button disabled={busy === draft.id} onClick={() => void action(draft.id, "publish")} className="rounded-xl bg-brand-600 px-3 py-2 text-xs font-bold text-white">Publish</button> : null}<Link href={`/admin/translators/${draft.translator.id}`} className="rounded-xl border border-border px-3 py-2 text-xs font-semibold text-ink">Open translator</Link></div></article>) : <div className="p-12 text-center text-sm text-muted-ink">No drafts in this queue.</div>}</div></section>;
}
