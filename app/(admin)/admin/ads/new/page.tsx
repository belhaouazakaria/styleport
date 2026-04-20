import { AdminTopbar } from "@/components/admin/admin-topbar";
import { AdForm } from "@/components/admin/ad-form";
import { getCategoryChoices } from "@/lib/data/categories";

export const dynamic = "force-dynamic";

export default async function AdminAdCreatePage() {
  const categories = await getCategoryChoices();

  return (
    <>
      <AdminTopbar title="Create Ad Placement" subtitle="Define where and how this slot appears." />
      <main className="p-4 sm:p-6">
        <AdForm mode="create" categories={categories} />
      </main>
    </>
  );
}
