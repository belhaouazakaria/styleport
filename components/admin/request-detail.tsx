"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { TranslatorRequestStatus } from "@prisma/client";
import { RefreshCcw, Sparkles, Trash2 } from "lucide-react";

import type { AdminTranslatorRequestDetail } from "@/lib/types";
import { useToast } from "@/components/providers/toast-provider";
import { ConfirmDialog } from "@/components/admin/confirm-dialog";
import { Button } from "@/components/ui/button";
import { formatDateTime } from "@/lib/utils";

interface RequestDetailProps {
  request: AdminTranslatorRequestDetail;
}

const statusOptions: TranslatorRequestStatus[] = [
  "PENDING_EMAIL_VERIFICATION",
  "VERIFIED",
  "PENDING_REVIEW",
  "NEW",
  "REVIEWING",
  "DRAFT_GENERATED",
  "APPROVED",
  "REJECTED",
  "COMPLETED",
  "PUBLISHED",
];

export function RequestDetail({ request }: RequestDetailProps) {
  const [status, setStatus] = useState<TranslatorRequestStatus>(request.status);
  const [adminNotes, setAdminNotes] = useState(request.adminNotes || "");
  const [draft, setDraft] = useState(request.aiDraftJson);
  const [busy, setBusy] = useState<"save" | "draft" | "create" | "delete" | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const { toast } = useToast();
  const router = useRouter();

  const isLinked = useMemo(() => Boolean(request.createdTranslatorId), [request.createdTranslatorId]);
  const canCreateTranslator = request.isEligibleForReview;

  async function saveMeta(nextStatus?: TranslatorRequestStatus) {
    setBusy("save");
    const response = await fetch(`/api/admin/requests/${request.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        status: nextStatus || status,
        adminNotes,
      }),
    });

    const payload = await response.json();
    setBusy(null);

    if (!response.ok || !payload.ok) {
      toast({
        title: "Update failed",
        description: payload?.error?.message || "Please try again.",
        variant: "error",
      });
      return;
    }

    if (nextStatus) {
      setStatus(nextStatus);
    }

    toast({ title: "Submission updated" });
    router.refresh();
  }

  async function generateDraft() {
    setBusy("draft");

    const response = await fetch(`/api/admin/requests/${request.id}/generate-draft`, {
      method: "POST",
    });

    const payload = await response.json();
    setBusy(null);

    if (!response.ok || !payload.ok) {
      toast({
        title: "Draft generation failed",
        description: payload?.error?.message || "Please try again.",
        variant: "error",
      });
      return;
    }

    setDraft(payload.draft || null);
    setStatus("DRAFT_GENERATED");
    toast({ title: "AI draft generated" });
    router.refresh();
  }

  async function createFromDraft() {
    setBusy("create");
    const response = await fetch(`/api/admin/requests/${request.id}/create-translator`, {
      method: "POST",
    });

    const payload = await response.json();
    setBusy(null);

    if (!response.ok || !payload.ok) {
      toast({
        title: "Translator creation failed",
        description: payload?.error?.message || "Please try again.",
        variant: "error",
      });
      return;
    }

    toast({ title: "Translator created from submission" });
    router.push(`/admin/translators/${payload.translator.id}`);
    router.refresh();
  }

  async function deleteRequest() {
    setBusy("delete");
    const response = await fetch(`/api/admin/requests/${request.id}`, {
      method: "DELETE",
    });
    const payload = await response.json();
    setBusy(null);

    if (!response.ok || !payload.ok) {
      toast({
        title: "Delete failed",
        description: payload?.error?.message || "Please try again.",
        variant: "error",
      });
      return;
    }

    toast({ title: "Submission deleted" });
    router.push("/admin/requests");
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <section className="grid gap-4 rounded-2xl border border-border bg-surface p-5 sm:grid-cols-2 lg:grid-cols-3">
        <article>
          <p className="text-xs font-medium uppercase text-muted-ink">Submitter Email</p>
          <p className="mt-1 text-sm text-ink">{request.requesterEmail || "Not provided"}</p>
        </article>
        <article>
          <p className="text-xs font-medium uppercase text-muted-ink">Email Verified</p>
          <p className="mt-1 text-sm text-ink">
            {request.emailVerifiedAt ? `Yes • ${formatDateTime(request.emailVerifiedAt)}` : "No"}
          </p>
        </article>
        <article>
          <p className="text-xs font-medium uppercase text-muted-ink">Suggested Category</p>
          <p className="mt-1 text-sm text-ink">{request.suggestedCategory || "Unspecified"}</p>
        </article>
        <article>
          <p className="text-xs font-medium uppercase text-muted-ink">Created</p>
          <p className="mt-1 text-sm text-ink">{formatDateTime(request.createdAt)}</p>
        </article>
        <article>
          <p className="text-xs font-medium uppercase text-muted-ink">Verification Email Sent</p>
          <p className="mt-1 text-sm text-ink">
            {request.verificationEmailSentAt ? formatDateTime(request.verificationEmailSentAt) : "Not yet"}
          </p>
        </article>
        <article>
          <p className="text-xs font-medium uppercase text-muted-ink">Published Notification</p>
          <p className="mt-1 text-sm text-ink">
            {request.publishedNotificationSentAt ? formatDateTime(request.publishedNotificationSentAt) : "Not sent"}
          </p>
        </article>
      </section>

      <section className="rounded-2xl border border-border bg-surface p-5">
        <h2 className="font-display text-2xl font-semibold text-ink">Create Submission Details</h2>
        <dl className="mt-4 space-y-4 text-sm">
          <div>
            <dt className="font-medium text-muted-ink">Translator Name</dt>
            <dd className="mt-1 text-ink">{request.requestedName}</dd>
          </div>
          <div>
            <dt className="font-medium text-muted-ink">Translator Description</dt>
            <dd className="mt-1 whitespace-pre-wrap text-ink">{request.description}</dd>
          </div>
          <div>
            <dt className="font-medium text-muted-ink">Example input</dt>
            <dd className="mt-1 whitespace-pre-wrap text-ink">{request.exampleInput || "-"}</dd>
          </div>
          <div>
            <dt className="font-medium text-muted-ink">Desired output/style</dt>
            <dd className="mt-1 whitespace-pre-wrap text-ink">{request.desiredStyle || "-"}</dd>
          </div>
          <div>
            <dt className="font-medium text-muted-ink">Audience / use case</dt>
            <dd className="mt-1 whitespace-pre-wrap text-ink">{request.audience || "-"}</dd>
          </div>
          <div>
            <dt className="font-medium text-muted-ink">Additional notes</dt>
            <dd className="mt-1 whitespace-pre-wrap text-ink">{request.notes || "-"}</dd>
          </div>
        </dl>
      </section>

      <section className="rounded-2xl border border-border bg-surface p-5">
        <h2 className="font-display text-2xl font-semibold text-ink">Admin Controls</h2>

        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <label className="space-y-1 text-sm">
            <span className="font-medium text-muted-ink">Status</span>
            <select
              value={status}
              onChange={(event) => setStatus(event.target.value as TranslatorRequestStatus)}
              className="h-11 w-full rounded-xl border border-border bg-surface px-3 text-ink"
            >
              {statusOptions.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-1 text-sm md:col-span-2">
            <span className="font-medium text-muted-ink">Internal admin notes</span>
            <textarea
              value={adminNotes}
              onChange={(event) => setAdminNotes(event.target.value)}
              className="min-h-28 w-full rounded-xl border border-border bg-surface px-3 py-2 text-ink"
              placeholder="Internal notes, review comments, next actions..."
            />
          </label>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <Button type="button" onClick={() => void saveMeta()} disabled={busy === "save"}>
            {busy === "save" ? "Saving..." : "Save updates"}
          </Button>
          <Button type="button" variant="outline" onClick={() => void saveMeta("REVIEWING")}>
            Mark Reviewing
          </Button>
          <Button type="button" variant="outline" onClick={() => void saveMeta("REJECTED")}>
            Decline
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => void createFromDraft()}
            disabled={busy === "create" || isLinked || !canCreateTranslator}
          >
            {busy === "create" ? "Approving..." : "Approve and create translator"}
          </Button>
          <Button
            type="button"
            variant="outline"
            className="border-red-300 text-red-700 hover:bg-red-50"
            onClick={() => setConfirmDelete(true)}
            disabled={busy === "delete"}
          >
            <Trash2 className="h-4 w-4" />
            Delete request
          </Button>
        </div>
        {!canCreateTranslator ? (
          <p className="mt-3 text-sm text-amber-700">
            This submission is not eligible for review yet. The submitter must verify their email first.
          </p>
        ) : null}
      </section>

      <section className="rounded-2xl border border-border bg-surface p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-display text-2xl font-semibold text-ink">AI Draft</h2>
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={() => void generateDraft()} disabled={busy === "draft"}>
              <RefreshCcw className={`h-4 w-4 ${busy === "draft" ? "animate-spin" : ""}`} />
              {draft ? "Regenerate" : "Generate AI draft"}
            </Button>
            <Button
              type="button"
              onClick={() => void createFromDraft()}
              disabled={isLinked || busy === "create" || !canCreateTranslator}
            >
              <Sparkles className="h-4 w-4" />
              {busy === "create" ? "Creating..." : "Create translator now"}
            </Button>
          </div>
        </div>

        {request.createdTranslator ? (
          <p className="mt-3 text-sm text-emerald-700">
            Linked translator: {request.createdTranslator.name} (/{request.createdTranslator.slug})
          </p>
        ) : null}

        {draft ? (
          <pre className="mt-4 max-h-[520px] overflow-auto rounded-xl border border-border bg-muted-surface p-4 text-xs text-ink">
            {JSON.stringify(draft, null, 2)}
          </pre>
        ) : (
          <p className="mt-4 text-sm text-muted-ink">
            No AI draft generated yet. Use the button above to create a first pass draft.
          </p>
        )}
      </section>

      <ConfirmDialog
        open={confirmDelete}
        title="Delete this submission?"
        description="This will permanently remove the create-translator submission record."
        confirmLabel="Delete submission"
        onCancel={() => setConfirmDelete(false)}
        onConfirm={() => {
          setConfirmDelete(false);
          void deleteRequest();
        }}
        variant="danger"
      />
    </div>
  );
}
