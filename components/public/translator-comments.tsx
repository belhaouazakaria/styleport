import { listPublicTranslatorComments } from "@/lib/data/comments";
import { formatDateTime } from "@/lib/utils";
import { TranslatorCommentForm } from "@/components/public/translator-comment-form";

interface TranslatorCommentsProps {
  translatorId: string;
  translatorSlug: string;
}

export async function TranslatorComments({ translatorId, translatorSlug }: TranslatorCommentsProps) {
  const comments = await listPublicTranslatorComments(translatorId);

  return (
    <section className="mx-auto mt-8 w-full max-w-7xl px-4 sm:px-6 lg:px-8">
      <div className="rounded-2xl border border-border bg-surface p-5 sm:p-6">
        <h2 className="font-display text-2xl font-semibold text-ink">Comments</h2>
        <p className="mt-2 text-sm text-muted-ink">
          Share feedback or suggestions. Appropriate comments are published immediately, while some may require manual
          review.
        </p>

        {comments.length ? (
          <div className="mt-4 space-y-3">
            {comments.map((comment) => (
              <article key={comment.id} className="rounded-xl border border-border bg-white p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-ink">{comment.name}</p>
                  <p className="text-xs text-muted-ink">{formatDateTime(comment.createdAt)}</p>
                </div>
                <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-muted-ink">{comment.content}</p>
              </article>
            ))}
          </div>
        ) : (
          <p className="mt-4 rounded-xl border border-border bg-white p-4 text-sm text-muted-ink">
            No comments yet. Be the first to share feedback.
          </p>
        )}

        <TranslatorCommentForm translatorSlug={translatorSlug} />
      </div>
    </section>
  );
}
