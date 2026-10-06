"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";

export function AccountStrategyReviewButton() {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function enqueue() {
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch("/api/admin/growth/strategy/reviews", {
        method: "POST",
      });
      const result = await response.json();
      if (!response.ok || !result.ok)
        throw new Error(
          result?.error?.message || "Unable to queue strategy review.",
        );
      setMessage(
        result.created
          ? "Account strategy review queued."
          : "This month's canonical review is already queued or complete.",
      );
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Unable to queue strategy review.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-start gap-2">
      <Button type="button" onClick={() => void enqueue()} disabled={busy}>
        {busy ? "Queueing…" : "Run account strategy review"}
      </Button>
      {message ? <p className="text-muted-ink text-sm">{message}</p> : null}
    </div>
  );
}
