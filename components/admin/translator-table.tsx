"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Archive, Check, ChevronLeft, ChevronRight, Copy, ExternalLink, Eye, Image as ImageIcon, MoreHorizontal, Pencil, RefreshCcw, Send, Trash2, X } from "lucide-react";
import { useRouter } from "next/navigation";

import { ConfirmDialog } from "@/components/admin/confirm-dialog";
import { useToast } from "@/components/providers/toast-provider";
import type { AdminTranslatorFilters } from "@/lib/data/translators";
import type { AdminTranslatorDashboard, TranslatorListItem } from "@/lib/types";
import { formatDateTime } from "@/lib/utils";

interface TranslatorTableProps {
  dashboard: AdminTranslatorDashboard;
  filters: AdminTranslatorFilters;
}

interface PreviewTranslator {
  id: string;
  name: string;
  slug: string;
  isActive: boolean;
  editorialContent: {
    about: string | null;
    whatItDoes: string | null;
    differenceDescription: string | null;
  } | null;
  editorialLists: Array<{ kind: string; content: string }>;
  editorialExamples: Array<{ originalText: string; transformedText: string }>;
  editorialFaqs: Array<{ question: string; answer: string }>;
}

type ConfirmState = { type: "archive" | "unarchive" | "hard-delete"; id: string } | null;

function statusClasses(status: TranslatorListItem["editorialStatus"]) {
  if (status === "READY") return "bg-emerald-50 text-emerald-700 ring-emerald-200";
  if (status === "NEEDS_REVIEW") return "bg-amber-50 text-amber-800 ring-amber-200";
  return "bg-slate-100 text-slate-600 ring-slate-200";
}

function statusLabel(status: TranslatorListItem["editorialStatus"]) {
  return status === "READY" ? "Ready" : status === "NEEDS_REVIEW" ? "Needs review" : "Incomplete";
}

function queryHref(filters: AdminTranslatorFilters, page: number) {
  const query = new URLSearchParams();
  const values: Record<string, string | undefined> = {
    q: filters.q,
    status: filters.status && filters.status !== "all" ? filters.status : undefined,
    featured: filters.featured && filters.featured !== "all" ? filters.featured : undefined,
    category: filters.category,
    editorial: filters.editorialStatus && filters.editorialStatus !== "all" ? filters.editorialStatus : undefined,
    content: filters.content,
    indexing: filters.indexing && filters.indexing !== "all" ? filters.indexing : undefined,
    sort: filters.sort && filters.sort !== "updated" ? filters.sort : undefined,
    pageSize: filters.pageSize && filters.pageSize !== 25 ? String(filters.pageSize) : undefined,
    page: page > 1 ? String(page) : undefined,
  };
  for (const [key, value] of Object.entries(values)) if (value) query.set(key, value);
  return `/admin/translators${query.toString() ? `?${query.toString()}` : ""}`;
}

