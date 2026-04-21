import { AdminTopbar } from "@/components/admin/admin-topbar";
import { SettingsForm } from "@/components/admin/settings-form";
import { getAppSettings } from "@/lib/settings";
import { prisma } from "@/lib/prisma";
import { getAvailableModels } from "@/lib/model-catalog";
import { getAutoFeaturedSummary } from "@/lib/data/translators";

export const dynamic = "force-dynamic";

export default async function AdminSettingsPage() {
  const [settings, translators, modelOptions, autoFeatured] = await Promise.all([
    getAppSettings(),
    prisma.translator.findMany({
      where: { archivedAt: null },
      select: {
        id: true,
        slug: true,
        name: true,
        isActive: true,
      },
      orderBy: [{ sortOrder: "asc" }, { updatedAt: "desc" }],
    }),
    getAvailableModels(),
    getAutoFeaturedSummary(),
  ]);

  return (
    <>
      <AdminTopbar title="Settings" subtitle="Control global brand, discovery, model, and monetization defaults." />
      <main className="p-4 sm:p-6">
        <SettingsForm
          initial={settings}
          translators={translators}
          modelOptions={modelOptions}
          autoFeatured={autoFeatured}
        />
      </main>
    </>
  );
}
