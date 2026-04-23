"use client";

import Link from "next/link";
import { CommentModerationStatus } from "@prisma/client";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, ShieldBan } from "lucide-react";
import { useState } from "react";

import { useToast } from "@/components/providers/toast-provider";
import { Button } from "@/components/ui/button";
import type { AdminTranslatorCommentListItem } from "@/lib/types";
import { formatDateTime } from "@/lib/utils";

interface CommentTableProps {
  comments: AdminTranslatorCommentListItem[];
}

function statusClasses(status: CommentModerationStatus) {
  switch (status) {
    case "VISIBLE":
      return "bg-emerald-100 text-emerald-700";
    case "PENDING_REVIEW":
      return "bg-amber-100 text-amber-700";
    case "HIDDEN":
      return "bg-slate-200 text-slate-700";
    case "REJECTED":
      return "bg-red-100 text-red-700";
    default:
      return "bg-muted-surface text-muted-ink";
  }
}

export function CommentTable({ comments }: CommentTableProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [busyId, setBusyId] = useState<string | null>(null);

  async function moderate(id: string, status: CommentModerationStatus) {
    setBusyId(id);
    try {
      const response = await fetch(`/api/admin/comments/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const payload = await response.json();

      if (!response.ok || !payload.ok) {
        toast({
          title: "Update failed",
          description: payload?.error?.message || "Unable to update comment status.",
          variant: "error",
        });
        return;
      }

      toast({ title: "Comment updated" });
      router.refresh();
    } finally {
      setBusyId(null);
    }
  }

  if (!comments.length) {
    return (
      <div className="rounded-2xl border border-border bg-surface p-10 text-center text-sm text-muted-ink">
        No comments found for the selected filters.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-2xl border border-border bg-surface">
      <table className="min-w-full text-sm">
        <thead className="bg-muted-surface text-left text-muted-ink">
          <tr>
            <th className="px-4 py-3 font-medium">Translator</th>
            <th className="px-4 py-3 font-medium">Commenter</th>
            <th className="px-4 py-3 font-medium">Comment</th>
            <th className="px-4 py-3 font-medium">Status</th>
            <th className="px-4 py-3 font-medium">Created</th>
            <th className="px-4 py-3 font-medium">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {comments.map((comment) => {
            const isBusy = busyId === comment.id;
            return (
              <tr key={comment.id}>
                <td className="px-4 py-3">
                  <Link href={`/admin/translators/${comment.translator.id}`} className="font-medium text-ink">
                    {comment.translator.name}
                  </Link>
                  <p className="text-xs text-muted-ink">/{comment.translator.slug}</p>
                </td>
                <td className="px-4 py-3">
                  <p className="font-medium text-ink">{comment.name}</p>
                  <p className="text-xs text-muted-ink">{comment.email}</p>
                </td>
                <td className="px-4 py-3">
                  <p className="max-w-xl whitespace-pre-wrap text-muted-ink">{comment.content}</p>
                  {comment.moderationReason ? (
                    <p className="mt-1 text-xs text-amber-700">Reason: {comment.moderationReason}</p>
                  ) : null}
                </td>
                <td className="px-4 py-3">
                  <span className={`rounded-full px-2 py-1 text-xs font-semibold ${statusClasses(comment.status)}`}>
                    {comment.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-muted-ink">{formatDateTime(comment.createdAt)}</td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => void moderate(comment.id, CommentModerationStatus.VISIBLE)}
                      disabled={isBusy || comment.status === CommentModerationStatus.VISIBLE}
                    >
                      <Eye className="h-3.5 w-3.5" />
                      Show
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => void moderate(comment.id, CommentModerationStatus.HIDDEN)}
                      disabled={isBusy || comment.status === CommentModerationStatus.HIDDEN}
                    >
                      <EyeOff className="h-3.5 w-3.5" />
                      Hide
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="border-red-300 text-red-700 hover:bg-red-50"
                      onClick={() => void moderate(comment.id, CommentModerationStatus.REJECTED)}
                      disabled={isBusy || comment.status === CommentModerationStatus.REJECTED}
                    >
                      <ShieldBan className="h-3.5 w-3.5" />
                      Reject
                    </Button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
