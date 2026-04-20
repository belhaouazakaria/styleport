"use client";

import Link from "next/link";
import { Pencil, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/admin/confirm-dialog";
import { useToast } from "@/components/providers/toast-provider";
import { formatDateTime } from "@/lib/utils";

interface CategoryRow {
  id: string;
  name: string;
  slug: string;
  isActive: boolean;
  sortOrder: number;
  archivedAt: string | null;
  updatedAt: string;
  _count: {
    translators: number;
    adPlacements: number;
  };
}

interface CategoryTableProps {
  categories: CategoryRow[];
}

type ConfirmState =
  | { type: "archive"; id: string }
  | { type: "unarchive"; id: string }
  | { type: "hard-delete"; id: string }
  | null;

export function CategoryTable({ categories }: CategoryTableProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [confirm, setConfirm] = useState<ConfirmState>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const current = confirm ? categories.find((item) => item.id === confirm.id) : null;

  async function run(mode: "archive" | "unarchive" | "hard") {
    if (!confirm) return;

    setBusyId(confirm.id);
    const response = await fetch(`/api/admin/categories/${confirm.id}?mode=${mode}`, {
      method: "DELETE",
    });
    const payload = await response.json();
    setBusyId(null);
    setConfirm(null);

    if (!response.ok || !payload.ok) {
      toast({ title: "Action failed", description: payload?.error?.message || "Please retry.", variant: "error" });
      return;
    }

    router.refresh();
  }

  if (!categories.length) {
    return (
      <div className="rounded-2xl border border-border bg-white p-10 text-center text-sm text-muted-ink">
        No categories found.
      </div>
    );
  }

  return (
    <>
      <div className="overflow-x-auto rounded-2xl border border-border bg-white">
        <table className="min-w-full text-sm">
          <thead className="bg-muted-surface text-left text-muted-ink">
            <tr>
              <th className="px-4 py-3 font-medium">Name</th>
              <th className="px-4 py-3 font-medium">Slug</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Translators</th>
              <th className="px-4 py-3 font-medium">Ads</th>
              <th className="px-4 py-3 font-medium">Updated</th>
              <th className="px-4 py-3 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {categories.map((row) => {
              const archived = Boolean(row.archivedAt);
              const busy = busyId === row.id;

              return (
                <tr key={row.id}>
                  <td className="px-4 py-3 font-medium text-ink">{row.name}</td>
                  <td className="px-4 py-3 text-muted-ink">/{row.slug}</td>
                  <td className="px-4 py-3">
                    {archived ? (
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
                  <td className="px-4 py-3 text-ink">{row._count.translators}</td>
                  <td className="px-4 py-3 text-ink">{row._count.adPlacements}</td>
                  <td className="px-4 py-3 text-muted-ink">{formatDateTime(row.updatedAt)}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-2">
                      <Link
                        href={`/admin/categories/${row.id}`}
                        className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border px-3 text-xs font-medium text-ink hover:bg-muted-surface"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                        Edit
                      </Link>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busy}
                        onClick={() => setConfirm({ type: archived ? "unarchive" : "archive", id: row.id })}
                      >
                        {archived ? "Unarchive" : "Archive"}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="border-red-300 text-red-700 hover:bg-red-50"
                        disabled={busy}
                        onClick={() => setConfirm({ type: "hard-delete", id: row.id })}
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
            ? "Permanently delete category?"
            : confirm?.type === "archive"
              ? "Archive category?"
              : "Unarchive category?"
        }
        description={
          confirm?.type === "hard-delete"
            ? `Delete ${current?.name || "this category"} forever?`
            : confirm?.type === "archive"
              ? `Archive ${current?.name || "this category"}?`
              : `Unarchive ${current?.name || "this category"}?`
        }
        confirmLabel={
          confirm?.type === "hard-delete"
            ? "Delete forever"
            : confirm?.type === "archive"
              ? "Archive"
              : "Unarchive"
        }
        onCancel={() => setConfirm(null)}
        onConfirm={() => void run(confirm?.type === "hard-delete" ? "hard" : confirm?.type || "archive")}
        variant={confirm?.type === "hard-delete" ? "danger" : "default"}
      />
    </>
  );
}
