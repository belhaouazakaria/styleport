import Link from "next/link";

import { AdminTopbar } from "@/components/admin/admin-topbar";
import { getEditorialJobProgress } from "@/lib/translator-editorial-jobs";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function EditorialJobDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const job = await getEditorialJobProgress((await params).id);
  if (!job) notFound();
  return <><AdminTopbar title="Editorial job detail" subtitle={`${job.type.replaceAll("_", " ")} · ${job.status.replaceAll("_", " ")}`} /><main className="space-y-5 p-4 sm:p-6"><Link href="/admin/translators/jobs" className="text-sm font-semibold text-brand-700 hover:text-brand-900">← Back to jobs</Link><section className="rounded-2xl border border-border bg-white p-5"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-sm text-muted-ink">Progress</p><p className="mt-1 font-display text-3xl font-bold text-ink">{job.progress.succeededItems + job.progress.failedItems + job.progress.skippedItems} / {job.progress.totalItems}</p></div><div className="text-right text-sm text-muted-ink">{job.progress.succeededItems} succeeded · {job.progress.failedItems} failed · {job.progress.skippedItems} skipped</div></div><div className="mt-4 h-3 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-brand-500" style={{ width: `${job.progress.totalItems ? ((job.progress.succeededItems + job.progress.failedItems + job.progress.skippedItems) / job.progress.totalItems) * 100 : 0}%` }} /></div></section>{job.failedItemsDetail.length ? <section className="rounded-2xl border border-rose-200 bg-rose-50/50 p-5"><h2 className="font-display text-xl font-bold text-ink">Failed items</h2><div className="mt-4 divide-y divide-rose-200">{job.failedItemsDetail.map((item) => <div key={`${item.translator.slug}-${item.operation}`} className="py-3 text-sm"><p className="font-semibold text-ink">{item.translator.name} <span className="font-normal text-muted-ink">· {item.operation.replaceAll("_", " ")}</span></p><p className="mt-1 text-xs text-rose-800">{item.error} · attempt {item.attemptCount}</p></div>)}</div></section> : null}</main></>;
}
