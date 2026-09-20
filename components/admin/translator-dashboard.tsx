import Link from "next/link";
import { AlertTriangle, BookOpenCheck, CircleCheck, FileQuestion, FileText, Sparkles } from "lucide-react";

import { TranslatorTable } from "@/components/admin/translator-table";
import type { AdminTranslatorFilters } from "@/lib/data/translators";
import type { AdminTranslatorDashboard } from "@/lib/types";

interface TranslatorDashboardProps {
  dashboard: AdminTranslatorDashboard;
  categories: Array<{ id: string; name: string; slug: string }>;
  filters: AdminTranslatorFilters;
}

function queryHref(filters: AdminTranslatorFilters, patch: Record<string, string | undefined>) {
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
    ...patch,
  };
  for (const [key, value] of Object.entries(values)) if (value) query.set(key, value);
  const queryString = query.toString();
  return queryString ? `/admin/translators?${queryString}` : "/admin/translators";
}

function StatCard({ label, value, detail, href, icon: Icon, tone }: { label: string; value: number; detail: string; href?: string; icon: typeof Sparkles; tone: string }) {
  const content = (
    <div className={`group rounded-2xl border p-4 transition ${href ? "hover:-translate-y-0.5 hover:border-brand-300 hover:shadow-sm" : ""} ${tone}`}>
      <div className="flex items-start justify-between gap-3">
        <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted-ink">{label}</p>
        <Icon className="h-4 w-4 text-muted-ink/70 transition group-hover:text-brand-600" />
      </div>
      <p className="mt-2 font-display text-3xl font-bold tracking-tight text-ink">{value.toLocaleString()}</p>
      <p className="mt-1 text-xs text-muted-ink">{detail}</p>
    </div>
  );
  return href ? <Link href={href}>{content}</Link> : content;
}

