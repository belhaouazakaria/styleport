import { notFound } from "next/navigation";

import { AdminTopbar } from "@/components/admin/admin-topbar";
import { TranslatorForm } from "@/components/admin/translator-form";
import { getCategoryChoices } from "@/lib/data/categories";
import { getAdminTranslatorById } from "@/lib/data/translators";
import { getAvailableModels } from "@/lib/model-catalog";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function AdminTranslatorEditPage({ params }: PageProps) {
  const { id } = await params;
  const [translator, categories, modelOptions] = await Promise.all([
    getAdminTranslatorById(id),
    getCategoryChoices(),
    getAvailableModels(),
  ]);

  if (!translator) {
    notFound();
  }

  return (
    <>
      <AdminTopbar
        title={`Edit: ${translator.name}`}
        subtitle="Update translator behavior, categories, and publishing state."
      />
      <main className="p-4 sm:p-6">
        <TranslatorForm
          mode="edit"
          categories={categories}
          modelOptions={modelOptions}
          initial={{
            id: translator.id,
            name: translator.name,
            slug: translator.slug,
            title: translator.title,
            subtitle: translator.subtitle,
            shortDescription: translator.shortDescription,
            sourceLabel: translator.sourceLabel,
            targetLabel: translator.targetLabel,
            iconName: translator.iconName,
            promptSystem: translator.promptSystem,
            promptInstructions: translator.promptInstructions,
            seoTitle: translator.seoTitle,
            seoDescription: translator.seoDescription,
            modelOverride: translator.modelOverride,
            isActive: translator.isActive,
            isFeatured: translator.isFeatured,
            showModeSelector: translator.showModeSelector,
            showSwap: translator.showSwap,
            showExamples: translator.showExamples,
            sortOrder: translator.sortOrder,
            archivedAt: translator.archivedAt ? translator.archivedAt.toISOString() : null,
            primaryCategoryId: translator.primaryCategoryId,
            categoryIds: translator.categories.map((item) => item.categoryId),
            modes: translator.modes.map((mode) => ({
              key: mode.key,
              label: mode.label,
              description: mode.description || "",
              instruction: mode.instruction,
              sortOrder: mode.sortOrder,
            })),
            examples: translator.examples.map((example) => ({
              label: example.label,
              value: example.value,
              sortOrder: example.sortOrder,
            })),
          }}
        />
      </main>
    </>
  );
}
