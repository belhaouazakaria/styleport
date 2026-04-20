import { AdminTopbar } from "@/components/admin/admin-topbar";
import { CategoryForm } from "@/components/admin/category-form";

export const dynamic = "force-dynamic";

export default function AdminCategoryCreatePage() {
  return (
    <>
      <AdminTopbar title="Create Category" subtitle="Add a new translator discovery category." />
      <main className="p-4 sm:p-6">
        <CategoryForm mode="create" />
      </main>
    </>
  );
}