export function TranslatorTable({ dashboard, filters }: TranslatorTableProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [selectAllMatching, setSelectAllMatching] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [preview, setPreview] = useState<PreviewTranslator | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [bulkAction, setBulkAction] = useState("generate-missing");
  const [confirm, setConfirm] = useState<ConfirmState>(null);
  const pageIds = useMemo(() => dashboard.translators.map((row) => row.id), [dashboard.translators]);
  const allPageSelected = pageIds.length > 0 && pageIds.every((id) => selectedIds.has(id));
  const selectedCount = selectAllMatching ? dashboard.totalMatching : selectedIds.size;
  const target = confirm ? dashboard.translators.find((row) => row.id === confirm.id) : null;

  function togglePage(checked: boolean) {
    if (!checked) {
      setSelectedIds(new Set());
      setSelectAllMatching(false);
      return;
    }
    setSelectedIds(new Set(pageIds));
  }

  function toggleRow(id: string, checked: boolean) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (checked) next.add(id); else next.delete(id);
      return next;
    });
    setSelectAllMatching(false);
  }

  async function openPreview(id: string) {
    setPreviewId(id);
    setPreviewLoading(true);
    try {
      const response = await fetch(`/api/admin/translators/${id}`);
      const payload = await response.json();
      if (!response.ok || !payload.ok) throw new Error(payload?.error?.message || "Unable to load preview.");
      setPreview(payload.translator);
    } catch (error) {
      toast({ title: "Preview unavailable", description: error instanceof Error ? error.message : "Unable to load translator details.", variant: "error" });
      setPreviewId(null);
    } finally {
      setPreviewLoading(false);
    }
  }

  async function runRowAction(id: string, action: () => Promise<Response>, successTitle: string) {
    setBusyId(id);
    try {
      const response = await action();
      const payload = await response.json();
      if (!response.ok || !payload.ok) throw new Error(payload?.error?.message || "Action failed.");
      toast({ title: successTitle });
      router.refresh();
    } catch (error) {
      toast({ title: "Action failed", description: error instanceof Error ? error.message : "Please try again.", variant: "error" });
    } finally {
      setBusyId(null);
    }
  }

  async function runBulkAction() {
    if (!selectedCount) return;
    setBulkBusy(true);
    try {
      const response = await fetch("/api/admin/translators/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: bulkAction, translatorIds: [...selectedIds], selectAllMatching, filters }),
      });
      const payload = await response.json();
      if (!response.ok || !payload.ok) throw new Error(payload?.error?.message || "Bulk action failed.");
      toast({ title: payload.message || "Bulk action queued", description: `${selectedCount.toLocaleString()} translator${selectedCount === 1 ? "" : "s"} affected.` });
      setSelectedIds(new Set());
      setSelectAllMatching(false);
      router.refresh();
    } catch (error) {
      toast({ title: "Bulk action unavailable", description: error instanceof Error ? error.message : "Please try again.", variant: "error" });
    } finally {
      setBulkBusy(false);
    }
  }

  async function runConfirm() {
    if (!confirm) return;
    const mode = confirm.type === "hard-delete" ? "hard" : confirm.type;
    await runRowAction(confirm.id, () => fetch(`/api/admin/translators/${confirm.id}?mode=${mode}`, { method: "DELETE" }), confirm.type === "hard-delete" ? "Translator deleted" : "Translator status updated");
    setConfirm(null);
  }

  return (
    <section className="overflow-hidden rounded-2xl border border-border bg-white shadow-[0_12px_36px_-30px_rgba(15,23,42,0.55)]">
      <div className="flex flex-col gap-3 border-b border-border bg-slate-50/80 p-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-3">
          <label className="inline-flex items-center gap-2 text-sm font-semibold text-ink"><input type="checkbox" checked={allPageSelected || selectAllMatching} onChange={(event) => togglePage(event.target.checked)} className="h-4 w-4 rounded border-border text-brand-600 focus:ring-brand-500" />Select page</label>
          <span className="text-xs text-muted-ink">{dashboard.totalMatching.toLocaleString()} matching</span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {allPageSelected && !selectAllMatching && dashboard.totalMatching > pageIds.length ? <button type="button" onClick={() => setSelectAllMatching(true)} className="text-xs font-bold text-brand-700 hover:text-brand-900">Select all {dashboard.totalMatching.toLocaleString()} matching</button> : null}
          {selectedCount ? <span className="rounded-full bg-brand-100 px-2.5 py-1 text-xs font-bold text-brand-800">{selectedCount.toLocaleString()} selected</span> : null}
          <select value={bulkAction} onChange={(event) => setBulkAction(event.target.value)} disabled={!selectedCount || bulkBusy} className="h-10 rounded-xl border border-border bg-white px-3 text-xs font-semibold text-ink"><option value="generate-missing">Generate missing content</option><option value="regenerate-full">Regenerate full content</option><option value="regenerate-about">Regenerate About</option><option value="regenerate-examples">Regenerate Examples</option><option value="regenerate-faq">Regenerate FAQ</option><option value="regenerate-tips">Regenerate Tips</option><option value="activate">Activate</option><option value="deactivate">Deactivate</option></select>
          <button type="button" onClick={() => void runBulkAction()} disabled={!selectedCount || bulkBusy} className="inline-flex h-10 items-center gap-2 rounded-xl bg-ink px-3 text-xs font-bold text-white transition hover:bg-brand-800 disabled:opacity-50"><RefreshCcw className={`h-3.5 w-3.5 ${bulkBusy ? "animate-spin" : ""}`} />Run action</button>
        </div>
      </div>

      {!dashboard.translators.length ? <div className="p-12 text-center"><p className="font-display text-xl font-bold text-ink">No translators match these filters.</p><p className="mt-1 text-sm text-muted-ink">Try clearing one filter or widening the search.</p></div> : null}

      <div className="hidden overflow-x-auto md:block">
        <table className="min-w-[1120px] w-full text-left text-sm">
          <thead className="border-b border-border bg-white text-[11px] font-bold uppercase tracking-[0.12em] text-muted-ink"><tr><th className="w-12 px-4 py-3"><span className="sr-only">Select</span></th><th className="px-3 py-3">Translator</th><th className="px-3 py-3">Status</th><th className="px-3 py-3">Editorial</th><th className="px-3 py-3">Coverage</th><th className="px-3 py-3">Examples / FAQ</th><th className="px-3 py-3">Indexing</th><th className="px-3 py-3">Updated</th><th className="w-12 px-3 py-3"><span className="sr-only">Actions</span></th></tr></thead>
          <tbody className="divide-y divide-border">
            {dashboard.translators.map((row) => <DesktopRow key={row.id} row={row} selected={selectedIds.has(row.id)} busy={busyId === row.id} onToggle={toggleRow} onPreview={openPreview} onAction={runRowAction} onConfirm={setConfirm} />)}
          </tbody>
        </table>
      </div>
      <div className="divide-y divide-border md:hidden">
        {dashboard.translators.map((row) => <MobileRow key={row.id} row={row} selected={selectedIds.has(row.id)} busy={busyId === row.id} onToggle={toggleRow} onPreview={openPreview} onAction={runRowAction} onConfirm={setConfirm} />)}
      </div>

      <div className="flex flex-col gap-3 border-t border-border bg-slate-50/70 px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between"><p className="text-xs text-muted-ink">Page {dashboard.page} of {dashboard.totalPages} · Showing {dashboard.translators.length} of {dashboard.totalMatching.toLocaleString()}</p><div className="flex items-center gap-2"><Link aria-disabled={dashboard.page <= 1} href={dashboard.page <= 1 ? "#" : queryHref(filters, dashboard.page - 1)} className={`inline-flex h-9 items-center gap-1 rounded-lg border border-border bg-white px-3 text-xs font-semibold ${dashboard.page <= 1 ? "pointer-events-none opacity-40" : "hover:border-brand-300"}`}><ChevronLeft className="h-3.5 w-3.5" />Previous</Link><Link aria-disabled={dashboard.page >= dashboard.totalPages} href={dashboard.page >= dashboard.totalPages ? "#" : queryHref(filters, dashboard.page + 1)} className={`inline-flex h-9 items-center gap-1 rounded-lg border border-border bg-white px-3 text-xs font-semibold ${dashboard.page >= dashboard.totalPages ? "pointer-events-none opacity-40" : "hover:border-brand-300"}`}>Next<ChevronRight className="h-3.5 w-3.5" /></Link></div></div>

      {previewId ? <PreviewDrawer preview={preview} loading={previewLoading} onClose={() => { setPreviewId(null); setPreview(null); }} /> : null}
      <ConfirmDialog open={Boolean(confirm)} title={confirm?.type === "hard-delete" ? "Permanently delete translator?" : confirm?.type === "archive" ? "Archive translator?" : "Unarchive translator?"} description={confirm?.type === "hard-delete" ? `This permanently removes ${target?.name || "this translator"} and its related content.` : confirm?.type === "archive" ? `This hides ${target?.name || "this translator"} from public routes.` : `This restores ${target?.name || "this translator"} to public availability.`} confirmLabel={confirm?.type === "hard-delete" ? "Delete forever" : confirm?.type === "archive" ? "Archive" : "Unarchive"} variant={confirm?.type === "hard-delete" ? "danger" : "default"} onConfirm={() => void runConfirm()} onCancel={() => setConfirm(null)} />
    </section>
  );
}

