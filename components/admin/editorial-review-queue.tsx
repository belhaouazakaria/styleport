"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { ConfirmDialog } from "@/components/admin/confirm-dialog";
import { useToast } from "@/components/providers/toast-provider";

interface DraftSummary {
  id: string; isDraft?: boolean; status: string; generatedAt: string; translator: { id: string; name: string; slug: string; category: string };
  jobItem: { operation: string; attemptCount: number; lastError: string | null; jobId?: string };
  validation: { valid: boolean; duplicateFlags: string[]; errors: string[]; generatedSections: string[]; readiness: { status: string; completionPercent: number } };
}

export function EditorialReviewQueue() {
  const { toast } = useToast();
  const [drafts, setDrafts] = useState<DraftSummary[]>([]);
  const [status, setStatus] = useState("NEEDS_REVIEW");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [allMatching, setAllMatching] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirmAction, setConfirmAction] = useState<"approve" | "publish" | "discard" | null>(null);

  const load = useCallback(async () => {
    const params = new URLSearchParams({ status, q, page: String(page), pageSize: String(pageSize) });
    const response = await fetch(`/api/admin/translators/review?${params}`);
    const payload = await response.json();
    if (payload.ok) { setDrafts(payload.drafts); setTotal(payload.total); setTotalPages(payload.totalPages); }
  }, [page, pageSize, q, status]);

  useEffect(() => { const timer = window.setTimeout(() => void load(), 150); return () => window.clearTimeout(timer); }, [load]);
  const selectedCount = allMatching ? total : selected.size;
  function resetSelection() { setSelected(new Set()); setAllMatching(false); setPage(1); }
  function toggle(id: string) { setAllMatching(false); setSelected((current) => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next; }); }

  async function runBulk() {
    if (!confirmAction) return;
    setBusy(true);
    const response = await fetch("/api/admin/translators/review/bulk", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: confirmAction, draftIds: [...selected], selectAllMatching: allMatching, filters: { status, q } }),
    });
    const payload = await response.json();
    setBusy(false); setConfirmAction(null);
    if (!response.ok || !payload.ok) { toast({ title: "Bulk action failed", description: payload?.error?.message || "Please try again.", variant: "error" }); return; }
    const result = payload.result;
    toast({ title: `${result.affected} draft${result.affected === 1 ? "" : "s"} updated`, description: `${result.skipped} skipped · ${result.failed.length} failed.` });
    setSelected(new Set()); setAllMatching(false); await load();
  }

  return <section className="overflow-hidden rounded-2xl border border-border bg-white">
    <div className="space-y-4 border-b border-border bg-slate-50 p-4">
      <div><h2 className="font-display text-xl font-bold text-ink">Generated drafts</h2><p className="mt-1 text-sm text-muted-ink">Every row is a persisted draft. Approval and publishing remain separate.</p></div>
      <div className="flex flex-wrap gap-2">
        <input value={q} onChange={(event) => { setQ(event.target.value); resetSelection(); }} placeholder="Search translator or category" className="h-10 min-w-56 rounded-xl border border-border bg-white px-3 text-sm" />
        <select value={status} onChange={(event) => { setStatus(event.target.value); resetSelection(); }} className="h-10 rounded-xl border border-border bg-white px-3 text-sm"><option value="NEEDS_REVIEW">Needs review</option><option value="APPROVED">Approved</option><option value="FAILED">Failed</option><option value="PUBLISHED">Published</option><option value="DISCARDED">Discarded</option></select>
        <select value={pageSize} onChange={(event) => { setPageSize(Number(event.target.value)); resetSelection(); }} className="h-10 rounded-xl border border-border bg-white px-3 text-sm"><option value={25}>25 / page</option><option value={50}>50 / page</option><option value={100}>100 / page</option></select>
      </div>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <button disabled={status === "FAILED"} onClick={() => setSelected(new Set(drafts.filter((draft) => draft.isDraft !== false).map((draft) => draft.id)))} className="rounded-lg border border-border bg-white px-3 py-2 font-semibold disabled:opacity-40">Select page</button>
        <button disabled={status === "FAILED"} onClick={() => setAllMatching(true)} className="rounded-lg border border-border bg-white px-3 py-2 font-semibold disabled:opacity-40">Select all {total} matching</button>
        <button onClick={() => { setSelected(new Set()); setAllMatching(false); }} className="px-3 py-2 text-muted-ink">Clear</button>
        <span className="font-semibold text-ink">{selectedCount} selected</span>
        <span className="grow" />
        {status === "NEEDS_REVIEW" ? <button disabled={!selectedCount || busy} onClick={() => setConfirmAction("approve")} className="rounded-lg bg-ink px-3 py-2 font-bold text-white disabled:opacity-40">Approve selected</button> : null}
        {status === "APPROVED" ? <button disabled={!selectedCount || busy} onClick={() => setConfirmAction("publish")} className="rounded-lg bg-brand-600 px-3 py-2 font-bold text-white disabled:opacity-40">Publish selected</button> : null}
        {status !== "PUBLISHED" && status !== "FAILED" ? <button disabled={!selectedCount || busy} onClick={() => setConfirmAction("discard")} className="rounded-lg border border-red-200 px-3 py-2 font-semibold text-red-700 disabled:opacity-40">Discard selected</button> : null}
      </div>
    </div>
    <div className="divide-y divide-border">{drafts.length ? drafts.map((draft) => <article key={draft.id} className="flex flex-col gap-3 p-4 lg:flex-row lg:items-center lg:justify-between">
      <div className="flex items-start gap-3"><input type="checkbox" disabled={draft.isDraft === false} checked={draft.isDraft !== false && (allMatching || selected.has(draft.id))} onChange={() => toggle(draft.id)} className="mt-1 h-4 w-4" /><div>{draft.isDraft === false ? <Link href={`/admin/translators/jobs/${draft.jobItem.jobId}`} className="font-bold text-ink hover:text-brand-700">{draft.translator.name}</Link> : <Link href={`/admin/translators/review/${draft.id}`} className="font-bold text-ink hover:text-brand-700">{draft.translator.name}</Link>}<p className="mt-1 text-xs text-muted-ink">{draft.translator.category} · {draft.jobItem.operation.replaceAll("_", " ")} · {new Date(draft.generatedAt).toLocaleString()}</p><p className="mt-2 text-xs"><span className={draft.validation.valid ? "font-semibold text-emerald-700" : "font-semibold text-red-700"}>{draft.validation.valid ? "Valid generated draft" : draft.status === "FAILED" ? "Generation failed" : "Invalid draft"}</span> · {draft.validation.readiness.completionPercent}% complete · {draft.validation.generatedSections.join(", ") || "No generated sections"}</p>{draft.validation.errors.length ? <p className="mt-1 text-xs text-red-700">{draft.validation.errors[0]}</p> : null}</div></div>
      <div className="flex gap-2">{draft.isDraft === false ? <Link href={`/admin/translators/jobs/${draft.jobItem.jobId}`} className="rounded-xl bg-ink px-3 py-2 text-xs font-bold text-white">View failure</Link> : <Link href={`/admin/translators/review/${draft.id}`} className="rounded-xl bg-ink px-3 py-2 text-xs font-bold text-white">Review</Link>}<Link href={`/admin/translators/${draft.translator.id}`} className="rounded-xl border border-border px-3 py-2 text-xs font-semibold text-ink">Translator</Link></div>
    </article>) : <div className="p-12 text-center text-sm text-muted-ink">No persisted drafts match these filters.</div>}</div>
    <div className="flex items-center justify-between border-t border-border p-4 text-sm"><span>{total} total · page {page} of {totalPages}</span><div className="flex gap-2"><button disabled={page <= 1} onClick={() => setPage((value) => value - 1)} className="rounded-lg border border-border px-3 py-2 disabled:opacity-40">Previous</button><button disabled={page >= totalPages} onClick={() => setPage((value) => value + 1)} className="rounded-lg border border-border px-3 py-2 disabled:opacity-40">Next</button></div></div>
    <ConfirmDialog open={Boolean(confirmAction)} title={`${confirmAction || "Update"} ${selectedCount} draft${selectedCount === 1 ? "" : "s"}?`} description={`${selectedCount} matching draft${selectedCount === 1 ? "" : "s"} will be ${confirmAction === "publish" ? "published to translator pages" : confirmAction === "approve" ? "approved for publishing" : "discarded"}.`} confirmLabel={`${confirmAction || "Confirm"} ${selectedCount}`} variant={confirmAction === "discard" ? "danger" : "default"} onCancel={() => setConfirmAction(null)} onConfirm={() => void runBulk()} />
  </section>;
}
