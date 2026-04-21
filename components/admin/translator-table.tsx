"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Copy, Eye, EyeOff, Image as ImageIcon, Pencil, RefreshCcw, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { useToast } from "@/components/providers/toast-provider";
import { ConfirmDialog } from "@/components/admin/confirm-dialog";
import type { TranslatorListItem } from "@/lib/types";
import { formatDateTime } from "@/lib/utils";

interface TranslatorTableProps {
  translators: TranslatorListItem[];
}

type ConfirmState =
  | { type: "archive"; id: string }
  | { type: "unarchive"; id: string }
  | { type: "hard-delete"; id: string }
  | null;

function getErrorMessage(payload: Record<string, unknown> | null) {
  const maybeError = payload?.error;
  if (maybeError && typeof maybeError === "object" && "message" in maybeError) {
    const message = (maybeError as { message?: unknown }).message;
    if (typeof message === "string" && message.trim()) {
      return message;
    }
  }

  return "Please try again.";
}

export function TranslatorTable({ translators }: TranslatorTableProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<ConfirmState>(null);

  const target = useMemo(
    () => (confirm ? translators.find((item) => item.id === confirm.id) || null : null),
    [confirm, translators],
  );

  async function runAction(
    id: string,
    action: () => Promise<Response>,
  ): Promise<{ ok: boolean; payload: Record<string, unknown> | null }> {
    setBusyId(id);
    try {
      const response = await action();
      const payload = (await response.json()) as Record<string, unknown>;

      if (!response.ok || !payload.ok) {
        toast({
          title: "Action failed",
          description: getErrorMessage(payload),
          variant: "error",
        });
        return { ok: false, payload };
      }

      router.refresh();
      return { ok: true, payload };
    } finally {
      setBusyId(null);
    }
  }

  async function duplicate(id: string) {
    const result = await runAction(id, () =>
      fetch(`/api/admin/translators/${id}/duplicate`, {
        method: "POST",
      }),
    );
    if (result.ok) {
      toast({ title: "Translator duplicated", description: "A draft copy has been created." });
    }
  }

  async function toggleActive(id: string) {
    await runAction(id, () =>
      fetch(`/api/admin/translators/${id}/toggle-active`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      }),
    );
  }

  async function regenerateShareImage(id: string) {
    const result = await runAction(id, () =>
      fetch(`/api/admin/translators/${id}/regenerate-share-image`, {
        method: "POST",
      }),
    );
    if (!result.ok) {
      return;
    }

    if (typeof result.payload?.shareImagePath !== "string" || !result.payload.shareImagePath) {
      toast({
        title: "Regeneration failed",
        description:
          "Share image path is missing. Check SHARE_IMAGE_STORAGE_DIR and server write permissions.",
        variant: "error",
      });
      return;
    }

    toast({ title: "Share image regenerated" });
  }

  async function runConfirm() {
    if (!confirm) {
      return;
    }

    const mode = confirm.type === "hard-delete" ? "hard" : confirm.type;

    await runAction(confirm.id, () =>
      fetch(`/api/admin/translators/${confirm.id}?mode=${mode}`, {
        method: "DELETE",
      }),
    );

    setConfirm(null);
  }

  if (!translators.length) {
    return (
      <div className="rounded-2xl border border-border bg-white p-10 text-center text-sm text-muted-ink">
        No translators found for the selected filters.
      </div>
    );
  }

  return (
    <>
      <div className="overflow-x-auto rounded-2xl border border-border bg-white">
        <table className="min-w-full divide-y divide-border text-sm">
          <thead className="bg-muted-surface text-left text-muted-ink">
            <tr>
              <th className="px-4 py-3 font-medium">Name</th>
              <th className="px-4 py-3 font-medium">Slug</th>
              <th className="px-4 py-3 font-medium">Categories</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Featured</th>
              <th className="px-4 py-3 font-medium">Share Image</th>
              <th className="px-4 py-3 font-medium">Updated</th>
              <th className="px-4 py-3 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {translators.map((row) => {
              const isBusy = busyId === row.id;
              const isArchived = Boolean(row.archivedAt);

              return (
                <tr key={row.id}>
                  <td className="px-4 py-3 font-medium text-ink">{row.name}</td>
                  <td className="px-4 py-3 text-muted-ink">/{row.slug}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {row.categories.length ? (
                        row.categories.map((category) => (
                          <span
                            key={`${row.id}-${category.id}`}
                            className="rounded-full border border-border bg-muted-surface px-2 py-0.5 text-[11px] text-muted-ink"
                          >
                            {category.name}
                          </span>
                        ))
                      ) : (
                        <span className="text-xs text-muted-ink">Uncategorized</span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    {isArchived ? (
                      <span className="rounded-full bg-amber-100 px-2 py-1 text-xs font-medium text-amber-700">
                        Archived
                      </span>
                    ) : row.isActive ? (
                      <span className="rounded-full bg-emerald-100 px-2 py-1 text-xs font-medium text-emerald-700">
                        Active
                      </span>
                    ) : (
                      <span className="rounded-full bg-muted-surface px-2 py-1 text-xs font-medium text-muted-ink">
                        Inactive
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {row.isFeatured ? (
                      <span className="rounded-full bg-brand-100 px-2 py-1 text-xs font-medium text-brand-700">
                        {row.featuredSource === "AUTO" && row.featuredRank
                          ? `Auto #${row.featuredRank}`
                          : "Featured"}
                      </span>
                    ) : (
                      <span className="text-muted-ink">No</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {row.shareImagePath ? (
                      <a
                        href={row.shareImagePath}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 rounded-lg border border-border bg-muted-surface px-2 py-1 text-xs font-medium text-ink hover:border-brand-300 hover:text-brand-700"
                      >
                        <ImageIcon className="h-3.5 w-3.5" />
                        Ready
                      </a>
                    ) : (
                      <span className="text-xs text-muted-ink">Missing</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-muted-ink">{formatDateTime(row.updatedAt)}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-2">
                      <Link
                        href={`/admin/translators/${row.id}`}
                        className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border bg-white px-3 text-xs font-medium text-ink hover:bg-muted-surface"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                        Edit
                      </Link>
                      <Button size="sm" variant="outline" onClick={() => duplicate(row.id)} disabled={isBusy}>
                        <Copy className="h-3.5 w-3.5" />
                        Duplicate
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => regenerateShareImage(row.id)}
                        disabled={isBusy}
                      >
                        <RefreshCcw className="h-3.5 w-3.5" />
                        Regen image
                      </Button>
                      {!isArchived ? (
                        <Button size="sm" variant="outline" onClick={() => toggleActive(row.id)} disabled={isBusy}>
                          {row.isActive ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                          {row.isActive ? "Deactivate" : "Activate"}
                        </Button>
                      ) : null}
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setConfirm({ type: isArchived ? "unarchive" : "archive", id: row.id })}
                        disabled={isBusy}
                      >
                        {isArchived ? "Unarchive" : "Archive"}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="border-red-300 text-red-700 hover:bg-red-50"
                        onClick={() => setConfirm({ type: "hard-delete", id: row.id })}
                        disabled={isBusy}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        Delete
                      </Button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <ConfirmDialog
        open={Boolean(confirm)}
        title={
          confirm?.type === "hard-delete"
            ? "Permanently delete translator?"
            : confirm?.type === "archive"
              ? "Archive translator?"
              : "Unarchive translator?"
        }
        description={
          confirm?.type === "hard-delete"
            ? `This will permanently remove ${target?.name || "this translator"} and all related modes, examples, and logs.`
            : confirm?.type === "archive"
              ? `This hides ${target?.name || "this translator"} from public routes.`
              : `This restores ${target?.name || "this translator"} to public availability.`
        }
        confirmLabel={
          confirm?.type === "hard-delete"
            ? "Delete forever"
            : confirm?.type === "archive"
              ? "Archive"
              : "Unarchive"
        }
        onCancel={() => setConfirm(null)}
        onConfirm={() => void runConfirm()}
        variant={confirm?.type === "hard-delete" ? "danger" : "default"}
      />
    </>
  );
}
