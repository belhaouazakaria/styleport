"use client";

import { GrowthPinterestPublicationRole } from "@prisma/client";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { useToast } from "@/components/providers/toast-provider";
import { Button } from "@/components/ui/button";

export function PinterestAccountActions({ accountId, currentRole }: { accountId: string; currentRole: GrowthPinterestPublicationRole }) {
  const [busy, setBusy] = useState(false);
  const [role, setRole] = useState(currentRole);
  const router = useRouter();
  const { toast } = useToast();

  async function mutate(path: string, init: RequestInit, success: string) {
    setBusy(true);
    try {
      const response = await fetch(path, { ...init, headers: { "Content-Type": "application/json", ...init.headers } });
      const result = await response.json();
      if (!response.ok || !result.ok) throw new Error(result?.error?.message || "The Pinterest action failed.");
      toast({ title: success });
      router.refresh();
    } catch (error) {
      toast({ title: "Pinterest action failed", description: error instanceof Error ? error.message : "Please try again.", variant: "error" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-4 flex flex-wrap items-end gap-3">
      <label className="space-y-1 text-xs font-semibold text-muted-ink">
        <span>Publication role</span>
        <select value={role} disabled={busy} onChange={(event) => setRole(event.target.value as GrowthPinterestPublicationRole)} className="block min-h-10 rounded-xl border border-border bg-white px-3 text-sm text-ink">
          <option value="SAYTWIST">SayTwist</option>
          <option value="SAYTWIST_IDEAS">SayTwist Ideas</option>
          <option value="SAYTWIST_PLAYGROUND">SayTwist Playground</option>
        </select>
      </label>
      <Button size="sm" variant="outline" disabled={busy || role === currentRole} onClick={() => mutate(`/api/admin/growth/pinterest/accounts/${accountId}`, { method: "PATCH", body: JSON.stringify({ role }) }, "Publication role updated")}>Change role</Button>
      <Button size="sm" variant="outline" disabled={busy} onClick={() => mutate(`/api/admin/growth/pinterest/accounts/${accountId}/sync`, { method: "POST" }, "Pinterest sync queued")}>Sync</Button>
      <Button size="sm" variant="ghost" disabled={busy} onClick={() => {
        if (window.confirm("Disconnect this Pinterest account and erase its stored credentials?")) {
          void mutate(`/api/admin/growth/pinterest/accounts/${accountId}`, { method: "DELETE", body: JSON.stringify({ confirm: true }) }, "Pinterest account disconnected");
        }
      }}>Disconnect</Button>
    </div>
  );
}
