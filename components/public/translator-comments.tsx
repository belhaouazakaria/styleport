import { listPublicTranslatorComments } from "@/lib/data/comments";
import { formatDateTime } from "@/lib/utils";
import { TranslatorCommentForm } from "@/components/public/translator-comment-form";
import { MessageCircleMore, Quote, Sparkles } from "lucide-react";

interface TranslatorCommentsProps {
  translatorId: string;
  translatorSlug: string;
}

export async function TranslatorComments({ translatorId, translatorSlug }: TranslatorCommentsProps) {
  const comments = await listPublicTranslatorComments(translatorId);

  return (
    <section id="translator-comments" className="mx-auto mt-10 w-full max-w-4xl px-4 sm:px-6 lg:px-8" aria-labelledby="translator-comments-heading">
      <div className="relative overflow-hidden rounded-[1.65rem] border border-brand-200 bg-[#FFF9F4] p-4 shadow-[0_12px_35px_rgba(15,23,42,0.06)] sm:p-6">
        <span aria-hidden="true" className="absolute -right-8 -top-10 h-28 w-28 rounded-full bg-[#60C5F7]/20" />
        <span aria-hidden="true" className="absolute -right-2 top-5 h-10 w-10 rotate-12 rounded-xl bg-[#FF7A59]/15" />
        <div className="relative flex items-start justify-between gap-4">
          <div>
            <p className="section-kicker"><MessageCircleMore className="h-4 w-4" /> Twist talk</p>
            <h2 id="translator-comments-heading" className="font-display mt-1 text-3xl font-bold tracking-tight text-ink">What people are saying</h2>
          </div>
          <Sparkles aria-hidden="true" className="mt-1 h-6 w-6 rotate-12 text-accent-500" />
        </div>
        <p className="relative mt-2 max-w-2xl text-sm leading-6 text-muted-ink">Share what worked, what surprised you, or what could make this twist even better.</p>

        {comments.length ? (
          <div className="relative mt-5 grid gap-3 md:grid-cols-2">
            {comments.map((comment) => (
              <article key={comment.id} className="group relative min-w-0 rounded-[1.2rem] border border-border bg-white/90 p-4 transition motion-safe:hover:-translate-y-0.5 motion-safe:hover:border-brand-300 motion-safe:hover:shadow-[0_10px_25px_rgba(20,184,166,0.1)]">
                <Quote aria-hidden="true" className="absolute right-3 top-3 h-5 w-5 text-brand-200" />
                <header className="flex items-center gap-3 pr-7">
                  <span aria-hidden="true" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[0.85rem] bg-brand-100 font-display text-sm font-bold text-brand-900 ring-2 ring-white">
                    {comment.name.trim().slice(0, 1).toUpperCase()}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-ink">{comment.name}</p>
                    <time dateTime={comment.createdAt} className="text-xs text-muted-ink">{formatDateTime(comment.createdAt)}</time>
                  </div>
                </header>
                <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-6 text-ink/80">{comment.content}</p>
              </article>
            ))}
          </div>
        ) : (
          <div className="relative mt-5 flex items-center gap-3 rounded-[1.2rem] border border-dashed border-brand-300 bg-white/70 p-4">
            <span aria-hidden="true" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#fff0c7] text-lg">✦</span>
            <div><p className="font-display text-base font-bold text-ink">No twists of opinion yet.</p><p className="mt-0.5 text-sm text-muted-ink">Be the first to leave a comment.</p></div>
          </div>
        )}

        <TranslatorCommentForm translatorSlug={translatorSlug} />
      </div>
    </section>
  );
}
