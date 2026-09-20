"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function EditorialReviewActions({ id, status, payload }: { id: string; status: string; payload: unknown }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(JSON.stringify(payload, null, 2));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function action(actionName: string, body: Record<string, unknown> = {}) {
    setBusy(true); setError(null);
    const response = await fetch(`/api/admin/translators/review/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: actionName, ...body }) });
    const result = await response.json();
    setBusy(false);
    if (!response.ok || !result.ok) { setError(result?.error?.message || "Unable to update draft."); return; }
    if (actionName === "save") { setEditing(false); router.refresh(); return; }
    if (actionName === "regenerate") { router.push("/admin/translators/jobs"); return; }
    router.push("/admin/translators/review");
  }

  return <div className="mt-6 border-t border-border pt-5"><div className="flex flex-wrap gap-2">{status === "NEEDS_REVIEW" ? <><button disabled={busy} onClick={() => void action("approve")} className="rounded-xl bg-ink px-4 py-2 text-sm font-bold text-white">Approve</button><button disabled={busy} onClick={() => void action("discard")} className="rounded-xl border border-border px-4 py-2 text-sm font-semibold text-ink">Discard</button></> : null}{status === "APPROVED" ? <button disabled={busy} onClick={() => void action("publish")} className="rounded-xl bg-brand-600 px-4 py-2 text-sm font-bold text-white">Publish</button> : null}<button disabled={busy} onClick={() => setEditing((current) => !current)} className="rounded-xl border border-border px-4 py-2 text-sm font-semibold text-ink">{editing ? "Close editor" : "Edit draft"}</button><button disabled={busy} onClick={() => void action("regenerate")} className="rounded-xl border border-border px-4 py-2 text-sm font-semibold text-ink">Regenerate</button></div>{editing ? <div className="mt-4"><p className="text-xs text-muted-ink">Edit the draft JSON only. Saving returns it to Needs review; published content remains untouched.</p><textarea value={value} onChange={(event) => setValue(event.target.value)} className="mt-2 min-h-80 w-full rounded-xl border border-border bg-slate-950 p-3 font-mono text-xs text-slate-100" spellCheck={false} /><button disabled={busy} onClick={() => { try { void action("save", { draft: JSON.parse(value) }); } catch { setError("Draft JSON is not valid."); } }} className="mt-2 rounded-xl bg-ink px-4 py-2 text-sm font-bold text-white">Save draft</button></div> : null}{error ? <p className="mt-3 text-sm text-rose-700">{error}</p> : null}</div>;
}