export function TranslatorDashboard({ dashboard, categories, filters }: TranslatorDashboardProps) {
  const { summary } = dashboard;
  const hasFilters = Boolean(filters.q || filters.category || filters.content || filters.indexing !== "all" || filters.status !== "all" || filters.editorialStatus !== "all" || filters.featured !== "all");

  return (
    <div className="space-y-5">
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
        <StatCard label="Total" value={summary.total} detail="All non-archived translators" icon={Sparkles} tone="border-border bg-white" />
        <StatCard label="Active" value={summary.active} detail="Available to visitors" icon={CircleCheck} tone="border-emerald-200 bg-emerald-50/70" href={queryHref(filters, { status: "active", page: "1" })} />
        <StatCard label="Inactive" value={summary.inactive} detail="Not currently public" icon={AlertTriangle} tone="border-border bg-muted-surface" href={queryHref(filters, { status: "inactive", page: "1" })} />
        <StatCard label="Ready" value={summary.ready} detail="Indexable candidate" icon={BookOpenCheck} tone="border-brand-200 bg-brand-50" href={queryHref(filters, { editorial: "ready", page: "1" })} />
        <StatCard label="Needs review" value={summary.needsReview} detail="Has content, needs work" icon={FileText} tone="border-amber-200 bg-amber-50" href={queryHref(filters, { editorial: "needs-review", page: "1" })} />
        <StatCard label="Incomplete" value={summary.incomplete} detail="Noindex until improved" icon={FileQuestion} tone="border-rose-200 bg-rose-50" href={queryHref(filters, { editorial: "incomplete", page: "1" })} />
      </section>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Link href={queryHref(filters, { content: "about", page: "1" })} className="rounded-xl border border-border bg-white px-4 py-3 transition hover:border-brand-300"><span className="text-xs text-muted-ink">Missing About</span><span className="mt-1 block text-xl font-bold text-ink">{summary.missingAbout}</span></Link>
        <Link href={queryHref(filters, { content: "examples", page: "1" })} className="rounded-xl border border-border bg-white px-4 py-3 transition hover:border-brand-300"><span className="text-xs text-muted-ink">Missing examples</span><span className="mt-1 block text-xl font-bold text-ink">{summary.missingExamples}</span></Link>
        <Link href={queryHref(filters, { content: "faq", page: "1" })} className="rounded-xl border border-border bg-white px-4 py-3 transition hover:border-brand-300"><span className="text-xs text-muted-ink">Missing FAQ</span><span className="mt-1 block text-xl font-bold text-ink">{summary.missingFaq}</span></Link>
        <Link href={queryHref(filters, { content: "tips", page: "1" })} className="rounded-xl border border-border bg-white px-4 py-3 transition hover:border-brand-300"><span className="text-xs text-muted-ink">Missing tips</span><span className="mt-1 block text-xl font-bold text-ink">{summary.missingTips}</span></Link>
      </section>

      <section className="flex flex-wrap items-center gap-2 rounded-2xl border border-border bg-slate-50/70 p-3 text-sm">
        <span className="mr-1 text-xs font-bold uppercase tracking-[0.12em] text-muted-ink">Quick scopes</span>
        <Link href={queryHref(filters, { status: "active", editorial: undefined, page: "1" })} className="rounded-lg border border-border bg-white px-3 py-2 text-xs font-semibold text-ink hover:border-brand-300">All active translators</Link>
        <Link href={queryHref(filters, { status: "active", editorial: "incomplete", page: "1" })} className="rounded-lg border border-border bg-white px-3 py-2 text-xs font-semibold text-ink hover:border-brand-300">Incomplete active translators</Link>
        <Link href="/admin/translators/jobs" className="ml-auto rounded-lg px-3 py-2 text-xs font-semibold text-brand-700 hover:bg-brand-50">View job history →</Link>
      </section>

      <form className="rounded-2xl border border-border bg-white p-4 shadow-[0_10px_30px_-28px_rgba(15,23,42,0.45)]">
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1.7fr)_repeat(4,minmax(0,1fr))]">
          <label className="lg:col-span-1"><span className="sr-only">Search translators</span><input name="q" defaultValue={filters.q || ""} placeholder="Search name, slug, category, or description" className="h-11 w-full rounded-xl border border-border bg-page px-3 text-sm text-ink outline-none transition placeholder:text-muted-ink/70 focus:border-brand-400 focus:ring-2 focus:ring-brand-100" /></label>
          <select name="status" defaultValue={filters.status || "all"} className="h-11 rounded-xl border border-border bg-page px-3 text-sm text-ink"><option value="all">All status</option><option value="active">Active</option><option value="inactive">Inactive</option></select>
          <select name="editorial" defaultValue={filters.editorialStatus || "all"} className="h-11 rounded-xl border border-border bg-page px-3 text-sm text-ink"><option value="all">All editorial</option><option value="ready">Ready</option><option value="needs-review">Needs review</option><option value="incomplete">Incomplete</option></select>
          <select name="indexing" defaultValue={filters.indexing || "all"} className="h-11 rounded-xl border border-border bg-page px-3 text-sm text-ink"><option value="all">All indexing</option><option value="indexable">Indexable</option><option value="noindex">Noindex candidate</option></select>
          <select name="category" defaultValue={filters.category || ""} className="h-11 rounded-xl border border-border bg-page px-3 text-sm text-ink"><option value="">All categories</option>{categories.map((category) => <option key={category.id} value={category.slug}>{category.name}</option>)}</select>
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_1fr_1fr_auto_auto]">
          <select name="content" defaultValue={filters.content || ""} className="h-10 rounded-xl border border-border bg-page px-3 text-sm text-ink"><option value="">All content coverage</option><option value="about">Missing About</option><option value="difference">Missing difference</option><option value="examples">Missing examples</option><option value="faq">Missing FAQ</option><option value="tips">Missing tips</option></select>
          <select name="sort" defaultValue={filters.sort || "updated"} className="h-10 rounded-xl border border-border bg-page px-3 text-sm text-ink"><option value="updated">Recently updated</option><option value="name">Name A–Z</option><option value="newest">Newest added</option><option value="editorial">Editorial completeness</option><option value="word-count">Word count</option><option value="examples">Examples count</option><option value="faq">FAQ count</option></select>
          <select name="pageSize" defaultValue={String(filters.pageSize || 25)} className="h-10 rounded-xl border border-border bg-page px-3 text-sm text-ink"><option value="25">25 per page</option><option value="50">50 per page</option><option value="100">100 per page</option></select>
          <button type="submit" className="h-10 rounded-xl bg-ink px-4 text-sm font-bold text-white transition hover:bg-brand-800">Apply filters</button>
          {hasFilters ? <Link href="/admin/translators" className="inline-flex h-10 items-center justify-center rounded-xl border border-border px-4 text-sm font-semibold text-muted-ink transition hover:bg-muted-surface hover:text-ink">Clear</Link> : null}
        </div>
        {hasFilters ? <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border pt-3 text-xs text-muted-ink"><span className="font-semibold text-ink">Active filters:</span>{filters.q ? <span className="rounded-full bg-muted-surface px-2.5 py-1">“{filters.q}”</span> : null}{filters.status !== "all" ? <span className="rounded-full bg-muted-surface px-2.5 py-1">{filters.status}</span> : null}{filters.editorialStatus !== "all" ? <span className="rounded-full bg-brand-50 px-2.5 py-1 text-brand-800">{filters.editorialStatus}</span> : null}{filters.content ? <span className="rounded-full bg-amber-50 px-2.5 py-1 text-amber-800">missing {filters.content}</span> : null}{filters.indexing !== "all" ? <span className="rounded-full bg-rose-50 px-2.5 py-1 text-rose-800">{filters.indexing}</span> : null}</div> : null}
      </form>

      <TranslatorTable dashboard={dashboard} filters={filters} />
    </div>
  );
}
