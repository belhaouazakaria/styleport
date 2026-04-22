import Link from "next/link";
import type { TranslatorRequestStatus } from "@prisma/client";

import type { AdminTranslatorRequestListItem } from "@/lib/types";
import { formatDateTime } from "@/lib/utils";

interface RequestTableProps {
  requests: AdminTranslatorRequestListItem[];
}

function statusClasses(status: TranslatorRequestStatus) {
  switch (status) {
    case "NEW":
      return "bg-brand-100 text-brand-700";
    case "REVIEWING":
      return "bg-amber-100 text-amber-700";
    case "DRAFT_GENERATED":
      return "bg-indigo-100 text-indigo-700";
    case "APPROVED":
    case "COMPLETED":
      return "bg-emerald-100 text-emerald-700";
    case "REJECTED":
      return "bg-red-100 text-red-700";
    default:
      return "bg-muted-surface text-muted-ink";
  }
}

export function RequestTable({ requests }: RequestTableProps) {
  if (!requests.length) {
    return (
      <div className="rounded-2xl border border-border bg-surface p-10 text-center text-sm text-muted-ink">
        No create-submissions found for the current filters.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-2xl border border-border bg-surface">
      <table className="min-w-full text-sm">
        <thead className="bg-muted-surface text-left text-muted-ink">
          <tr>
            <th className="px-4 py-3 font-medium">Translator Name</th>
            <th className="px-4 py-3 font-medium">Category</th>
            <th className="px-4 py-3 font-medium">Email</th>
            <th className="px-4 py-3 font-medium">Status</th>
            <th className="px-4 py-3 font-medium">Created</th>
            <th className="px-4 py-3 font-medium">Action</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {requests.map((request) => (
            <tr key={request.id}>
              <td className="px-4 py-3 font-medium text-ink">{request.requestedName}</td>
              <td className="px-4 py-3 text-muted-ink">{request.suggestedCategory || "-"}</td>
              <td className="px-4 py-3 text-muted-ink">{request.requesterEmail || "-"}</td>
              <td className="px-4 py-3">
                <span className={`rounded-full px-2 py-1 text-xs font-semibold ${statusClasses(request.status)}`}>
                  {request.status}
                </span>
              </td>
              <td className="px-4 py-3 text-muted-ink">{formatDateTime(request.createdAt)}</td>
              <td className="px-4 py-3">
                <Link
                  href={`/admin/requests/${request.id}`}
                  className="inline-flex h-8 items-center rounded-lg border border-border bg-muted-surface px-3 text-xs font-medium text-ink transition hover:border-brand-300 hover:bg-surface"
                >
                  Open
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
