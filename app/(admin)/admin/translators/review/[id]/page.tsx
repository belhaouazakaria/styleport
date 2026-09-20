import Link from "next/link";
import { notFound } from "next/navigation";

import { AdminTopbar } from "@/components/admin/admin-topbar";
import { EditorialReviewActions } from "@/components/admin/editorial-review-actions";
import { getEditorialDraft } from "@/lib/translator-editorial-jobs";

export const dynamic = "force-dynamic";

export default async function EditorialReviewDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const draft = await getEditorialDraft((await params).id);
  if (!draft) notFound();
  const payload = draft.payload as { about?: string; whatItDoes?: string; differenceDescription?: string; bestUses?: string[]; howToUse?: string[]; tips?: string[]; examples?: Array<{ originalText: string; transformedText: string }>; faq?: Array<{ question: string; answer: string }> };
  const current = {
    about: draft.translator.editorialContent?.about,
    whatItDoes: draft.translator.editorialContent?.whatItDoes,
    differenceDescription: draft.translator.editorialContent?.differenceDescription,
    bestUses: draft.translator.editorialLists.filter((item) => item.kind === "BEST_USE").map((item) => item.content),
    howToUse: draft.translator.editorialLists.filter((item) => item.kind === "HOW_TO_USE").map((item) => item.content),
    tips: draft.translator.editorialLists.filter((item) => item.kind === "TIP").map((item) => item.content),
    examples: draft.translator.editorialExamples,
    faq: draft.translator.editorialFaqs,
  };
  return <><AdminTopbar title={`Review: ${draft.translator.name}`} subtitle="Compare the generated review draft with the current published content before approval." /><main className="space-y-5 p-4 sm:p-6"><Link href="/admin/translators/review" className="text-sm font-semibold text-brand-700">← Back to review queue</Link><section className="rounded-2xl border border-border bg-white p-5"><p className="text-xs font-bold uppercase tracking-[0.14em] text-muted-ink">Generated draft · {draft.status.replaceAll("_", " ")}</p><div className="mt-5 grid gap-6 lg:grid-cols-2"><div><h2 className="font-display text-xl font-bold text-ink">Current published content</h2><ReviewContent content={current} /></div><div><h2 className="font-display text-xl font-bold text-ink">Generated draft</h2><ReviewContent content={payload} /></div></div><EditorialReviewActions id={draft.id} status={draft.status} payload={payload} /></section></main></>;
}

function ReviewContent({ content }: { content: { about?: string | null; whatItDoes?: string | null; differenceDescription?: string | null; bestUses?: string[]; howToUse?: string[]; tips?: string[]; examples?: Array<{ originalText: string; transformedText: string }>; faq?: Array<{ question: string; answer: string }> } }) {
  return <div className="mt-4 space-y-5 text-sm leading-6 text-muted-ink"><p><b className="text-ink">About</b><br />{content.about || "Not written yet."}</p><p><b className="text-ink">What it does</b><br />{content.whatItDoes || "Not written yet."}</p><p><b className="text-ink">Difference</b><br />{content.differenceDescription || "Not written yet."}</p><p><b className="text-ink">Best uses</b><br />{content.bestUses?.join(" · ") || "Not written yet."}</p><p><b className="text-ink">Tips</b><br />{content.tips?.join(" · ") || "Not written yet."}</p><p><b className="text-ink">Examples / FAQ</b><br />{content.examples?.length || 0} examples · {content.faq?.length || 0} FAQs</p></div>;
}
