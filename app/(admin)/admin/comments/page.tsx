import { CommentModerationStatus } from "@prisma/client";

import { AdminTopbar } from "@/components/admin/admin-topbar";
import { CommentTable } from "@/components/admin/comment-table";
import { listAdminTranslatorComments } from "@/lib/data/comments";

interface PageProps {
  searchParams: Promise<{
    q?: string;
    status?: string;
  }>;
}

export const dynamic = "force-dynamic";

function parseStatus(value?: string) {
  if (!value || value === "all") {
    return "all";
  }

  return Object.values(CommentModerationStatus).includes(value as CommentModerationStatus)
    ? (value as CommentModerationStatus)
    : "all";
}

export default async function AdminCommentsPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const comments = await listAdminTranslatorComments({
    q: params.q || undefined,
    status: parseStatus(params.status),
  });

  return (
    <>
      <AdminTopbar title="Comments Moderation" subtitle="Review, publish, hide, or reject translator page comments." />
      <main className="space-y-4 p-4 sm:p-6">
        <form className="grid gap-2 rounded-2xl border border-border bg-surface p-4 md:grid-cols-[1fr_220px_auto]">
          <input
            type="text"
            name="q"
            defaultValue={params.q || ""}
            placeholder="Search by translator, name, email, or comment text"
            className="h-11 rounded-xl border border-border bg-surface px-3 text-ink"
          />

          <select
            name="status"
            defaultValue={params.status || "all"}
            className="h-11 rounded-xl border border-border bg-surface px-3 text-ink"
          >
            <option value="all">All statuses</option>
            {Object.values(CommentModerationStatus).map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </select>

          <button
            type="submit"
            className="h-11 rounded-xl bg-brand-500 px-4 text-sm font-medium text-white hover:bg-brand-600"
          >
            Filter
          </button>
        </form>

        <CommentTable comments={comments} />
      </main>
    </>
  );
}
