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
    <form onSubmit={onSubmit} className="mt-7 space-y-4 border-t border-border pt-6">
      <input type="text" name="website" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden="true" />

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
            className="h-12 w-full rounded-2xl border border-border bg-white px-4 text-ink shadow-sm transition placeholder:text-muted-ink/65 focus:border-brand-500"
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
            className="h-12 w-full rounded-2xl border border-border bg-white px-4 text-ink shadow-sm transition placeholder:text-muted-ink/65 focus:border-brand-500"
            placeholder="you@example.com"
          />
        </label>
      </div>

      <label className="space-y-1 text-sm">
        <span className="font-bold text-ink">Your note</span>
        <textarea
          required
          value={form.comment}
          onChange={(event) =>
            setForm((current) => ({
              ...current,
              comment: event.target.value,
            }))
          }
          className="min-h-28 w-full rounded-2xl border border-border bg-white px-4 py-3 text-ink shadow-sm transition placeholder:text-muted-ink/65 focus:border-brand-500"
          placeholder="Share your feedback about this translator."
        />
      </label>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      {message ? <p className="text-sm text-emerald-700">{message}</p> : null}

      <div className="flex flex-col items-stretch justify-between gap-3 sm:flex-row sm:items-center">
        <p className="text-xs text-muted-ink">Your note helps shape the next twist.</p>
        <Button type="submit" disabled={submitting} className="sm:min-w-40">
          {submitting ? "Submitting..." : "Post comment"}
        </Button>
      </div>
    </form>
  );
}
