"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";

interface ContactState {
  name: string;
  email: string;
  message: string;
}

const initialState: ContactState = {
  name: "",
  email: "",
  message: "",
};

export function ContactForm() {
  const [form, setForm] = useState<ContactState>(initialState);
  const [submitting, setSubmitting] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [statusType, setStatusType] = useState<"success" | "error" | null>(null);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setStatusMessage(null);
    setStatusType(null);

    const payload = {
      ...form,
      honeypot: String(new FormData(event.currentTarget).get("company") || ""),
    };

    const response = await fetch("/api/contact", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const result = await response.json();

    setSubmitting(false);

    if (!response.ok || !result.ok) {
      setStatusType("error");
      setStatusMessage(result?.error?.message || "Unable to submit your message right now.");
      return;
    }

    setStatusType("success");
    setStatusMessage("Thanks. Your message has been sent.");
    setForm(initialState);
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4 rounded-2xl border border-border bg-surface p-5 sm:p-6">
      <input type="text" name="company" className="hidden" tabIndex={-1} autoComplete="off" aria-hidden="true" />

      <label className="block space-y-1 text-sm">
        <span className="font-medium text-ink">Name</span>
        <input
          name="name"
          value={form.name}
          onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
          required
          className="h-11 w-full rounded-xl border border-border bg-surface px-3 text-ink"
          placeholder="Your name"
        />
      </label>

      <label className="block space-y-1 text-sm">
        <span className="font-medium text-ink">Email</span>
        <input
          name="email"
          type="email"
          value={form.email}
          onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))}
          required
          className="h-11 w-full rounded-xl border border-border bg-surface px-3 text-ink"
          placeholder="you@example.com"
        />
      </label>

      <label className="block space-y-1 text-sm">
        <span className="font-medium text-ink">Message</span>
        <textarea
          name="message"
          value={form.message}
          onChange={(event) => setForm((current) => ({ ...current, message: event.target.value }))}
          required
          className="min-h-36 w-full rounded-xl border border-border bg-surface px-3 py-2 text-ink"
          placeholder="Tell us what you need help with."
        />
      </label>

      {statusMessage ? (
        <p className={`text-sm ${statusType === "error" ? "text-red-600" : "text-emerald-700"}`}>{statusMessage}</p>
      ) : null}

      <Button type="submit" disabled={submitting}>
        {submitting ? "Sending..." : "Send message"}
      </Button>
    </form>
  );
}
