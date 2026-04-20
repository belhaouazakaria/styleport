import Link from "next/link";

import { AdminTopbar } from "@/components/admin/admin-topbar";
import { TranslatorTable } from "@/components/admin/translator-table";
import { listAdminTranslators } from "@/lib/data/translators";
import { getCategoryChoices } from "@/lib/data/categories";

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<{ q?: string; status?: string; featured?: string; category?: string }>;
}

export default async function AdminTranslatorsPage({ searchParams }: PageProps) {
  const params = await searchParams;

  const [translators, categories] = await Promise.all([
    listAdminTranslators({
      q: params.q,
      status:
        params.status === "active" || params.status === "inactive" || params.status === "archived"
          ? params.status
          : "all",
      featured:
        params.featured === "featured" || params.featured === "non-featured"
          ? params.featured
          : "all",
      category: params.category || undefined,
    }),
    getCategoryChoices(),
  ]);

  return (
    <>
      <AdminTopbar title="Translators" subtitle="Manage translator profiles, categories, and runtime behavior." />
      <main className="space-y-4 p-4 sm:p-6">
        <div className="flex flex-wrap gap-2">
          <Link
            href="/admin/translators/new"
            className="inline-flex rounded-xl bg-brand-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-600"
          >
            Create translator
          </Link>
          <Link
            href="/admin/translators/ai/new"
            className="inline-flex rounded-xl border border-border bg-surface px-4 py-2 text-sm font-semibold text-ink transition hover:border-brand-300 hover:bg-muted-surface"
          >
            Create with AI
          </Link>
        </div>

        <form className="grid gap-2 rounded-2xl border border-border bg-surface p-4 md:grid-cols-[1fr_170px_170px_190px_auto]">
          <input
            type="text"
            name="q"
            defaultValue={params.q || ""}
            placeholder="Search by name or slug"
            className="h-11 rounded-xl border border-border bg-surface px-3 text-ink"
          />
          <select
            name="status"
            defaultValue={params.status || "all"}
            className="h-11 rounded-xl border border-border bg-surface px-3 text-ink"
          >
            <option value="all">All statuses</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
            <option value="archived">Archived</option>
          </select>
          <select
            name="featured"
            defaultValue={params.featured || "all"}
            className="h-11 rounded-xl border border-border bg-surface px-3 text-ink"
          >
            <option value="all">All featured states</option>
            <option value="featured">Featured</option>
            <option value="non-featured">Non-featured</option>
          </select>
          <select
            name="category"
            defaultValue={params.category || ""}
            className="h-11 rounded-xl border border-border bg-surface px-3 text-ink"
          >
            <option value="">All categories</option>
            {categories.map((category) => (
              <option key={category.id} value={category.slug}>
                {category.name}
              </option>
            ))}
          </select>
          <button
            type="submit"
            className="h-11 rounded-xl bg-brand-500 px-4 text-sm font-medium text-white hover:bg-brand-600"
          >
            Filter
          </button>
        </form>

        <TranslatorTable translators={translators} />
      </main>
    </>
  );
}
