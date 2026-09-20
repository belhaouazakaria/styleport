import { AdminTopbar } from "@/components/admin/admin-topbar";
import { EditorialReviewQueue } from "@/components/admin/editorial-review-queue";

export const dynamic = "force-dynamic";

export default function EditorialReviewPage() {
  return <><AdminTopbar title="Editorial review queue" subtitle="Review generated drafts before anything reaches public translator pages." /><main className="p-4 sm:p-6"><EditorialReviewQueue /></main></>;
}
