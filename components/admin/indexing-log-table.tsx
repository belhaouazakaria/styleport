import Link from "next/link";

import type { AdminIndexingLogListItem } from "@/lib/types";
import { formatDateTime } from "@/lib/utils";

interface IndexingLogTableProps {
  logs: AdminIndexingLogListItem[];
}

function statusClass(status: AdminIndexingLogListItem["status"]) {
  if (status === "SUBMITTED") return "bg-emerald-100 text-emerald-700";
  if (status === "FAILED") return "bg-red-100 text-red-700";
  if (status === "DRY_RUN") return "bg-blue-100 text-blue-700";
  if (status === "SKIPPED") return "bg-amber-100 text-amber-700";
  return "bg-muted-surface text-muted-ink";
}

export function IndexingLogTable({ logs }: IndexingLogTableProps) {
  if (!logs.length) {
    return (
      <div className="rounded-2xl border border-border bg-surface p-8 text-sm text-muted-ink">
        No indexing logs found for the current filters.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-2xl border border-border bg-white">
      <table className="min-w-full divide-y divide-border text-sm">
        <thead className="bg-muted-surface text-left text-muted-ink">
          <tr>
            <th className="px-4 py-3 font-medium">Created</th>
            <th className="px-4 py-3 font-medium">Translator</th>
            <th className="px-4 py-3 font-medium">URL</th>
            <th className="px-4 py-3 font-medium">Source</th>
            <th className="px-4 py-3 font-medium">Status</th>
            <th className="px-4 py-3 font-medium">Message</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {logs.map((log) => (
            <tr key={log.id}>
              <td className="whitespace-nowrap px-4 py-3 text-muted-ink">{formatDateTime(log.createdAt)}</td>
              <td className="px-4 py-3">
                {log.translatorId && log.translatorName ? (
                  <Link href={`/admin/translators/${log.translatorId}`} className="font-medium text-ink">
                    {log.translatorName}
                  </Link>
                ) : (
                  <span className="text-muted-ink">—</span>
                )}
                {log.translatorSlug ? (
                  <p className="text-xs text-muted-ink">/{log.translatorSlug}</p>
                ) : null}
              </td>
              <td className="max-w-[360px] px-4 py-3 text-muted-ink">
                <a href={log.url} target="_blank" rel="noreferrer" className="break-all hover:text-brand-700">
                  {log.url}
                </a>
              </td>
              <td className="whitespace-nowrap px-4 py-3 text-muted-ink">{log.source}</td>
              <td className="whitespace-nowrap px-4 py-3">
                <span className={`rounded-full px-2 py-1 text-xs font-medium ${statusClass(log.status)}`}>
                  {log.status}
                </span>
              </td>
              <td className="max-w-[380px] px-4 py-3 text-muted-ink">{log.message || "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
