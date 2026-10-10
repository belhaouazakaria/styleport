import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, ChevronDown, ImageIcon } from "lucide-react";

import { AdminTopbar } from "@/components/admin/admin-topbar";
import { CreativeExperimentForm, CreativeGenerationForm, CreativeRegenerateButton, PinApprovalPanel } from "@/components/admin/creative-lab-actions";
import { getAdminCreativeOverview } from "@/lib/growth/creative/candidates";
import { experimentVariantsSchema } from "@/lib/growth/creative/contracts";
import { deferredCandidatePresentation } from "@/lib/growth/creative/presentation";
import { requireAdmin } from "@/lib/permissions";
import { getServerEnv } from "@/lib/env";

export const dynamic = "force-dynamic";

const archetypeLabels: Record<string, string> = {
  V1_CONTROL: "Control",
  TYPOGRAPHY_LED: "Typography",
  EDITORIAL_LIST: "Editorial list",
  CONVERSATION_CHAT: "Conversation",
  MINIMAL_STATEMENT: "Minimal poster",
  BEFORE_AFTER: "Before → after",
  SCENE_BASED: "Scene based",
};

const candidateStatusPresentation: Record<string, { label: string; badge: string; border: string; accent: string }> = {
  READY: { label: "Ready", badge: "bg-brand-500 text-white", border: "border-brand-300", accent: "border-brand-500" },
  DEFERRED: { label: "Deferred", badge: "bg-[#fff0c7] text-[#805000]", border: "border-accent-300", accent: "border-accent-400" },
  DRAFT: { label: "Draft", badge: "bg-muted-surface text-muted-ink", border: "border-border", accent: "border-muted-ink/25" },
  RENDERING: { label: "Rendering", badge: "bg-supporting-100 text-supporting-900", border: "border-supporting-300", accent: "border-supporting-500" },
  REJECTED: { label: "Rejected", badge: "bg-red-100 text-red-900", border: "border-red-300", accent: "border-red-500" },
  FAILED_RETRYABLE: { label: "Retry needed", badge: "bg-amber-100 text-amber-900", border: "border-amber-300", accent: "border-amber-500" },
  FAILED_TERMINAL: { label: "Failed", badge: "bg-red-100 text-red-900", border: "border-red-300", accent: "border-red-600" },
  CANCELLED: { label: "Cancelled", badge: "bg-slate-100 text-slate-600", border: "border-slate-300", accent: "border-slate-400" },
};

function humanize(value: string) {
  return value.replaceAll("_", " ").toLowerCase().replace(/^./, (letter) => letter.toUpperCase());
}

const dateFormatter = new Intl.DateTimeFormat("en", {
  month: "short",
  day: "numeric",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  timeZone: "UTC",
});