function DesktopRow({ row, selected, busy, onToggle, onPreview, onAction, onConfirm }: { row: TranslatorListItem; selected: boolean; busy: boolean; onToggle: (id: string, checked: boolean) => void; onPreview: (id: string) => void; onAction: (id: string, action: () => Promise<Response>, title: string) => Promise<void>; onConfirm: (state: ConfirmState) => void }) {
  return <tr className="group transition hover:bg-slate-50/80"><td className="px-4 py-4 align-top"><input type="checkbox" checked={selected} onChange={(event) => onToggle(row.id, event.target.checked)} aria-label={`Select ${row.name}`} className="h-4 w-4 rounded border-border text-brand-600 focus:ring-brand-500" /></td><td className="max-w-[250px] px-3 py-4 align-top"><button type="button" onClick={() => onPreview(row.id)} className="text-left"><span className="block truncate font-bold text-ink hover:text-brand-700">{row.name}</span><span className="mt-1 block truncate text-xs text-muted-ink">/{row.slug}</span><span className="mt-2 flex flex-wrap gap-1">{row.categories.slice(0, 2).map((category) => <span key={category.id} className="rounded-full bg-muted-surface px-2 py-0.5 text-[10px] text-muted-ink">{category.name}</span>)}</span></button></td><td className="px-3 py-4 align-top"><span className={`inline-flex rounded-full px-2 py-1 text-[11px] font-bold ring-1 ${row.isActive ? "bg-emerald-50 text-emerald-700 ring-emerald-200" : "bg-slate-100 text-slate-600 ring-slate-200"}`}>{row.isActive ? "Active" : "Inactive"}</span>{row.isFeatured ? <span className="mt-2 block text-[10px] font-semibold text-brand-700">Featured</span> : null}</td><td className="px-3 py-4 align-top"><span className={`inline-flex rounded-full px-2 py-1 text-[11px] font-bold ring-1 ${statusClasses(row.editorialStatus)}`}>{statusLabel(row.editorialStatus)}</span><span className="mt-2 block text-[11px] text-muted-ink">{row.editorialMissing.length ? `Missing ${row.editorialMissing.slice(0, 2).join(" · ")}` : "All core sections present"}</span></td><td className="w-36 px-3 py-4 align-top"><div className="flex items-center justify-between text-[11px] font-bold text-ink"><span>{row.editorialCompletionPercent}%</span><span className="font-normal text-muted-ink">{row.editorialWordCount} words</span></div><div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100"><div className={`h-full rounded-full ${row.editorialCompletionPercent === 100 ? "bg-emerald-500" : "bg-brand-500"}`} style={{ width: `${row.editorialCompletionPercent}%` }} /></div></td><td className="px-3 py-4 align-top text-xs text-muted-ink"><span className="block font-semibold text-ink">{row.editorialExampleCount} examples</span><span>{row.editorialFaqCount} FAQs</span></td><td className="px-3 py-4 align-top">{row.indexableCandidate ? <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-700"><Check className="h-3.5 w-3.5" />Indexable</span> : <span className="text-xs font-semibold text-rose-700">Noindex candidate</span>}<span className="mt-1 block text-[10px] text-muted-ink">{row.latestIndexingStatus || "Not submitted"}</span></td><td className="px-3 py-4 align-top text-xs text-muted-ink">{formatDateTime(row.editorialUpdatedAt || row.updatedAt)}</td><td className="px-3 py-4 align-top"><ActionMenu row={row} busy={busy} onPreview={onPreview} onAction={onAction} onConfirm={onConfirm} /></td></tr>;
}

