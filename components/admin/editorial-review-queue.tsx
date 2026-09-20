"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { Check, Circle, Send, ShieldCheck } from "lucide-react";

import { ConfirmDialog } from "@/components/admin/confirm-dialog";
import { useToast } from "@/components/providers/toast-provider";

type DraftStatus = "NEEDS_REVIEW" | "APPROVED" | "PUBLISHED" | "DISCARDED" | "FAILED";
type BulkAction = "approve" | "approve_publish" | "publish" | "discard";

interface DraftSummary {
  id: string;
  isDraft?: boolean;
  status: DraftStatus;
  generatedAt: string;
  translator: { id: string; name: string; slug: string; category: string };
  jobItem: { operation: string; attemptCount: number; lastError: string | null; jobId?: string };
  validation: {
    valid: boolean;
    duplicateFlags: string[];
    errors: string[];
    generatedSections: string[];
    readiness: { status: string; completionPercent: number };
  };
}

const lifecycle = ["Generated", "Needs review", "Approved", "Published"] as const;
const lifecycleStep: Record<DraftStatus, number> = {
  NEEDS_REVIEW: 1,
  APPROVED: 2,
  PUBLISHED: 3,
  DISCARDED: 0,
  FAILED: 0,
};

function DraftLifecycle({ status }: { status: DraftStatus }) {
  const activeStep = lifecycleStep[status];
  return (
    <ol aria-label={`Editorial lifecycle: ${status.replaceAll("_", " ").toLowerCase()}`} className="mt-3 flex max-w-xl items-start">
      {lifecycle.map((label, index) => {
        const reached = index <= activeStep && status !== "FAILED";
        const current = index === activeStep && !["DISCARDED", "FAILED"].includes(status);
        return (
          <li key={label} className="relative flex min-w-0 flex-1 flex-col items-center text-center first:items-start first:text-left last:items-end last:text-right">
            {index ? <span aria-hidden="true" className={`absolute right-1/2 top-2.5 h-0.5 w-full ${reached ? "bg-brand-500" : "bg-slate-200"}`} /> : null}
            <span className={`relative z-10 flex h-5 w-5 items-center justify-center rounded-full border-2 ${reached ? "border-brand-500 bg-brand-500 text-white" : "border-slate-300 bg-white text-slate-300"}`}>
              {reached && !current ? <Check className="h-3 w-3" aria-hidden="true" /> : <Circle className="h-2 w-2 fill-current" aria-hidden="true" />}
            </span>
            <span className={`mt-1.5 text-[10px] font-bold uppercase tracking-[0.08em] ${current ? "text-brand-800" : reached ? "text-ink" : "text-muted-ink"}`}>{label}</span>
          </li>
        );
      })}
    </ol>
  );
}

function stateLabel(status: DraftStatus) {
  if (status === "APPROVED") return "Approved — waiting to be published";
  if (status === "NEEDS_REVIEW") return "Generated — needs review";
  if (status === "PUBLISHED") return "Published to translator";
  if (status === "DISCARDED") return "Discarded";
  return "Generation failed";
}

