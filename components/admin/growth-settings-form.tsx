"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { useToast } from "@/components/providers/toast-provider";

interface GrowthSettingsFormProps {
  initial: {
    enabled: boolean;
    intensity: "LOW" | "BALANCED" | "AGGRESSIVE" | "CUSTOM";
    workerBatchSize: number;
    ownedDomains: readonly string[];
  };
}

export function GrowthSettingsForm({ initial }: GrowthSettingsFormProps) {
  const [settings, setSettings] = useState(initial);
  const [ownedDomainsText, setOwnedDomainsText] = useState(initial.ownedDomains.join("\n"));
  const [saving, setSaving] = useState(false);
  const router = useRouter();
  const { toast } = useToast();

  async function save() {
    setSaving(true);
    try {
      const response = await fetch("/api/admin/growth/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...settings,
          ownedDomains: ownedDomainsText.split(/[\n,]/).map((value) => value.trim()).filter(Boolean),
        }),
      });
      const result = await response.json();
      if (!response.ok || !result.ok) {
        toast({
          title: "Growth settings were not saved",
          description: result?.error?.message || "Please try again.",
          variant: "error",
        });
        return;
      }
      setSettings({
        enabled: result.settings.enabled,
        intensity: result.settings.intensity,
        workerBatchSize: result.settings.workerBatchSize,
        ownedDomains: result.settings.ownedDomains,
      });
      setOwnedDomainsText(result.settings.ownedDomains.join("\n"));
      toast({ title: "Growth settings saved" });
      router.refresh();
    } catch {
      toast({
        title: "Growth settings were not saved",
        description: "The request could not be completed.",
        variant: "error",
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="rounded-2xl border border-border bg-white p-5 sm:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="section-kicker">Foundation controls</p>
          <h2 className="font-display mt-1 text-2xl font-bold text-ink">Growth settings</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-ink">
            The kill switch controls autonomous Growth job execution. Read-only status remains available when disabled.
          </p>
        </div>
        <label className="flex items-center gap-3 rounded-xl border border-border px-4 py-3 text-sm font-bold text-ink">
          <input
            type="checkbox"
            checked={settings.enabled}
            onChange={(event) => setSettings((current) => ({ ...current, enabled: event.target.checked }))}
            className="h-4 w-4 accent-brand-600"
          />
          Growth enabled
        </label>
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <label className="space-y-2 text-sm font-semibold text-ink">
          <span>Intensity placeholder</span>
          <select
            value={settings.intensity}
            onChange={(event) => setSettings((current) => ({ ...current, intensity: event.target.value as GrowthSettingsFormProps["initial"]["intensity"] }))}
            className="min-h-11 w-full rounded-xl border border-border bg-white px-3 text-sm"
          >
            <option value="LOW">Low</option>
            <option value="BALANCED">Balanced</option>
            <option value="AGGRESSIVE">Aggressive</option>
            <option value="CUSTOM">Custom</option>
          </select>
        </label>
        <label className="space-y-2 text-sm font-semibold text-ink">
          <span>Maximum jobs per worker run</span>
          <input
            type="number"
            min={1}
            max={25}
            value={settings.workerBatchSize}
            onChange={(event) => setSettings((current) => ({ ...current, workerBatchSize: Number(event.target.value) }))}
            className="min-h-11 w-full rounded-xl border border-border bg-white px-3 text-sm"
          />
        </label>
      </div>
      <label className="mt-4 block space-y-2 text-sm font-semibold text-ink">
        <span>Owned Pinterest domains</span>
        <textarea
          rows={4}
          value={ownedDomainsText}
          onChange={(event) => setOwnedDomainsText(event.target.value)}
          placeholder="saytwist.com"
          className="w-full rounded-xl border border-border bg-white px-3 py-2 font-mono text-sm"
        />
        <span className="block font-normal leading-5 text-muted-ink">
          Pins linking to these domains receive detailed per-Pin analytics. Other Pins remain inventoried but are not individually backfilled. Enter one hostname per line, without a scheme or path.
        </span>
      </label>
      <div className="mt-5 flex justify-end">
        <Button type="button" onClick={save} disabled={saving}>
          {saving ? "Saving…" : "Save Growth settings"}
        </Button>
      </div>
    </section>
  );
}
