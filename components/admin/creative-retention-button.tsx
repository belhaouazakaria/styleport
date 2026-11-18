"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function CreativeRetentionButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function applyRetention() {
    if (!window.confirm("Remove image files for older unlinked Studio designs? Designs connected to reviews, approvals, publications, or active work will stay.")) return;
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/admin/growth/creative/retention", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.ok) throw new Error(payload?.error?.message || "Cleanup failed.");
      const removed = Number(payload.filesRemoved || 0);
      const retired = Number(payload.candidatesRetired || 0);
      setMessage(`Removed ${removed} image file${removed === 1 ? "" : "s"}; retired ${retired} older design${retired === 1 ? "" : "s"}.`);
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Cleanup failed.");
    } finally {
      setBusy(false);
    }
  }

  return <div className="flex flex-col items-start gap-2 sm:items-end">
    <button type="button" disabled={busy} onClick={applyRetention} className="inline-flex min-h-10 items-center justify-center rounded-full border border-border bg-white px-4 py-2 text-sm font-bold text-ink transition hover:border-brand-400 disabled:cursor-wait disabled:opacity-60">
      {busy ? "Cleaning up…" : "Clean up older designs"}
    </button>
    {message ? <p role="status" className="max-w-sm text-xs text-muted-ink sm:text-right">{message}</p> : null}
  </div>;
}