function MobileRow(props: Parameters<typeof DesktopRow>[0]) {
  const { row, selected, busy, onToggle, onPreview, onAction, onConfirm } = props;
  return <article className="p-4"><div className="flex items-start gap-3"><input type="checkbox" checked={selected} onChange={(event) => onToggle(row.id, event.target.checked)} aria-label={`Select ${row.name}`} className="mt-1 h-4 w-4 rounded border-border text-brand-600 focus:ring-brand-500" /><div className="min-w-0 flex-1"><div className="flex items-start justify-between gap-3"><button type="button" onClick={() => onPreview(row.id)} className="min-w-0 text-left"><h3 className="truncate font-bold text-ink">{row.name}</h3><p className="mt-0.5 truncate text-xs text-muted-ink">/{row.slug}</p></button><ActionMenu row={row} busy={busy} onPreview={onPreview} onAction={onAction} onConfirm={onConfirm} /></div><div className="mt-3 flex flex-wrap items-center gap-2"><span className={`rounded-full px-2 py-1 text-[11px] font-bold ring-1 ${row.isActive ? "bg-emerald-50 text-emerald-700 ring-emerald-200" : "bg-slate-100 text-slate-600 ring-slate-200"}`}>{row.isActive ? "Active" : "Inactive"}</span><span className={`rounded-full px-2 py-1 text-[11px] font-bold ring-1 ${statusClasses(row.editorialStatus)}`}>{statusLabel(row.editorialStatus)}</span><span className="text-[11px] text-muted-ink">{row.editorialCompletionPercent}% complete</span></div><div className="mt-3 grid grid-cols-3 gap-2 text-xs"><div><span className="block text-muted-ink">Examples</span><b>{row.editorialExampleCount}</b></div><div><span className="block text-muted-ink">FAQ</span><b>{row.editorialFaqCount}</b></div><div><span className="block text-muted-ink">Words</span><b>{row.editorialWordCount}</b></div></div><p className="mt-3 text-[11px] text-muted-ink">{row.editorialMissing.length ? `Missing ${row.editorialMissing.join(" · ")}` : "Editorial content is complete"}</p></div></div></article>;
}

