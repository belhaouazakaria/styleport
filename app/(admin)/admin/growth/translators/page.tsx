import Link from "next/link";

import { AdminTopbar } from "@/components/admin/admin-topbar";
import { KpiCard } from "@/components/admin/kpi-card";
import { QueueTranslatorDecisionButton, RollbackTranslatorButton } from "@/components/admin/translator-autopilot-actions";
import { buttonVariants } from "@/components/ui/button";
import { requireAdminRoute } from "@/lib/auth";
import { getTranslatorAutopilotDashboard } from "@/lib/growth/translator/reporting";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";
const label = (value: string) => value.replaceAll("_", " ").toLowerCase();

export default async function GrowthTranslatorsPage() {
  await requireAdminRoute();
  const report = await getTranslatorAutopilotDashboard();
  return <>
    <AdminTopbar title="Translator Autopilot" subtitle="Versioned, bounded Translator decisions with deterministic validation and rollback." />
    <main className="space-y-6 p-4 sm:p-6">
      <div className="flex flex-wrap gap-3">
        <Link href="/admin/growth" className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>← Growth overview</Link>
        <Link href="/admin/growth/opportunities" className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>View opportunities</Link>
      </div>
      <section className="border-brand-200 bg-brand-50 text-brand-950 rounded-2xl border p-4 text-sm leading-6">
        Explicit invocation only. New Translators remain inactive. Execution uses {report.modelVersion}, makes no Pinterest call, and creates trusted rollback history for every mutation.
      </section>
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <KpiCard label="Model" value={report.modelVersion} hint="Application controlled" />
        <KpiCard label="Latest decision" value={report.latestDecision ? label(report.latestDecision.type) : "None"} hint={report.latestDecision ? label(report.latestDecision.status) : "No decision recorded"} />
        <KpiCard label="Completed" value={String(report.counts.completed)} hint="Create, improve, or no action" />
        <KpiCard label="Waiting" value={String(report.counts.waiting)} hint="More evidence required" />
        <KpiCard label="Rejected" value={String(report.counts.rejected)} hint="Deterministic blockers" />
      </section>
      <section className="border-border overflow-hidden rounded-2xl border bg-white">
        <div className="p-5"><h2 className="font-display text-ink text-2xl font-bold">Actionable opportunities</h2><p className="text-muted-ink text-sm">Queue one bounded planning job. Page loads never execute actions.</p></div>
        <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="bg-muted/40"><tr><th className="p-3">Cluster</th><th className="p-3">Type</th><th className="p-3">Score</th><th className="p-3">Confidence</th><th className="p-3">Action</th></tr></thead><tbody>
          {report.actionableOpportunities.map((item) => <tr key={item.id} className="border-border border-t"><td className="p-3 font-semibold">{item.cluster?.name || "Unknown"}</td><td className="p-3">{label(item.type)}</td><td className="p-3">{item.score}</td><td className="p-3">{item.confidence}%</td><td className="p-3"><QueueTranslatorDecisionButton opportunityId={item.id} /></td></tr>)}
          {!report.actionableOpportunities.length ? <tr><td colSpan={5} className="text-muted-ink p-5">No unplanned eligible opportunities.</td></tr> : null}
        </tbody></table></div>
      </section>
      <section className="border-border overflow-hidden rounded-2xl border bg-white">
        <div className="p-5"><h2 className="font-display text-ink text-2xl font-bold">Decisions</h2></div>
        <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="bg-muted/40"><tr><th className="p-3">Decision</th><th className="p-3">Opportunity</th><th className="p-3">Target</th><th className="p-3">Decision / mutation</th><th className="p-3">Created / completed</th><th className="p-3">View</th></tr></thead><tbody>
          {report.decisions.map((item) => <tr id={`decision-${item.id}`} key={item.id} className="border-border border-t"><td className="p-3"><p className="font-semibold">{label(item.type)}</p><p className="text-muted-ink text-xs">{item.reasonCodes.join(", ")}</p></td><td className="p-3">{item.opportunity?.cluster?.name || "None"}{item.opportunity ? <><span className="block text-xs">{item.opportunity.score}/{item.opportunity.confidence}%</span><span className="block text-xs">{label(item.opportunity.status)}</span></> : null}</td><td className="p-3">{item.translator ? <><Link className="text-brand-700 underline" href={`/admin/translators/${item.translator.id}`}>{item.translator.name}</Link><span className="block text-xs">{item.translator.isActive ? "Publicly active" : "Inactive, not public"}</span></> : "Not selected"}</td><td className="p-3"><span className="block">{label(item.status)}</span><span className="text-muted-ink block text-xs">{item.contentVersions[0] ? `Mutation stored; image ${label(item.contentVersions[0].sideEffectStatus)}` : "No Translator mutation"}</span></td><td className="p-3"><span className="block">{item.createdAt.toISOString().slice(0, 16).replace("T", " ")} UTC</span>{item.completedAt ? <span className="text-muted-ink block text-xs">Completed {item.completedAt.toISOString().slice(0, 16).replace("T", " ")} UTC</span> : null}</td><td className="p-3"><a className="text-brand-700 underline" href={`#decision-${item.id}`}>View decision</a></td></tr>)}
        </tbody></table></div>
      </section>
      <section className="border-border overflow-hidden rounded-2xl border bg-white">
        <div className="p-5"><h2 className="font-display text-ink text-2xl font-bold">Content versions</h2><p className="text-muted-ink text-sm">Admin-only trusted snapshots. Rollback creates a new audited version.</p></div>
        <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="bg-muted/40"><tr><th className="p-3">Translator</th><th className="p-3">Version</th><th className="p-3">Action</th><th className="p-3">Decision</th><th className="p-3">Checksum</th><th className="p-3">Created</th><th className="p-3">Rollback available</th></tr></thead><tbody>
          {report.versions.map((item) => <tr key={item.id} className="border-border border-t"><td className="p-3 font-semibold">{item.translator.name}<span className="text-muted-ink block text-xs">{item.translator.isActive ? "Publicly active" : "Inactive"}</span>{item.sideEffectStatus === "FAILED_RETRYABLE" ? <span className="text-destructive block text-xs">Share image refresh needs reconciliation</span> : null}</td><td className="p-3">{item.version}</td><td className="p-3">{label(item.action)}</td><td className="p-3">{item.decision ? <a className="text-brand-700 underline" href={`#decision-${item.decision.id}`}>{label(item.decision.type)}</a> : "Manual rollback"}</td><td className="p-3 font-mono text-xs">{item.checksum.slice(0, 12)}…</td><td className="p-3">{item.createdAt.toISOString().slice(0, 16).replace("T", " ")} UTC</td><td className="p-3">{item.currentChecksum ? <RollbackTranslatorButton translatorId={item.translatorId} targetVersionId={item.id} expectedCurrentChecksum={item.currentChecksum} /> : "Unavailable"}</td></tr>)}
        </tbody></table></div>
      </section>
    </main>
  </>;
}
