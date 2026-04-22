import { notFound } from "next/navigation";

import { AdminTopbar } from "@/components/admin/admin-topbar";
import { RequestDetail } from "@/components/admin/request-detail";
import { getAdminTranslatorRequestById } from "@/lib/data/requests";

interface PageProps {
  params: Promise<{ id: string }>;
}

export const dynamic = "force-dynamic";

export default async function AdminRequestDetailPage({ params }: PageProps) {
  const { id } = await params;
  const request = await getAdminTranslatorRequestById(id);

  if (!request) {
    notFound();
  }

  return (
    <>
      <AdminTopbar
        title={`Submission: ${request.requestedName}`}
        subtitle="Review details, update status, and approve to create a translator with AI."
      />
      <main className="p-4 sm:p-6">
        <RequestDetail request={request} />
      </main>
    </>
  );
}
