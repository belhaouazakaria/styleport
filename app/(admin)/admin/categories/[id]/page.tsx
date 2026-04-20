import { notFound } from "next/navigation";

import { AdminTopbar } from "@/components/admin/admin-topbar";
import { CategoryForm } from "@/components/admin/category-form";
import { getAdminCategoryById } from "@/lib/data/categories";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function AdminCategoryEditPage({ params }: PageProps) {
  const { id } = await params;
  const category = await getAdminCategoryById(id);

  if (!category) {
    notFound();
  }

  return (
    <>
      <AdminTopbar title={`Edit: ${category.name}`} subtitle="Update category behavior and metadata." />
      <main className="p-4 sm:p-6">
        <CategoryForm
          mode="edit"
          initial={{
            id: category.id,
            name: category.name,
            slug: category.slug,
            description: category.description,
            sortOrder: category.sortOrder,
            isActive: category.isActive,
            iconKey: category.iconKey,
            seoTitle: category.seoTitle,
            seoDescription: category.seoDescription,
            archivedAt: category.archivedAt ? category.archivedAt.toISOString() : null,
          }}
        />
      </main>
    </>
  );
}
