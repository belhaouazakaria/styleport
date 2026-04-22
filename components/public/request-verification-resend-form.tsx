"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";

interface RequestVerificationResendFormProps {
  requestId: string;
}

export function RequestVerificationResendForm({ requestId }: RequestVerificationResendFormProps) {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setMessage(null);

    const response = await fetch("/api/translator-requests/resend-verification", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        requestId,
        requesterEmail: email,
      }),
    });

    const payload = await response.json().catch(() => null);
    setBusy(false);

    if (!response.ok || !payload?.ok) {
      setError(payload?.error?.message || "Unable to resend verification email right now.");
      return;
    }

    setMessage("Verification email sent. Please check your inbox and spam/junk folder.");
  }

  return (
    <form onSubmit={onSubmit} className="mt-4 space-y-3 rounded-xl border border-border bg-muted-surface p-4">
      <p className="text-sm text-muted-ink">
        Enter the same email you used when submitting your idea and we&apos;ll send a fresh verification link.
      </p>
      <label className="block space-y-1 text-sm">
        <span className="font-medium text-ink">Email</span>
        <input
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          required
          className="h-11 w-full rounded-xl border border-border bg-surface px-3 text-ink placeholder:text-muted-ink/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/60"
          placeholder="you@example.com"
        />
      </label>
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      {message ? <p className="text-sm text-emerald-700">{message}</p> : null}
      <Button type="submit" disabled={busy}>
        {busy ? "Sending..." : "Resend verification email"}
      </Button>
    </form>
  );
}
