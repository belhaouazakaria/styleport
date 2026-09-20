import Link from "next/link";
import { notFound } from "next/navigation";

import { AdminTopbar } from "@/components/admin/admin-topbar";
import { EditorialReviewActions } from "@/components/admin/editorial-review-actions";
import {
  getEditorialDraft,
  getNextEditorialDraftId,
} from "@/lib/translator-editorial-jobs";

export const dynamic = "force-dynamic";

export default async function EditorialReviewDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const draft = await getEditorialDraft((await params).id);
  if (!draft) notFound();
  const nextDraftId =
    draft.status === "NEEDS_REVIEW"
      ? await getNextEditorialDraftId(draft.id, "NEEDS_REVIEW")
      : null;
  const payload = draft.payload as {
    about?: string;
    whatItDoes?: string;
    differenceDescription?: string;
    bestUses?: string[];
    howToUse?: string[];
    tips?: string[];
    examples?: Array<{ originalText: string; transformedText: string }>;
    faq?: Array<{ question: string; answer: string }>;
  };
  const current = {
    about: draft.translator.editorialContent?.about,
    whatItDoes: draft.translator.editorialContent?.whatItDoes,
    differenceDescription:
      draft.translator.editorialContent?.differenceDescription,
    bestUses: draft.translator.editorialLists
      .filter((item) => item.kind === "BEST_USE")
      .map((item) => item.content),
    howToUse: draft.translator.editorialLists
      .filter((item) => item.kind === "HOW_TO_USE")
      .map((item) => item.content),
    tips: draft.translator.editorialLists
      .filter((item) => item.kind === "TIP")
      .map((item) => item.content),
    examples: draft.translator.editorialExamples,
    faq: draft.translator.editorialFaqs,
  };
  return (
    <>
      <AdminTopbar
        title={`Review: ${draft.translator.name}`}
        subtitle="Compare the generated review draft with the current published content before approval."
      />
      <main className="space-y-5 p-4 sm:p-6">
        <Link
          href="/admin/translators/review"
          className="text-brand-700 text-sm font-semibold"
        >
          ← Back to review queue
        </Link>
        <section className="border-border rounded-2xl border bg-white p-5">
          <p className="text-muted-ink text-xs font-bold tracking-[0.14em] uppercase">
            Generated draft · {draft.status.replaceAll("_", " ")}
          </p>
          <div className="mt-5 grid gap-6 lg:grid-cols-2">
            <div>
              <h2 className="font-display text-ink text-xl font-bold">
                Current published content
              </h2>
              <ReviewContent content={current} />
            </div>
            <div>
              <h2 className="font-display text-ink text-xl font-bold">
                Generated draft
              </h2>
              <ReviewContent content={payload} />
            </div>
          </div>
          <EditorialReviewActions
            id={draft.id}
            status={draft.status}
            payload={payload}
            nextDraftId={nextDraftId}
          />
        </section>
      </main>
    </>
  );
}

function ReviewContent({
  content,
}: {
  content: {
    about?: string | null;
    whatItDoes?: string | null;
    differenceDescription?: string | null;
    bestUses?: string[];
    howToUse?: string[];
    tips?: string[];
    examples?: Array<{ originalText: string; transformedText: string }>;
    faq?: Array<{ question: string; answer: string }>;
  };
}) {
  return (
    <div className="text-muted-ink mt-4 space-y-5 text-sm leading-6">
      <p>
        <b className="text-ink">About</b>
        <br />
        {content.about || "Not written yet."}
      </p>
      <p>
        <b className="text-ink">What it does</b>
        <br />
        {content.whatItDoes || "Not written yet."}
      </p>
      <p>
        <b className="text-ink">Difference</b>
        <br />
        {content.differenceDescription || "Not written yet."}
      </p>
      <p>
        <b className="text-ink">Best uses</b>
        <br />
        {content.bestUses?.join(" · ") || "Not written yet."}
      </p>
      <p>
        <b className="text-ink">Tips</b>
        <br />
        {content.tips?.join(" · ") || "Not written yet."}
      </p>
      <p>
        <b className="text-ink">Examples / FAQ</b>
        <br />
        {content.examples?.length || 0} examples · {content.faq?.length || 0}{" "}
        FAQs
      </p>
    </div>
  );
}
