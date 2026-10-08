import Image from "next/image";
import Link from "next/link";

import { CreativeExperimentForm, CreativeGenerationForm } from "@/components/admin/creative-lab-actions";
import { buttonVariants } from "@/components/ui/button";
import { getAdminCreativeOverview } from "@/lib/growth/creative/candidates";
import { experimentVariantsSchema } from "@/lib/growth/creative/contracts";
import { requireAdmin } from "@/lib/permissions";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function AdminCreativeLabPage() {
  await requireAdmin();
  const overview = await getAdminCreativeOverview();
  const experiments = overview.experiments.map((item) => ({ id: item.id, hypothesis: item.hypothesis, variants: experimentVariantsSchema.safeParse(item.variants).success ? experimentVariantsSchema.parse(item.variants).map(({ key, label }) => ({ key, label })) : [] }));
  return <div className="space-y-8">
    <div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-sm font-bold uppercase tracking-wide text-brand-700">Growth</p><h1 className="font-display mt-1 text-4xl font-bold text-ink">Creative Lab</h1><p className="mt-2 max-w-3xl text-sm leading-6 text-muted-ink">Generate one bounded static candidate at a time. Phase 10 stops at READY or DEFERRED; approval, scheduling, and publication are unavailable.</p></div><Link href="/admin/growth" className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>← Growth overview</Link></div>
    <section><h2 className="font-display mb-3 text-2xl font-bold text-ink">Generate candidate</h2><CreativeGenerationForm translators={overview.translators.map(({ id, name }) => ({ id, name }))} ideas={overview.ideas.filter((item) => item.currentVersion).map((item) => ({ id: item.id, title: item.currentVersion!.title }))} accounts={overview.accounts.map((item) => ({ id: item.id, label: `@${item.username} · ${item.publicationRole}` }))} experiments={experiments} /></section>
    <section><h2 className="font-display mb-3 text-2xl font-bold text-ink">Draft experiment</h2><CreativeExperimentForm /></section>
    <section><h2 className="font-display text-2xl font-bold text-ink">Recent candidates</h2><div className="mt-3 grid gap-5 xl:grid-cols-2">{overview.candidates.length ? overview.candidates.map((candidate) => <article key={candidate.id} className="grid gap-4 rounded-2xl border border-border bg-white p-5 sm:grid-cols-[180px_1fr]"><Image src={candidate.asset.publicPath} alt="" width={180} height={270} unoptimized className="h-auto w-full rounded-xl border border-border bg-muted-surface"/><div className="min-w-0"><p className="text-xs font-bold uppercase tracking-wide text-brand-700">{candidate.status} · {candidate.archetype}</p><h3 className="mt-1 font-bold text-ink">{candidate.title}</h3><p className="mt-1 text-xs text-muted-ink">{candidate.destinationKind}: {candidate.translator?.name || candidate.idea?.currentVersion?.title || candidate.destinationPath}</p><dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs"><dt className="font-bold">Renderer</dt><dd>{candidate.rendererKey} / {candidate.rendererVersion}</dd><dt className="font-bold">Template</dt><dd>{candidate.templateId}</dd><dt className="font-bold">Patterns</dt><dd>{candidate.headlinePattern} / {candidate.ctaPattern}</dd><dt className="font-bold">Treatment</dt><dd>{candidate.visualTreatment}</dd><dt className="font-bold">Similarity</dt><dd>{candidate.similarityResult} / {candidate.similarityModelVersion}</dd><dt className="font-bold">Experiment</dt><dd>{candidate.experiment ? `${candidate.experiment.dimension}: ${candidate.experimentVariantKey}` : "None"}</dd><dt className="font-bold">Asset</dt><dd className="break-all">{candidate.asset.checksum} · {candidate.asset.width}×{candidate.asset.height} · {candidate.asset.byteSize.toLocaleString()} bytes</dd><dt className="font-bold">Generation</dt><dd>{candidate.asset.generationKind}{candidate.asset.generationKind === "AI" ? ` · ${candidate.asset.aiProvider}/${candidate.asset.aiModel} · ${candidate.asset.estimatedCost == null ? "cost unknown" : `$${candidate.asset.estimatedCost}`}` : ""}</dd></dl></div></article>) : <p className="rounded-2xl border border-dashed border-border p-5 text-sm text-muted-ink">No Creative Lab candidates yet.</p>}</div></section>
  </div>;
}

