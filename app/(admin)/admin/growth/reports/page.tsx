import Link from "next/link";

import { AdminTopbar } from "@/components/admin/admin-topbar";
import { buttonVariants } from "@/components/ui/button";
import { requireAdminRoute } from "@/lib/auth";
import { listArchivedGrowthReports } from "@/lib/growth/reporting/admin";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function GrowthReportsPage() {
  await requireAdminRoute();
  const reports = await listArchivedGrowthReports();

  return (
    <>
      <AdminTopbar title="Growth reports" subtitle="Immutable daily archives and recorded delivery attempts. Read-only." />
      <main className="space-y-5 p-4 sm:p-6">
        <Link href="/admin/growth" className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
          ← Growth overview
        </Link>
        <div className="rounded-2xl border border-border bg-white p-5 text-sm leading-6 text-muted-ink">
          Reports cover completed UTC days. No delivery or report generation is initiated by viewing this page.
          Telegram remains disabled until operator setup, deliberate authorization and rollout qualification.
          API submission does not guarantee recipient delivery or reading.
        </div>
        <section className="overflow-hidden rounded-2xl border border-border bg-white">
          <h2 className="p-5 font-display text-2xl font-bold text-ink">Recent archived reports</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-muted/40">
                <tr><th className="p-3">UTC day</th><th className="p-3">Version</th><th className="p-3">Channel</th><th className="p-3">Delivery state</th><th className="p-3">Details</th></tr>
              </thead>
              <tbody>
                {reports.map((report) => <tr className="border-t border-border" key={report.id}>
                  <td className="p-3">{report.reportDate.toISOString().slice(0, 10)}</td>
                  <td className="p-3">{report.version}</td>
                  <td className="p-3">{report.delivery?.channel ?? "Not attempted"}</td>
                  <td className="p-3">{report.delivery?.status ?? "No delivery record"}</td>
                  <td className="p-3"><Link href={`/admin/growth/reports/${report.id}`} className="underline underline-offset-2">View report</Link></td>
                </tr>)}
                {!reports.length && <tr><td colSpan={5} className="p-5 text-muted-ink">No Growth daily reports archived yet.</td></tr>}
              </tbody>
            </table>
          </div>
          <p className="p-4 text-xs text-muted-ink">Showing at most 30 latest archived days. Historical reports are preserved.</p>
        </section>
      </main>
    </>
  );
}
