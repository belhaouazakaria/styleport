"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { useToast } from "@/components/providers/toast-provider";
import { Button } from "@/components/ui/button";

interface IndexingActionsProps {
  disabled?: boolean;
}

export function IndexingActions({ disabled = false }: IndexingActionsProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);

  async function submitAllActive() {
    setBusy(true);
    try {
      const response = await fetch("/api/admin/indexing/submit-active", {
        method: "POST",
      });
      const payload = await response.json();

      if (!response.ok || !payload.ok) {
        toast({
          title: "Indexing request failed",
          description: payload?.error?.message || "Unable to submit active translators right now.",
          variant: "error",
        });
        return;
      }

      const summary = payload.summary as {
        total: number;
        submitted: number;
        failed: number;
        skipped: number;
        dryRun: number;
      };

      toast({
        title: "Google indexing request completed",
        description: `Total: ${summary.total} | Submitted: ${summary.submitted} | Failed: ${summary.failed} | Skipped: ${summary.skipped} | Dry-run: ${summary.dryRun}`,
      });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button type="button" onClick={() => void submitAllActive()} disabled={disabled || busy}>
        {busy ? "Submitting..." : "Index all active translators"}
      </Button>
      <p className="text-xs text-muted-ink">
        Google Indexing API submission requested. Final indexing is not guaranteed.
      </p>
    </div>
  );
}
