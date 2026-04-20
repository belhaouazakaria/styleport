import { notFound } from "next/navigation";

import { AdminTopbar } from "@/components/admin/admin-topbar";
import { AdForm } from "@/components/admin/ad-form";
import { getAdById } from "@/lib/data/ads";
import { getCategoryChoices } from "@/lib/data/categories";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function AdminAdEditPage({ params }: PageProps) {
  const { id } = await params;
  const [ad, categories] = await Promise.all([getAdById(id), getCategoryChoices()]);

  if (!ad) {
    notFound();
  }

  return (
    <>
      <AdminTopbar title={`Edit: ${ad.name}`} subtitle="Update placement settings and activation state." />
      <main className="p-4 sm:p-6">
        <AdForm
          mode="edit"
          categories={categories}
          initial={{
            id: ad.id,
            name: ad.name,
            key: ad.key,
            description: ad.description,
            pageType: ad.pageType,
            deviceType: ad.deviceType,
            placementType: ad.placementType,
            providerType: ad.providerType,
            adSenseSlot: ad.adSenseSlot,
            codeSnippet: ad.codeSnippet,
            categoryId: ad.categoryId,
            isActive: ad.isActive,
            sortOrder: ad.sortOrder,
            archivedAt: ad.archivedAt ? ad.archivedAt.toISOString() : null,
          }}
        />
      </main>
    </>
  );
}