export default async function AdminCreativeLabPage() {
  await requireAdmin();
  const overview = await getAdminCreativeOverview();
  const experiments = overview.experiments.map((item) => ({ id: item.id, hypothesis: item.hypothesis, variants: experimentVariantsSchema.safeParse(item.variants).success ? experimentVariantsSchema.parse(item.variants).map(({ key, label }) => ({ key, label })) : [] }));
  const accountNames = new Map(overview.accounts.map((account) => [account.id, `@${account.username}`]));
  const ready = overview.candidates.filter((candidate) => candidate.status === "READY").length;
  const deferred = overview.candidates.filter((candidate) => candidate.status === "DEFERRED").length;
  const loadedCandidateIds = new Set(overview.candidates.map((candidate) => candidate.id));
  const aiImageEnabled = getServerEnv().GROWTH_AI_IMAGE_ENABLED === true;

  return <>
    <AdminTopbar title="Creative Lab" subtitle="Create, individually approve, schedule, and monitor Pinterest Pins." />
    <main className="space-y-10 p-4 sm:p-6 lg:p-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <Link href="/admin/growth" className="inline-flex items-center gap-2 text-sm font-bold text-muted-ink transition hover:text-brand-700"><ArrowLeft className="h-4 w-4" aria-hidden="true" />Growth overview</Link>
        <p className="rounded-full bg-[#fff0c7] px-4 py-2 text-xs font-bold text-ink">Every Pin requires explicit approval</p>
      </div>

      <section aria-label="Creative Lab status" className="grid overflow-hidden rounded-2xl border border-border bg-white sm:grid-cols-2 xl:grid-cols-4">
        {[{ label: "Recent candidates", value: overview.candidates.length, note: "Latest 50 shown" }, { label: "Ready", value: ready, note: "Distinct candidates" }, { label: "Deferred", value: deferred, note: "Review reason and regenerate" }, { label: "Draft experiments", value: overview.experiments.length, note: `${overview.accounts.length} connected account${overview.accounts.length === 1 ? "" : "s"}` }].map((metric, index) => <div key={metric.label} className={`p-4 sm:p-5 ${index ? "border-t border-border sm:border-l sm:border-t-0" : ""}`}><p className="text-[11px] font-extrabold uppercase tracking-[0.12em] text-muted-ink">{metric.label}</p><p className="font-display mt-1 text-3xl font-bold text-ink">{metric.value}</p><p className="mt-1 text-xs text-muted-ink">{metric.note}</p></div>)}
      </section>

      <CreativeGenerationForm translators={overview.translators.map(({ id, name, slug }) => ({ id, name, slug }))} ideas={overview.ideas.filter((item) => item.currentVersion).map((item) => ({ id: item.id, title: item.currentVersion!.title }))} accounts={overview.accounts.map((item) => ({ id: item.id, label: `@${item.username} · ${humanize(item.publicationRole)}` }))} experiments={experiments} aiImageEnabled={aiImageEnabled} />

      <section aria-labelledby="candidate-gallery-heading">
        <div className="flex flex-wrap items-end justify-between gap-3 border-b border-dashed border-border pb-5"><div><p className="section-kicker">Visual library</p><h2 id="candidate-gallery-heading" className="font-display mt-1 text-3xl font-bold text-ink">Recent candidates</h2><p className="mt-1 text-sm text-muted-ink">The creative leads. Technical provenance stays available when you need it.</p></div><span className="text-sm font-bold text-muted-ink">{overview.candidates.length} shown</span></div>
        {overview.candidates.length ? <div className="mt-6 grid items-start gap-5 md:grid-cols-2 xl:grid-cols-3">{overview.candidates.map((candidate) => {
          const deferredPresentation = candidate.status === "DEFERRED" ? deferredCandidatePresentation(candidate.similarityResult, candidate.similarityFlags) : null;
          const baseStatus = candidateStatusPresentation[candidate.status] || { label: humanize(candidate.status), badge: "bg-muted-surface text-muted-ink", border: "border-border", accent: "border-muted-ink/25" };
          const status = deferredPresentation ? { ...baseStatus, label: deferredPresentation.label } : baseStatus;
          const destination = candidate.translator?.name || candidate.idea?.currentVersion?.title || candidate.destinationPath;
          const latestApproval = candidate.approvals[0];
          const matchedLoaded = deferredPresentation?.matchedCandidateId && loadedCandidateIds.has(deferredPresentation.matchedCandidateId);
          return <article id={`candidate-${candidate.id}`} key={candidate.id} className={`scroll-mt-24 overflow-hidden rounded-[1.6rem] border bg-white shadow-[0_20px_55px_-42px_rgba(15,23,42,0.55)] ${status.border}`}>
            <div className="relative bg-muted-surface"><Image src={candidate.asset.publicPath} alt={`Creative preview for ${destination}`} width={1000} height={1500} unoptimized className="h-auto w-full" /><span className={`absolute left-3 top-3 rounded-full px-3 py-1.5 text-xs font-extrabold shadow-sm ${status.badge}`}>{status.label}</span></div>
            <div className={`border-t-4 p-5 ${status.accent}`}>
              <div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="text-[11px] font-extrabold uppercase tracking-[0.12em] text-brand-800">{humanize(candidate.destinationKind)} · {candidate.topic}</p><h3 className="font-display mt-1 text-xl font-bold leading-tight text-ink">{candidate.title}</h3><time dateTime={candidate.createdAt.toISOString()} className="mt-2 block text-xs font-semibold text-muted-ink">Created {dateFormatter.format(candidate.createdAt)} UTC</time></div><span className="shrink-0 rounded-lg bg-muted-surface px-2.5 py-1 text-xs font-bold text-muted-ink">{archetypeLabels[candidate.archetype] || humanize(candidate.archetype)}</span></div>
              <dl className="mt-4 grid grid-cols-2 gap-3 border-y border-dashed border-border py-3 text-xs"><div><dt className="font-bold text-muted-ink">Destination</dt><dd className="mt-0.5 line-clamp-2 font-semibold text-ink">{destination}</dd></div><div><dt className="font-bold text-muted-ink">Account</dt><dd className="mt-0.5 font-semibold text-ink">{candidate.accountId ? accountNames.get(candidate.accountId) || "Connected account" : "Not assigned"}</dd></div><div><dt className="font-bold text-muted-ink">Template</dt><dd className="mt-0.5 font-semibold text-ink">{humanize(candidate.templateId)}</dd></div><div><dt className="font-bold text-muted-ink">Similarity</dt><dd className="mt-0.5 font-semibold text-ink">{humanize(candidate.similarityResult)}</dd></div></dl>
              {candidate.experiment ? <p className="mt-3 rounded-xl bg-supporting-50 px-3 py-2 text-xs text-supporting-900"><strong>Experiment:</strong> {candidate.experiment.hypothesis} · {candidate.experimentVariantKey}</p> : null}
              {deferredPresentation ? <div className="mt-4 border-l-4 border-amber-400 bg-amber-50 px-4 py-3"><p className="text-sm font-bold text-amber-950">{deferredPresentation.reason}</p>{deferredPresentation.evidence.length ? <ul className="mt-2 space-y-1 text-xs text-amber-900">{deferredPresentation.evidence.map((evidence) => <li key={evidence}>• {evidence}</li>)}</ul> : null}<div className="mt-3 flex flex-wrap items-start gap-3"><CreativeRegenerateButton candidateId={candidate.id} />{matchedLoaded ? <Link href={`#candidate-${deferredPresentation.matchedCandidateId}`} className="inline-flex min-h-10 items-center rounded-full border border-amber-700 px-4 py-2 text-sm font-bold text-amber-900 hover:bg-amber-100">View matched candidate</Link> : null}</div></div> : null}
              {candidate.status === "READY" ? <PinApprovalPanel candidateId={candidate.id} accounts={overview.accounts.map((item) => ({ id: item.id, label: `@${item.username} · ${humanize(item.publicationRole)}`, boards: item.boards }))} existing={latestApproval ? { approvalStatus: latestApproval.status, publicationId: latestApproval.publication?.id, publicationStatus: latestApproval.publication?.status, scheduledAt: latestApproval.scheduledAt?.toISOString(), account: latestApproval.account ? `@${latestApproval.account.username}` : null, board: latestApproval.board?.name } : undefined} /> : null}
              <details className="group mt-4"><summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-xs font-bold text-muted-ink hover:text-ink"><span>Technical details</span><ChevronDown className="h-4 w-4 transition group-open:rotate-180" aria-hidden="true" /></summary><dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-2 rounded-xl bg-muted-surface p-3 text-[11px]"><dt className="font-bold">Created</dt><dd>{candidate.createdAt.toISOString()}</dd><dt className="font-bold">Renderer</dt><dd>{candidate.rendererKey} / {candidate.rendererVersion}</dd><dt className="font-bold">Patterns</dt><dd>{candidate.headlinePattern} / {candidate.ctaPattern}</dd><dt className="font-bold">Treatment</dt><dd>{candidate.visualTreatment}</dd><dt className="font-bold">Similarity model</dt><dd>{candidate.similarityModelVersion}</dd><dt className="font-bold">Asset</dt><dd className="break-all">{candidate.asset.checksum}</dd><dt className="font-bold">File</dt><dd>{candidate.asset.width}×{candidate.asset.height} · {candidate.asset.byteSize.toLocaleString()} bytes</dd><dt className="font-bold">Generation</dt><dd>{humanize(candidate.asset.generationKind)}{candidate.asset.generationKind === "AI" ? ` · ${candidate.asset.aiProvider}/${candidate.asset.aiModel} · ${candidate.asset.estimatedCost == null ? "cost unknown" : `$${candidate.asset.estimatedCost}`}` : ""}</dd></dl></details>
            </div>
          </article>;
        })}</div> : <div className="mt-6 flex min-h-56 flex-col items-center justify-center rounded-[1.5rem] border border-dashed border-border bg-white/50 p-8 text-center"><span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-100 text-brand-800"><ImageIcon className="h-5 w-5" aria-hidden="true" /></span><h3 className="font-display mt-4 text-xl font-bold text-ink">Your creative gallery is empty</h3><p className="mt-2 max-w-sm text-sm leading-6 text-muted-ink">Choose a destination and visual style above to queue the first bounded candidate.</p></div>}
      </section>

      <CreativeExperimentForm />
    </main>
  </>;
}