function ActionMenu({ row, busy, onPreview, onAction, onConfirm }: { row: TranslatorListItem; busy: boolean; onPreview: (id: string) => void; onAction: (id: string, action: () => Promise<Response>, title: string) => Promise<void>; onConfirm: (state: ConfirmState) => void }) {
  return <details className="relative"><summary className="flex h-9 w-9 cursor-pointer list-none items-center justify-center rounded-lg border border-border bg-white text-muted-ink transition hover:border-brand-300 hover:text-brand-700"><MoreHorizontal className="h-4 w-4" /><span className="sr-only">Actions for {row.name}</span></summary><div className="absolute right-0 z-30 mt-2 w-52 overflow-hidden rounded-xl border border-border bg-white p-1.5 shadow-xl"><button type="button" onClick={() => onPreview(row.id)} className="menu-item"><Eye className="h-3.5 w-3.5" />Quick preview</button><Link href={`/admin/translators/${row.id}`} className="menu-item"><Pencil className="h-3.5 w-3.5" />Edit translator</Link><Link href={`/translators/${row.slug}`} target="_blank" rel="noreferrer" className="menu-item"><ExternalLink className="h-3.5 w-3.5" />View public page</Link><button type="button" disabled={busy} onClick={() => void onAction(row.id, () => fetch(`/api/admin/translators/${row.id}/duplicate`, { method: "POST" }), "Translator duplicated")} className="menu-item"><Copy className="h-3.5 w-3.5" />Duplicate</button><button type="button" disabled={busy} onClick={() => void onAction(row.id, () => fetch(`/api/admin/translators/${row.id}/regenerate-share-image`, { method: "POST" }), "Share image regenerated")} className="menu-item"><ImageIcon className="h-3.5 w-3.5" />Regenerate share image</button><button type="button" disabled={busy || !row.isActive} onClick={() => void onAction(row.id, () => fetch(`/api/admin/indexing/translator/${row.id}`, { method: "POST" }), "Indexing request processed")} className="menu-item"><Send className="h-3.5 w-3.5" />Submit to Google</button><button type="button" disabled={busy} onClick={() => void onAction(row.id, () => fetch(`/api/admin/translators/${row.id}/toggle-active`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ active: !row.isActive }) }), row.isActive ? "Translator deactivated" : "Translator activated")} className="menu-item"><Check className="h-3.5 w-3.5" />{row.isActive ? "Deactivate" : "Activate"}</button><button type="button" disabled={busy} onClick={() => onConfirm({ type: row.archivedAt ? "unarchive" : "archive", id: row.id })} className="menu-item"><Archive className="h-3.5 w-3.5" />{row.archivedAt ? "Unarchive" : "Archive"}</button><button type="button" disabled={busy} onClick={() => onConfirm({ type: "hard-delete", id: row.id })} className="menu-item text-red-700 hover:bg-red-50"><Trash2 className="h-3.5 w-3.5" />Delete permanently</button></div></details>;
}

