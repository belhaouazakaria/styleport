import Link from "next/link";

import { AdminTopbar } from "@/components/admin/admin-topbar";
import { TranslatorDashboard } from "@/components/admin/translator-dashboard";
import { getCategoryChoices } from "@/lib/data/categories";
import { getAdminTranslatorDashboard, type AdminTranslatorFilters } from "@/lib/data/translators";

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function valueOf(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function parseFilters(params: Record<string, string | string[] | undefined>): AdminTranslatorFilters {
  const status = valueOf(params.status);
  const editorialStatus = valueOf(params.editorial);
  const content = valueOf(params.content);
  const indexing = valueOf(params.indexing);
  const sort = valueOf(params.sort);
  const pageSize = Number(valueOf(params.pageSize) || 25);

  return {
    q: valueOf(params.q) || undefined,
    status: status === "active" || status === "inactive" || status === "archived" ? status : "all",
    featured: valueOf(params.featured) === "featured" || valueOf(params.featured) === "non-featured" ? valueOf(params.featured) as "featured" | "non-featured" : "all",
    category: valueOf(params.category) || undefined,
    editorialStatus: editorialStatus === "incomplete" || editorialStatus === "needs-review" || editorialStatus === "ready" ? editorialStatus : "all",
    content: content === "about" || content === "examples" || content === "faq" || content === "tips" || content === "difference" ? content : undefined,
    indexing: indexing === "indexable" || indexing === "noindex" ? indexing : "all",
    sort: sort === "name" || sort === "newest" || sort === "editorial" || sort === "word-count" || sort === "examples" || sort === "faq" ? sort : "updated",
    page: Math.max(1, Number(valueOf(params.page) || 1) || 1),
    pageSize: [25, 50, 100].includes(pageSize) ? pageSize : 25,
  };
}

export default async function AdminTranslatorsPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const filters = parseFilters(params);
  const [dashboard, categories] = await Promise.all([
    getAdminTranslatorDashboard(filters),
    getCategoryChoices(),
  ]);

  return (
    <>
      <AdminTopbar title="Translator operations" subtitle="A focused control room for quality, publishing, and day-to-day translator maintenance." />
      <main className="space-y-5 p-4 sm:p-6 lg:p-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-muted-ink">Content control room</p>
            <p className="mt-1 text-sm text-muted-ink">Review the catalogue, fix the gaps, and keep indexable pages genuinely useful.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/admin/translators/new" className="inline-flex min-h-11 items-center rounded-xl bg-brand-500 px-4 text-sm font-bold text-white shadow-sm transition hover:bg-brand-600">Create translator</Link>
            <Link href="/admin/translators/ai/new" className="inline-flex min-h-11 items-center rounded-xl border border-border bg-white px-4 text-sm font-bold text-ink transition hover:border-brand-300 hover:bg-muted-surface">Create with AI</Link>
          </div>
        </div>
        <TranslatorDashboard dashboard={dashboard} categories={categories} filters={filters} />
      </main>
    </>
  );
}
