import { listPublicTranslatorComments } from "@/lib/data/comments";
import { formatDateTime } from "@/lib/utils";
import { TranslatorCommentForm } from "@/components/public/translator-comment-form";
import { MessageCircleMore, Sparkles } from "lucide-react";

interface TranslatorCommentsProps {
  translatorId: string;
  translatorSlug: string;
}

export async function TranslatorComments({ translatorId, translatorSlug }: TranslatorCommentsProps) {
  const comments = await listPublicTranslatorComments(translatorId);

  return (
    <section className="mx-auto mt-10 w-full max-w-7xl px-4 sm:px-6 lg:px-8">
      <div className="relative border-y border-dashed border-border py-7 sm:py-9">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="section-kicker"><MessageCircleMore className="h-4 w-4" /> Say it out loud</p>
            <h2 className="font-display mt-1 text-3xl font-bold tracking-tight text-ink">Comments</h2>
          </div>
          <Sparkles aria-hidden="true" className="mt-1 h-6 w-6 rotate-12 text-accent-500" />
        </div>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-ink">
          Share feedback or suggestions. Appropriate comments are published immediately, while some may require manual
          review.
        </p>

        {comments.length ? (
          <div className="mt-6 grid gap-3 md:grid-cols-2">
            {comments.map((comment) => (
              <article key={comment.id} className="rounded-[1.35rem] border border-border bg-white/75 p-4 shadow-[var(--shadow-soft)] transition hover:-translate-y-0.5 hover:bg-white">
                <div className="flex items-center gap-3">
                  <span aria-hidden="true" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-100 font-display font-bold text-brand-800">
                    {comment.name.trim().slice(0, 1).toUpperCase()}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-ink">{comment.name}</p>
                    <p className="text-xs text-muted-ink">{formatDateTime(comment.createdAt)}</p>
                  </div>
                </div>
                <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-ink/75">{comment.content}</p>
              </article>
            ))}
          </div>
        ) : (
          <div className="mt-6 rounded-[1.35rem] bg-[#fff0c7] p-4">
            <p className="font-display text-lg font-bold text-ink">No comments yet — be the first twist-maker here.</p>
            <p className="mt-1 text-sm text-ink/65">A quick note helps other people choose the right voice.</p>
          </div>
        )}

        <TranslatorCommentForm translatorSlug={translatorSlug} />
      </div>
    </section>
  );
}
