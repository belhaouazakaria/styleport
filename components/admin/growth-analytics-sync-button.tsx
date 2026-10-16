"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";

export function GrowthAnalyticsSyncButton({ accountId }: { accountId: string }) {
  const router = useRouter();
  const [state, setState] = useState<"idle" | "loading" | "queued" | "error">("idle");
  const [recoveryRecommended, setRecoveryRecommended] = useState(false);
  async function queueSync() {
    setState("loading");
    const response = await fetch(`/api/admin/growth/pinterest/accounts/${accountId}/analytics/sync`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: "{}",
    }).catch(() => null);
    const result = await response?.json().catch(() => null);
    if (!response?.ok || !result?.ok) return setState("error");
    setRecoveryRecommended(Boolean(result.recoveryRecommendation?.recommended));
    setState("queued");
    router.refresh();
  }
  return <div className="flex items-center gap-3">
    <Button type="button" onClick={queueSync} disabled={state === "loading"}>{state === "loading" ? "Queuing…" : "Sync analytics"}</Button>
    <span className="text-sm text-muted-ink" aria-live="polite">{state === "queued" ? recoveryRecommended ? "Bounded jobs queued. Historical gaps were detected; preview recovery before queuing it." : "Bounded jobs queued. No historical recovery was recommended." : state === "error" ? "Could not queue sync." : ""}</span>
  </div>;
}
