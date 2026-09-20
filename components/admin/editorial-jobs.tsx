"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Pause, Play, RotateCcw, Square } from "lucide-react";

interface JobSummary {
  id: string;
  type: string;
  status: string;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  totalItems: number;
  succeededItems: number;
  failedItems: number;
  skippedItems: number;
  requestedBy: string;
}

export function EditorialJobs({ initialJobs }: { initialJobs: JobSummary[] }) {
  const [jobs, setJobs] = useState(initialJobs);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    const hasActive = jobs.some((job) => ["PENDING", "RUNNING", "PAUSED"].includes(job.status));
    if (!hasActive) return;
    const timer = window.setInterval(() => {
      void fetch("/api/admin/translators/jobs").then((response) => response.json()).then((payload) => {
        if (payload.ok) setJobs(payload.jobs);
      });
    }, 4000);
    return () => window.clearInterval(timer);
  }, [jobs]);

  async function action(id: string, value: "pause" | "resume" | "cancel" | "retry-failed") {
    setBusy(id);
    await fetch(`/api/admin/translators/jobs/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: value }) });
    const response = await fetch("/api/admin/translators/jobs");
    const payload = await response.json();
    if (payload.ok) setJobs(payload.jobs);
    setBusy(null);
  }

  return <section className="overflow-hidden rounded-2xl border border-border bg-white"><div className="hidden grid-cols-[1.5fr_1fr_1fr_1fr_1.3fr_auto] gap-4 border-b border-border bg-slate-50 px-4 py-3 text-[11px] font-bold uppercase tracking-[0.12em] text-muted-ink md:grid"><span>Job</span><span>Status</span><span>Progress</span><span>Created</span><span>Requested by</span><span /></div><div className="divide-y divide-border">{jobs.length ? jobs.map((job) => { const progress = job.totalItems ? Math.round(((job.succeededItems + job.failedItems + job.skippedItems) / job.totalItems) * 100) : 0; const active = ["PENDING", "RUNNING", "PAUSED"].includes(job.status); return <article key={job.id} className="grid gap-3 px-4 py-4 md:grid-cols-[1.5fr_1fr_1fr_1fr_1.3fr_auto] md:items-center md:gap-4"><div><Link href={`/admin/translators/jobs/${job.id}`} className="font-bold text-ink hover:text-brand-700">{job.type.replaceAll("_", " ")}</Link><p className="mt-1 text-xs text-muted-ink">{job.totalItems.toLocaleString()} translators</p></div><span className={`w-fit rounded-full px-2 py-1 text-[11px] font-bold ${job.status === "COMPLETED" ? "bg-emerald-50 text-emerald-700" : job.status === "COMPLETED_WITH_ERRORS" || job.status === "FAILED" ? "bg-rose-50 text-rose-700" : job.status === "PAUSED" ? "bg-amber-50 text-amber-800" : "bg-brand-50 text-brand-800"}`}>{job.status.replaceAll("_", " ")}</span><div><div className="flex justify-between text-xs"><span>{job.succeededItems + job.failedItems + job.skippedItems} / {job.totalItems}</span><span>{progress}%</span></div><div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-brand-500" style={{ width: `${progress}%` }} /></div><p className="mt-1 text-[11px] text-muted-ink">{job.succeededItems} succeeded · {job.failedItems} failed · {job.skippedItems} skipped</p></div><span className="text-xs text-muted-ink">{new Date(job.createdAt).toLocaleString()}</span><span className="text-xs text-muted-ink">{job.requestedBy}</span><div className="flex items-center gap-1 md:justify-end">{active && job.status !== "PAUSED" ? <button title="Pause" disabled={busy === job.id} onClick={() => void action(job.id, "pause")} className="rounded-lg border border-border p-2 text-muted-ink hover:text-ink"><Pause className="h-3.5 w-3.5" /></button> : null}{job.status === "PAUSED" ? <button title="Resume" disabled={busy === job.id} onClick={() => void action(job.id, "resume")} className="rounded-lg border border-border p-2 text-muted-ink hover:text-ink"><Play className="h-3.5 w-3.5" /></button> : null}{active ? <button title="Cancel" disabled={busy === job.id} onClick={() => void action(job.id, "cancel")} className="rounded-lg border border-border p-2 text-muted-ink hover:text-rose-700"><Square className="h-3.5 w-3.5" /></button> : null}{job.failedItems ? <button title="Retry failed" disabled={busy === job.id} onClick={() => void action(job.id, "retry-failed")} className="rounded-lg border border-border p-2 text-muted-ink hover:text-brand-700"><RotateCcw className="h-3.5 w-3.5" /></button> : null}</div></article>; }) : <div className="p-12 text-center text-sm text-muted-ink">No editorial jobs yet.</div>}</div></section>;
}