export function EditorialReviewQueue() {
  const router = useRouter();
  const { toast } = useToast();
  const [drafts, setDrafts] = useState<DraftSummary[]>([]);
  const [status, setStatus] = useState<DraftStatus>("NEEDS_REVIEW");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [allMatching, setAllMatching] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirmAction, setConfirmAction] = useState<BulkAction | null>(null);
  const [singlePublishingId, setSinglePublishingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const params = new URLSearchParams({ status, q, page: String(page), pageSize: String(pageSize) });
    const response = await fetch(`/api/admin/translators/review?${params}`);
    const payload = await response.json();
    if (payload.ok) {
      setDrafts(payload.drafts);
      setTotal(payload.total);
      setTotalPages(payload.totalPages);
    }
  }, [page, pageSize, q, status]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 150);
    return () => window.clearTimeout(timer);
  }, [load]);

  const selectedCount = allMatching ? total : selected.size;

  function resetSelection() {
    setSelected(new Set());
    setAllMatching(false);
    setPage(1);
  }

  function toggle(id: string) {
    setAllMatching(false);
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function refreshViews() {
    setSelected(new Set());
    setAllMatching(false);
    await load();
    router.refresh();
  }

  async function runBulk() {
    if (!confirmAction) return;
    setBusy(true);
    const response = await fetch("/api/admin/translators/review/bulk", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: confirmAction, draftIds: [...selected], selectAllMatching: allMatching, filters: { status, q } }),
    });
    const payload = await response.json();
    setBusy(false);
    setConfirmAction(null);
    if (!response.ok || !payload.ok) {
      toast({ title: "Bulk action failed", description: payload?.error?.message || "Please try again.", variant: "error" });
      return;
    }
    const result = payload.result as { succeeded: number; skipped: number; failed: Array<unknown> };
    toast({
      title: `${result.succeeded} draft${result.succeeded === 1 ? "" : "s"} updated`,
      description: `${result.skipped} skipped · ${result.failed.length} failed.`,
      variant: result.failed.length ? "error" : undefined,
    });
    await refreshViews();
  }

  async function publishOne(id: string) {
    setSinglePublishingId(id);
    const response = await fetch(`/api/admin/translators/review/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "publish" }),
    });
    const payload = await response.json();
    setSinglePublishingId(null);
    if (!response.ok || !payload.ok) {
      toast({ title: "Publish failed", description: payload?.error?.message || "Please try again.", variant: "error" });
      return;
    }
    toast({ title: "Editorial content published", description: "The translator now uses this reviewed draft." });
    await refreshViews();
  }

  const confirmationDescription = confirmAction === "approve_publish"
    ? `Approve and publish editorial content for ${selectedCount} translators? This will replace their published editorial content with these reviewed drafts.`
    : `${selectedCount} matching draft${selectedCount === 1 ? "" : "s"} will be ${confirmAction === "publish" ? "published to translator pages" : confirmAction === "approve" ? "approved for publishing" : "discarded"}.`;

  return (
    <section className="overflow-hidden rounded-2xl border border-border bg-white shadow-sm">
      <div className="space-y-4 border-b border-border bg-slate-50 p-4 sm:p-5">
        <div>
          <p className="text-xs font-extrabold uppercase tracking-[0.14em] text-brand-700">Editorial lifecycle</p>
          <h2 className="font-display mt-1 text-2xl font-bold text-ink">Generated is not published</h2>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-muted-ink">Move drafts through review, then publish them to update the real translator pages.</p>
          <DraftLifecycle status="PUBLISHED" />
        </div>

        <div className="flex flex-wrap gap-2">
          <input value={q} onChange={(event) => { setQ(event.target.value); resetSelection(); }} placeholder="Search translator or category" aria-label="Search review drafts" className="h-10 min-w-56 flex-1 rounded-xl border border-border bg-white px-3 text-sm sm:max-w-sm" />
          <select value={status} onChange={(event) => { setStatus(event.target.value as DraftStatus); resetSelection(); }} aria-label="Filter by lifecycle state" className="h-10 rounded-xl border border-border bg-white px-3 text-sm">
            <option value="NEEDS_REVIEW">Needs review</option>
            <option value="APPROVED">Approved — waiting to publish</option>
            <option value="FAILED">Failed</option>
            <option value="PUBLISHED">Published</option>
            <option value="DISCARDED">Discarded</option>
          </select>
          <select value={pageSize} onChange={(event) => { setPageSize(Number(event.target.value)); resetSelection(); }} aria-label="Drafts per page" className="h-10 rounded-xl border border-border bg-white px-3 text-sm">
            <option value={25}>25 / page</option><option value={50}>50 / page</option><option value={100}>100 / page</option>
          </select>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-sm">
          <button disabled={status === "FAILED"} onClick={() => setSelected(new Set(drafts.filter((draft) => draft.isDraft !== false).map((draft) => draft.id)))} className="min-h-10 rounded-xl border border-border bg-white px-3 font-semibold text-ink transition hover:border-brand-300 hover:bg-brand-50 disabled:opacity-40">Select page</button>
          <button disabled={status === "FAILED"} onClick={() => setAllMatching(true)} className="min-h-10 rounded-xl border border-border bg-white px-3 font-semibold text-ink transition hover:border-brand-300 hover:bg-brand-50 disabled:opacity-40">Select all {total} matching</button>
          <button onClick={() => { setSelected(new Set()); setAllMatching(false); }} className="min-h-10 px-3 font-semibold text-muted-ink hover:text-ink">Clear</button>
          <span className="rounded-full bg-white px-3 py-1.5 font-bold text-ink ring-1 ring-border">{selectedCount} drafts selected</span>
          <span className="grow" />
          {status === "NEEDS_REVIEW" ? <button disabled={!selectedCount || busy} onClick={() => setConfirmAction("approve_publish")} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-brand-600 px-4 font-bold text-white shadow-sm transition hover:bg-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2 disabled:opacity-40"><Send className="h-4 w-4" />Approve &amp; Publish Selected</button> : null}
          {status === "NEEDS_REVIEW" ? <button disabled={!selectedCount || busy} onClick={() => setConfirmAction("approve")} className="min-h-10 rounded-xl bg-ink px-3 font-bold text-white disabled:opacity-40">Approve selected</button> : null}
          {status === "APPROVED" ? <button disabled={!selectedCount || busy} onClick={() => setConfirmAction("publish")} className="min-h-10 rounded-xl bg-brand-600 px-3 font-bold text-white disabled:opacity-40">Publish selected approved drafts</button> : null}
          {status !== "PUBLISHED" && status !== "FAILED" ? <button disabled={!selectedCount || busy} onClick={() => setConfirmAction("discard")} className="min-h-10 rounded-xl border border-red-200 px-3 font-semibold text-red-700 disabled:opacity-40">Discard selected</button> : null}
        </div>
      </div>

      <div className="divide-y divide-border">
        {drafts.length ? drafts.map((draft) => (
          <article key={draft.id} className={`p-4 sm:p-5 ${draft.status === "APPROVED" ? "bg-amber-50/70" : "bg-white"}`}>
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex min-w-0 items-start gap-3">
                <input type="checkbox" aria-label={`Select ${draft.translator.name}`} disabled={draft.isDraft === false} checked={draft.isDraft !== false && (allMatching || selected.has(draft.id))} onChange={() => toggle(draft.id)} className="mt-1 h-5 w-5 shrink-0 rounded border-border text-brand-600 focus:ring-brand-400" />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    {draft.isDraft === false ? <Link href={`/admin/translators/jobs/${draft.jobItem.jobId}`} className="font-display text-lg font-bold text-ink hover:text-brand-700">{draft.translator.name}</Link> : <Link href={`/admin/translators/review/${draft.id}`} className="font-display text-lg font-bold text-ink hover:text-brand-700">{draft.translator.name}</Link>}
                    <span className={`rounded-full px-2.5 py-1 text-xs font-extrabold ${draft.status === "PUBLISHED" ? "bg-emerald-100 text-emerald-800" : draft.status === "APPROVED" ? "bg-amber-200 text-amber-950" : draft.status === "NEEDS_REVIEW" ? "bg-brand-100 text-brand-900" : "bg-slate-100 text-slate-700"}`}>{stateLabel(draft.status)}</span>
                  </div>
                  <p className="mt-1 text-xs text-muted-ink">{draft.translator.category} · {draft.jobItem.operation.replaceAll("_", " ")} · generated {new Date(draft.generatedAt).toLocaleString()}</p>
                  {draft.isDraft !== false ? <DraftLifecycle status={draft.status} /> : null}
                  <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                    <span className={draft.validation.valid ? "font-bold text-emerald-700" : "font-bold text-red-700"}>{draft.validation.valid ? <><ShieldCheck className="mr-1 inline h-3.5 w-3.5" />Valid draft</> : "Invalid draft"}</span>
                    <span className="text-muted-ink">{draft.validation.readiness.completionPercent}% complete</span>
                    <span className="text-muted-ink">{draft.validation.generatedSections.join(", ") || "No generated sections"}</span>
                  </div>
                  {draft.status === "APPROVED" ? <p className="mt-3 rounded-xl border border-amber-300 bg-amber-100 px-3 py-2 text-sm font-bold text-amber-950">Approved — waiting to be published. The public translator has not changed yet.</p> : null}
                  {draft.validation.errors.length ? <p className="mt-2 text-xs text-red-700">{draft.validation.errors[0]}</p> : null}
                </div>
              </div>
              <div className="flex shrink-0 flex-wrap gap-2 pl-8 lg:pl-0">
                {draft.status === "APPROVED" ? <button disabled={singlePublishingId === draft.id} onClick={() => void publishOne(draft.id)} className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-brand-600 px-4 text-sm font-bold text-white hover:bg-brand-700 disabled:opacity-50"><Send className="h-4 w-4" />{singlePublishingId === draft.id ? "Publishing…" : "Publish now"}</button> : null}
                {draft.isDraft === false ? <Link href={`/admin/translators/jobs/${draft.jobItem.jobId}`} className="inline-flex min-h-10 items-center rounded-xl bg-ink px-3 text-xs font-bold text-white">View failure</Link> : <Link href={`/admin/translators/review/${draft.id}`} className="inline-flex min-h-10 items-center rounded-xl border border-border bg-white px-3 text-xs font-bold text-ink hover:border-brand-300">Review details</Link>}
                <Link href={`/admin/translators/${draft.translator.id}`} className="inline-flex min-h-10 items-center rounded-xl border border-border bg-white px-3 text-xs font-semibold text-ink hover:border-brand-300">Translator</Link>
              </div>
            </div>
          </article>
        )) : <div className="p-12 text-center text-sm text-muted-ink">No persisted drafts match these filters.</div>}
      </div>

      <div className="flex items-center justify-between border-t border-border p-4 text-sm text-muted-ink">
        <span>{total} total · page {page} of {totalPages}</span>
        <div className="flex gap-2"><button disabled={page <= 1} onClick={() => setPage((value) => value - 1)} className="min-h-10 rounded-xl border border-border px-3 disabled:opacity-40">Previous</button><button disabled={page >= totalPages} onClick={() => setPage((value) => value + 1)} className="min-h-10 rounded-xl border border-border px-3 disabled:opacity-40">Next</button></div>
      </div>

      <ConfirmDialog
        open={Boolean(confirmAction)}
        title={confirmAction === "approve_publish" ? `Approve & publish ${selectedCount} translator${selectedCount === 1 ? "" : "s"}?` : `${confirmAction || "Update"} ${selectedCount} draft${selectedCount === 1 ? "" : "s"}?`}
        description={confirmationDescription}
        confirmLabel={confirmAction === "approve_publish" ? `Approve & publish ${selectedCount}` : `${confirmAction || "Confirm"} ${selectedCount}`}
        variant={confirmAction === "discard" ? "danger" : "default"}
        onCancel={() => setConfirmAction(null)}
        onConfirm={() => void runBulk()}
      />
    </section>
  );
}
