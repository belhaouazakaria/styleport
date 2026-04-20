import { AdminTopbar } from "@/components/admin/admin-topbar";
import { getRecentTranslationLogs } from "@/lib/data/translators";
import { formatDateTime } from "@/lib/utils";

export const dynamic = "force-dynamic";

function formatCurrency(value: number | null) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 5,
  }).format(Number(value || 0));
}

export default async function AdminLogsPage() {
  const logs = await getRecentTranslationLogs(120);

  return (
    <>
      <AdminTopbar
        title="Translation Logs"
        subtitle="Recent translation activity, usage metrics, and estimated spend."
      />
      <main className="p-4 sm:p-6">
        <div className="overflow-x-auto rounded-2xl border border-border bg-white">
          <table className="min-w-full divide-y divide-border text-sm">
            <thead className="bg-muted-surface text-left text-muted-ink">
              <tr>
                <th className="px-4 py-3 font-medium">Translator</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Model</th>
                <th className="px-4 py-3 font-medium">Tokens</th>
                <th className="px-4 py-3 font-medium">Spend</th>
                <th className="px-4 py-3 font-medium">Latency</th>
                <th className="px-4 py-3 font-medium">Created</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {logs.map((log) => (
                <tr key={log.id}>
                  <td className="px-4 py-3">
                    <p className="font-medium text-ink">{log.translator.name}</p>
                    <p className="text-xs text-muted-ink">/{log.translator.slug}</p>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full px-2 py-1 text-xs font-medium ${
                        log.status === "SUCCESS"
                          ? "bg-emerald-100 text-emerald-700"
                          : log.status === "BLOCKED"
                            ? "bg-amber-100 text-amber-700"
                            : "bg-red-100 text-red-700"
                      }`}
                    >
                      {log.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-muted-ink">{log.model || "-"}</td>
                  <td className="px-4 py-3 text-muted-ink">{log.totalTokens || 0}</td>
                  <td className="px-4 py-3 text-muted-ink">{formatCurrency(Number(log.estimatedCost || 0))}</td>
                  <td className="px-4 py-3 text-muted-ink">{log.latencyMs ? `${log.latencyMs}ms` : "-"}</td>
                  <td className="px-4 py-3 text-muted-ink">{formatDateTime(log.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </main>
    </>
  );
}
