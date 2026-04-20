import { AdminTopbar } from "@/components/admin/admin-topbar";
import { AiTranslatorCreator } from "@/components/admin/ai-translator-creator";
import { getCategoryChoices } from "@/lib/data/categories";

export const dynamic = "force-dynamic";

export default async function AdminAiTranslatorCreatePage() {
  const categories = await getCategoryChoices();

  return (
    <>
      <AdminTopbar
        title="Create Translator With AI"
        subtitle="Use one concise brief to generate a full translator draft, review it, and publish."
      />
      <main className="p-4 sm:p-6">
        <AiTranslatorCreator categories={categories} />
      </main>
    </>
  );
}
