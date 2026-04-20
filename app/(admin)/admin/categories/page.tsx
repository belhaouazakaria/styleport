import Link from "next/link";

import { AdminTopbar } from "@/components/admin/admin-topbar";
import { CategoryTable } from "@/components/admin/category-table";
import { listAdminCategories } from "@/lib/data/categories";

export const dynamic = "force-dynamic";

export default async function AdminCategoriesPage() {
  const categories = await listAdminCategories();

  return (
    <>
      <AdminTopbar title="Categories" subtitle="Manage discovery categories and taxonomy metadata." />
      <main className="space-y-4 p-4 sm:p-6">
        <div>
          <Link
            href="/admin/categories/new"
            className="inline-flex rounded-xl bg-brand-500 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-600"
          >
            Create category
          </Link>
        </div>
        <CategoryTable categories={categories} />
      </main>
    </>
  );
}
