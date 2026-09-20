"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";

interface TranslatorCommentFormProps {
  translatorSlug: string;
}

interface FormState {
  name: string;
  email: string;
  comment: string;
}

const initialFormState: FormState = {
  name: "",
  email: "",
  comment: "",
};

export function TranslatorCommentForm({ translatorSlug }: TranslatorCommentFormProps) {
  const router = useRouter();
  const [form, setForm] = useState<FormState>(initialFormState);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setMessage(null);
    setError(null);

    const formData = new FormData(event.currentTarget);

    const response = await fetch(`/api/translators/${translatorSlug}/comments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...form,
        honeypot: String(formData.get("website") || ""),
      }),
    });

    const payload = await response.json();
    setSubmitting(false);

    if (!response.ok || !payload.ok) {
      setError(payload?.error?.message || "Unable to submit comment right now.");
      return;
    }

    setForm(initialFormState);
    if (payload.pendingReview) {
      setMessage("Thanks for sharing. Your comment is pending moderation review.");
      return;
    }

    setMessage("Thanks for sharing. Your comment is now visible.");
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="relative mt-6 space-y-4 rounded-[1.25rem] border border-brand-200 bg-white p-4 shadow-[0_8px_24px_rgba(15,23,42,0.05)] sm:p-5" aria-describedby="comment-privacy-note">
      <input type="text" name="website" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden="true" />

      <div>
        <p className="font-display text-lg font-bold text-ink">Add your twist</p>
        <p className="mt-0.5 text-sm text-muted-ink">Your email stays private. Comments may be checked before appearing.</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="space-y-1 text-sm">
          <span className="font-bold text-ink">Name</span>
          <input
            type="text"
            required
            value={form.name}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                name: event.target.value,
              }))
            }
            className="h-11 w-full rounded-xl border border-border bg-[#FFF9F4]/50 px-3 text-ink transition placeholder:text-muted-ink/65 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200"
            placeholder="Your name"
          />
        </label>
        <label className="space-y-1 text-sm">
          <span className="font-bold text-ink">Email</span>
          <input
            type="email"
            required
            value={form.email}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                email: event.target.value,
              }))
            }
            className="h-11 w-full rounded-xl border border-border bg-[#FFF9F4]/50 px-3 text-ink transition placeholder:text-muted-ink/65 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200"
            placeholder="you@example.com"
          />
        </label>
      </div>

      <label className="space-y-1 text-sm">
        <span className="font-bold text-ink">Your comment</span>
        <textarea
          required
          maxLength={3000}
          value={form.comment}
          onChange={(event) =>
            setForm((current) => ({
              ...current,
              comment: event.target.value,
            }))
          }
          className="min-h-24 w-full resize-y rounded-xl border border-border bg-[#FFF9F4]/50 px-3 py-3 text-ink transition placeholder:text-muted-ink/65 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200"
          placeholder="What did you think of this twist?"
        />
        <span className="mt-1 block text-right text-xs text-muted-ink" aria-live="polite">{form.comment.length.toLocaleString()} / 3,000</span>
      </label>

      {error ? <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700">{error}</p> : null}
      {message ? <p role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-800">{message}</p> : null}

      <div className="flex flex-col items-stretch justify-between gap-3 sm:flex-row sm:items-center">
        <p id="comment-privacy-note" className="text-xs text-muted-ink">Kind, useful feedback keeps the conversation moving.</p>
        <Button type="submit" disabled={submitting} className="min-h-11 bg-brand-600 px-5 font-bold text-white hover:bg-brand-700 sm:min-w-40">
          {submitting ? "Posting…" : "Post my twist"}
        </Button>
      </div>
    </form>
  );
}
