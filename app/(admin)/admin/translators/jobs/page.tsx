import Link from "next/link";

import { AdminTopbar } from "@/components/admin/admin-topbar";
import { EditorialJobs } from "@/components/admin/editorial-jobs";
import { listEditorialJobs } from "@/lib/translator-editorial-jobs";

export const dynamic = "force-dynamic";

export default async function EditorialJobsPage() {
  return (
    <>
      <AdminTopbar title="Editorial jobs" subtitle="Background generation progress and safe recovery controls." />
      <main className="space-y-5 p-4 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="max-w-2xl text-sm leading-6 text-muted-ink">Jobs generate review-only drafts. Published translator content is never changed by the worker.</p>
          <Link href="/admin/translators/review" className="rounded-xl border border-border bg-white px-4 py-2 text-sm font-semibold text-ink hover:border-brand-300">Open review queue</Link>
        </div>
        <EditorialJobs initialJobs={await listEditorialJobs()} />
      </main>
    </>
  );
}
