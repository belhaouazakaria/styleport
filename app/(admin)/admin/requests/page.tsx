import { TranslatorRequestStatus } from "@prisma/client";

import { AdminTopbar } from "@/components/admin/admin-topbar";
import { RequestTable } from "@/components/admin/request-table";
import { getCategoryChoices } from "@/lib/data/categories";
import { listAdminTranslatorRequests } from "@/lib/data/requests";

interface PageProps {
  searchParams: Promise<{
    q?: string;
    status?: string;
    category?: string;
    dateFrom?: string;
    dateTo?: string;
  }>;
}

export const dynamic = "force-dynamic";

function parseStatus(value?: string) {
  if (!value || value === "all") {
    return "all";
  }

  return Object.values(TranslatorRequestStatus).includes(value as TranslatorRequestStatus)
    ? (value as TranslatorRequestStatus)
    : "all";
}

export default async function AdminRequestsPage({ searchParams }: PageProps) {
  const params = await searchParams;

  const [requests, categories] = await Promise.all([
    listAdminTranslatorRequests({
      q: params.q || undefined,
      status: parseStatus(params.status),
      category: params.category || undefined,
      dateFrom: params.dateFrom || undefined,
      dateTo: params.dateTo || undefined,
    }),
    getCategoryChoices(),
  ]);

  return (
    <>
      <AdminTopbar
        title="Create Translator Submissions"
        subtitle="Review submissions, generate AI drafts, and convert approved ideas into live translators."
      />
      <main className="space-y-4 p-4 sm:p-6">
        <form className="grid gap-2 rounded-2xl border border-border bg-surface p-4 md:grid-cols-[1fr_170px_190px_180px_180px_auto]">
          <input
            type="text"
            name="q"
            defaultValue={params.q || ""}
            placeholder="Search by translator name, description, or email"
            className="h-11 rounded-xl border border-border bg-surface px-3 text-ink"
          />

          <select
            name="status"
            defaultValue={params.status || "all"}
            className="h-11 rounded-xl border border-border bg-surface px-3 text-ink"
          >
            <option value="all">All statuses</option>
            {Object.values(TranslatorRequestStatus).map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </select>

          <select
            name="category"
            defaultValue={params.category || ""}
            className="h-11 rounded-xl border border-border bg-surface px-3 text-ink"
          >
            <option value="">All category suggestions</option>
            {categories.map((category) => (
              <option key={category.id} value={category.name}>
                {category.name}
              </option>
            ))}
          </select>

          <input
            type="date"
            name="dateFrom"
            defaultValue={params.dateFrom || ""}
            className="h-11 rounded-xl border border-border bg-surface px-3 text-ink"
          />

          <input
            type="date"
            name="dateTo"
            defaultValue={params.dateTo || ""}
            className="h-11 rounded-xl border border-border bg-surface px-3 text-ink"
          />

          <button
            type="submit"
            className="h-11 rounded-xl bg-brand-500 px-4 text-sm font-medium text-white hover:bg-brand-600"
          >
            Filter
          </button>
        </form>

        <RequestTable requests={requests} />
      </main>
    </>
  );
}