function PreviewDrawer({ preview, loading, onClose }: { preview: PreviewTranslator | null; loading: boolean; onClose: () => void }) {
  const content = preview?.editorialContent;
  const lists = preview?.editorialLists || [];
  const examples = preview?.editorialExamples || [];
  const faq = preview?.editorialFaqs || [];
  return <div className="fixed inset-0 z-50"><button type="button" aria-label="Close preview" onClick={onClose} className="absolute inset-0 bg-ink/30 backdrop-blur-[1px]" /><aside className="absolute right-0 top-0 flex h-full w-full max-w-xl flex-col border-l border-border bg-white shadow-2xl"><div className="flex items-start justify-between border-b border-border p-5"><div><p className="section-kicker">Quick content preview</p><h2 className="font-display mt-1 text-2xl font-bold text-ink">{preview?.name || "Loading translator"}</h2><p className="mt-1 text-xs text-muted-ink">{preview ? `/${preview.slug}` : "Fetching editorial detail…"}</p></div><button type="button" onClick={onClose} className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border text-muted-ink hover:bg-muted-surface" aria-label="Close"><X className="h-4 w-4" /></button></div>{loading ? <div className="p-6 text-sm text-muted-ink">Loading editorial detail…</div> : preview ? <div className="flex-1 space-y-5 overflow-y-auto p-5"><div className="flex flex-wrap gap-2"><span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-700">{preview.isActive ? "Active" : "Inactive"}</span><span className="rounded-full bg-brand-50 px-2.5 py-1 text-xs font-bold text-brand-800">{examples.length} examples</span><span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-bold text-amber-800">{faq.length} FAQs</span></div><PreviewBlock label="About" value={content?.about} /><PreviewBlock label="What it does" value={content?.whatItDoes} /><PreviewBlock label="Difference" value={content?.differenceDescription} /><PreviewList label="Best uses" items={lists.filter((item) => item.kind === "BEST_USE").map((item) => item.content)} /><PreviewList label="Tips" items={lists.filter((item) => item.kind === "TIP").map((item) => item.content)} /><div><p className="text-xs font-bold uppercase tracking-[0.14em] text-muted-ink">Editorial status</p><p className="mt-1 text-sm text-muted-ink">Use the full editor to see missing-section guidance and generate specific drafts.</p></div></div> : null}<div className="flex flex-wrap gap-2 border-t border-border bg-slate-50 p-4"><Link href={preview ? `/admin/translators/${preview.id}` : "#"} className="inline-flex min-h-10 items-center rounded-xl bg-ink px-4 text-sm font-bold text-white">Edit translator</Link><button type="button" onClick={onClose} className="inline-flex min-h-10 items-center rounded-xl border border-border bg-white px-4 text-sm font-semibold text-ink">Close</button></div></aside></div>;
}

function PreviewBlock({ label, value }: { label: string; value?: string | null }) {
  return <div><p className="text-xs font-bold uppercase tracking-[0.14em] text-muted-ink">{label}</p><p className="mt-1 whitespace-pre-line text-sm leading-6 text-ink">{value || "Not written yet."}</p></div>;
}

function PreviewList({ label, items }: { label: string; items: string[] }) {
  return <div><p className="text-xs font-bold uppercase tracking-[0.14em] text-muted-ink">{label}</p>{items.length ? <ul className="mt-2 space-y-1 text-sm leading-6 text-ink">{items.map((item) => <li key={item} className="flex gap-2"><span className="text-brand-600">•</span>{item}</li>)}</ul> : <p className="mt-1 text-sm text-muted-ink">No items yet.</p>}</div>;
}
