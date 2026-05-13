import { IndexingSource, IndexingStatus } from "@prisma/client";

import { AdminTopbar } from "@/components/admin/admin-topbar";
import { IndexingActions } from "@/components/admin/indexing-actions";
import { IndexingLogTable } from "@/components/admin/indexing-log-table";
import { listAdminIndexingLogs } from "@/lib/data/indexing";
import { getGoogleIndexingStatus } from "@/lib/google-indexing";

interface PageProps {
  searchParams: Promise<{
    q?: string;
    status?: string;
    source?: string;
  }>;
}

export const dynamic = "force-dynamic";

function parseStatus(value?: string): "all" | IndexingStatus {
  if (!value || value === "all") {
    return "all";
  }

  return Object.values(IndexingStatus).includes(value as IndexingStatus)
    ? (value as IndexingStatus)
    : "all";
}

function parseSource(value?: string): "all" | IndexingSource {
  if (!value || value === "all") {
    return "all";
  }

  return Object.values(IndexingSource).includes(value as IndexingSource)
    ? (value as IndexingSource)
    : "all";
}

export default async function AdminIndexingPage({ searchParams }: PageProps) {
  const params = await searchParams;

  const [googleStatus, logs] = await Promise.all([
    getGoogleIndexingStatus(),
    listAdminIndexingLogs({
      q: params.q || undefined,
      status: parseStatus(params.status),
      source: parseSource(params.source),
    }),
  ]);

  return (
    <>
      <AdminTopbar
        title="Indexing"
        subtitle="Optional Google Indexing API submissions. Sitemap remains the primary indexing method."
      />
      <main className="space-y-4 p-4 sm:p-6">
        <section className="rounded-2xl border border-border bg-surface p-4 sm:p-5">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            <div className="rounded-xl border border-border bg-white p-3">
              <p className="text-xs font-medium text-muted-ink">Google Indexing API</p>
              <p className="mt-1 text-sm font-semibold text-ink">{googleStatus.enabled ? "Enabled" : "Disabled"}</p>
            </div>
            <div className="rounded-xl border border-border bg-white p-3">
              <p className="text-xs font-medium text-muted-ink">Credential status</p>
              <p className="mt-1 text-sm font-semibold text-ink">
                {googleStatus.credentialsConfigured ? "Configured" : "Misconfigured"}
              </p>
            </div>
            <div className="rounded-xl border border-border bg-white p-3">
              <p className="text-xs font-medium text-muted-ink">Credential mode</p>
              <p className="mt-1 text-sm font-semibold text-ink">Split env vars</p>
            </div>
            <div className="rounded-xl border border-border bg-white p-3">
              <p className="text-xs font-medium text-muted-ink">Dry run</p>
              <p className="mt-1 text-sm font-semibold text-ink">{googleStatus.dryRun ? "Enabled" : "Disabled"}</p>
            </div>
            <div className="rounded-xl border border-border bg-white p-3 md:col-span-2 xl:col-span-1">
              <p className="text-xs font-medium text-muted-ink">Service account email</p>
              <p className="mt-1 break-all text-sm font-medium text-ink">
                {googleStatus.serviceAccountEmailConfigured
                  ? googleStatus.serviceAccountEmail
                  : "Missing"}
              </p>
            </div>
            <div className="rounded-xl border border-border bg-white p-3 md:col-span-2 xl:col-span-1">
              <p className="text-xs font-medium text-muted-ink">Project ID</p>
              <p className="mt-1 break-all text-sm font-medium text-ink">
                {googleStatus.projectIdConfigured ? googleStatus.projectId : "Missing"}
              </p>
            </div>
            <div className="rounded-xl border border-border bg-white p-3 md:col-span-2 xl:col-span-1">
              <p className="text-xs font-medium text-muted-ink">Private key</p>
              <p className="mt-1 text-sm font-medium text-ink">
                {!googleStatus.privateKeyPresent
                  ? "Missing"
                  : googleStatus.privateKeyNormalizedValid
                    ? "Present and valid"
                    : "Invalid format"}
              </p>
            </div>
            <div className="rounded-xl border border-border bg-white p-3 md:col-span-2 xl:col-span-1">
              <p className="text-xs font-medium text-muted-ink">Base site URL</p>
              <p className="mt-1 break-all text-sm font-medium text-ink">{googleStatus.baseUrl}</p>
            </div>
          </div>

          {!googleStatus.enabled ? (
            <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              GOOGLE_INDEXING_ENABLED is false. Submissions are currently disabled.
            </p>
          ) : null}

          {!googleStatus.credentialsConfigured ? (
            <div className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
              <p className="font-medium">Google credentials are not configured correctly.</p>
              {googleStatus.privateKeyPresent && !googleStatus.privateKeyNormalizedValid ? (
                <p className="mt-1">GOOGLE_PRIVATE_KEY is invalid or incorrectly formatted.</p>
              ) : null}
              {googleStatus.missingFields.length ? (
                <p className="mt-1">
                  Missing env vars: {googleStatus.missingFields.join(", ")}
                </p>
              ) : null}
              {googleStatus.validationErrors.length ? (
                <ul className="mt-1 list-disc pl-5">
                  {googleStatus.validationErrors.map((error) => (
                    <li key={error}>{error}</li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}

          <div className="mt-4">
            <IndexingActions disabled={!googleStatus.enabled} />
          </div>
        </section>

        <form className="grid gap-2 rounded-2xl border border-border bg-surface p-4 md:grid-cols-[1fr_220px_220px_auto]">
          <input
            type="text"
            name="q"
            defaultValue={params.q || ""}
            placeholder="Search by translator, URL, or message"
            className="h-11 rounded-xl border border-border bg-surface px-3 text-ink"
          />

          <select
            name="status"
            defaultValue={params.status || "all"}
            className="h-11 rounded-xl border border-border bg-surface px-3 text-ink"
          >
            <option value="all">All statuses</option>
            {Object.values(IndexingStatus).map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </select>

          <select
            name="source"
            defaultValue={params.source || "all"}
            className="h-11 rounded-xl border border-border bg-surface px-3 text-ink"
          >
            <option value="all">All sources</option>
            {Object.values(IndexingSource).map((source) => (
              <option key={source} value={source}>
                {source}
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

        <IndexingLogTable logs={logs} />
      </main>
    </>
  );
}
