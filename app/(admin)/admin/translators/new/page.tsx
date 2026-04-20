import Link from "next/link";

import { AdminTopbar } from "@/components/admin/admin-topbar";
import { TranslatorForm } from "@/components/admin/translator-form";
import { getCategoryChoices } from "@/lib/data/categories";
import { getAvailableModels } from "@/lib/model-catalog";

export const dynamic = "force-dynamic";

export default async function AdminTranslatorCreatePage() {
  const [categories, modelOptions] = await Promise.all([getCategoryChoices(), getAvailableModels()]);

  return (
    <>
      <AdminTopbar title="Create Translator" subtitle="Define prompts, categories, models, and public UX behavior." />
      <main className="p-4 sm:p-6">
        <div className="mb-4">
          <Link
            href="/admin/translators/ai/new"
            className="inline-flex rounded-xl border border-border bg-surface px-4 py-2 text-sm font-semibold text-ink transition hover:border-brand-300 hover:bg-muted-surface"
          >
            Create with AI instead
          </Link>
        </div>
        <TranslatorForm mode="create" categories={categories} modelOptions={modelOptions} />
      </main>
    </>
  );
}
