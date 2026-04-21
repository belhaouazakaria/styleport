"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCcw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useToast } from "@/components/providers/toast-provider";
import type { AppSettings, AutoFeaturedTranslatorSummary } from "@/lib/types";

interface SettingsFormProps {
  initial: AppSettings;
  translators: Array<{
    id: string;
    slug: string;
    name: string;
    isActive: boolean;
  }>;
  modelOptions: string[];
  autoFeatured: AutoFeaturedTranslatorSummary[];
}

export function SettingsForm({
  initial,
  translators,
  modelOptions: initialModels,
  autoFeatured: initialAutoFeatured,
}: SettingsFormProps) {
  const [form, setForm] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [models, setModels] = useState(initialModels);
  const [refreshingModels, setRefreshingModels] = useState(false);
  const [recalculatingFeatured, setRecalculatingFeatured] = useState(false);
  const [autoFeaturedRows, setAutoFeaturedRows] = useState(initialAutoFeatured);
  const { toast } = useToast();
  const router = useRouter();

  async function refreshModels() {
    setRefreshingModels(true);
    const response = await fetch("/api/admin/models?refresh=1");
    const result = await response.json();
    setRefreshingModels(false);

    if (!response.ok || !result.ok) {
      toast({ title: "Model refresh failed", description: "Using cached list.", variant: "error" });
      return;
    }

    setModels(result.models || []);
    toast({ title: "Model list refreshed" });
  }

  async function save() {
    setBusy(true);
    const response = await fetch("/api/admin/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });

    const result = await response.json();
    setBusy(false);

    if (!response.ok || !result.ok) {
      toast({
        title: "Save failed",
        description: result?.error?.message || "Unable to save settings.",
        variant: "error",
      });
      return;
    }

    toast({ title: "Settings saved" });
    router.refresh();
  }

  async function recalculateFeatured() {
    setRecalculatingFeatured(true);
    const response = await fetch("/api/admin/settings/recalculate-featured", {
      method: "POST",
    });
    const result = await response.json();
    setRecalculatingFeatured(false);

    if (!response.ok || !result.ok) {
      toast({
        title: "Recalculation failed",
        description: result?.error?.message || "Unable to recalculate featured translators.",
        variant: "error",
      });
      return;
    }

    setAutoFeaturedRows(result.featured || []);
    toast({
      title: "Featured translators updated",
      description: "Top-performing translators have been reassigned.",
    });
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-border bg-white p-6">
        <h2 className="font-display text-2xl font-semibold text-ink">Platform Settings</h2>

        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <label className="space-y-1 text-sm">
            <span className="font-medium text-muted-ink">Platform Name</span>
            <input
              value={form.platformName}
              onChange={(event) => setForm((current) => ({ ...current, platformName: event.target.value }))}
              className="h-11 w-full rounded-xl border border-border px-3"
            />
          </label>

          <label className="space-y-1 text-sm">
            <span className="font-medium text-muted-ink">Default Translator</span>
            <select
              value={form.defaultTranslatorSlug}
              onChange={(event) =>
                setForm((current) => ({ ...current, defaultTranslatorSlug: event.target.value }))
              }
              className="h-11 w-full rounded-xl border border-border px-3"
            >
              {translators.map((translator) => (
                <option key={translator.id} value={translator.slug}>
                  {translator.name} ({translator.slug})
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-1 text-sm md:col-span-2">
            <span className="font-medium text-muted-ink">Homepage Title</span>
            <input
              value={form.homepageTitle}
              onChange={(event) => setForm((current) => ({ ...current, homepageTitle: event.target.value }))}
              className="h-11 w-full rounded-xl border border-border px-3"
            />
          </label>

          <label className="space-y-1 text-sm md:col-span-2">
            <span className="font-medium text-muted-ink">Homepage Subtitle</span>
            <textarea
              value={form.homepageSubtitle}
              onChange={(event) =>
                setForm((current) => ({ ...current, homepageSubtitle: event.target.value }))
              }
              className="min-h-20 w-full rounded-xl border border-border px-3 py-2"
            />
          </label>

          <label className="space-y-1 text-sm md:col-span-2">
            <span className="font-medium text-muted-ink">Catalog Intro</span>
            <textarea
              value={form.catalogIntro}
              onChange={(event) =>
                setForm((current) => ({ ...current, catalogIntro: event.target.value }))
              }
              className="min-h-20 w-full rounded-xl border border-border px-3 py-2"
            />
          </label>

          <label className="space-y-1 text-sm md:col-span-2">
            <span className="font-medium text-muted-ink">Footer Disclaimer</span>
            <textarea
              value={form.footerDisclaimer}
              onChange={(event) =>
                setForm((current) => ({ ...current, footerDisclaimer: event.target.value }))
              }
              className="min-h-20 w-full rounded-xl border border-border px-3 py-2"
            />
          </label>

          <label className="space-y-1 text-sm">
            <span className="font-medium text-muted-ink">Discovery Page Size</span>
            <input
              type="number"
              value={form.discoveryPageSize}
              onChange={(event) =>
                setForm((current) => ({ ...current, discoveryPageSize: Number(event.target.value) || 12 }))
              }
              className="h-11 w-full rounded-xl border border-border px-3"
            />
          </label>

          <div className="space-y-1 text-sm">
            <div className="flex items-center justify-between">
              <span className="font-medium text-muted-ink">Global Default Model</span>
              <button
                type="button"
                onClick={() => void refreshModels()}
                className="inline-flex items-center gap-1 text-xs font-medium text-brand-700 hover:text-brand-800"
              >
                <RefreshCcw className={`h-3.5 w-3.5 ${refreshingModels ? "animate-spin" : ""}`} />
                Refresh
              </button>
            </div>
            <select
              value={form.defaultModelOverride}
              onChange={(event) =>
                setForm((current) => ({ ...current, defaultModelOverride: event.target.value }))
              }
              className="h-11 w-full rounded-xl border border-border px-3"
            >
              <option value="">Use environment fallback</option>
              {models.map((model) => (
                <option key={model} value={model}>
                  {model}
                </option>
              ))}
            </select>
          </div>

          <label className="flex items-center gap-2 rounded-xl border border-border p-3 text-sm font-medium text-muted-ink md:col-span-2">
            <input
              type="checkbox"
              checked={form.featuredTranslatorsEnabled}
              onChange={(event) =>
                setForm((current) => ({ ...current, featuredTranslatorsEnabled: event.target.checked }))
              }
            />
            Show featured translators on homepage
          </label>

          <label className="flex items-center gap-2 rounded-xl border border-border p-3 text-sm font-medium text-muted-ink md:col-span-2">
            <input
              type="checkbox"
              checked={form.autoFeaturedEnabled}
              onChange={(event) =>
                setForm((current) => ({ ...current, autoFeaturedEnabled: event.target.checked }))
              }
            />
            Auto-assign top 3 featured translators from performance analytics
          </label>

          <label className="space-y-1 text-sm">
            <span className="font-medium text-muted-ink">Auto-featured Ranking Window (days)</span>
            <input
              type="number"
              min={1}
              max={180}
              value={form.autoFeaturedWindowDays}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  autoFeaturedWindowDays: Math.max(1, Number(event.target.value) || 30),
                }))
              }
              className="h-11 w-full rounded-xl border border-border px-3"
            />
          </label>

          <div className="space-y-2 rounded-xl border border-border p-3 text-sm md:col-span-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-medium text-muted-ink">Current Auto-featured Translators</p>
              <Button
                type="button"
                variant="outline"
                onClick={() => void recalculateFeatured()}
                disabled={recalculatingFeatured || !form.autoFeaturedEnabled}
              >
                {recalculatingFeatured ? "Recalculating..." : "Recalculate now"}
              </Button>
            </div>

            {autoFeaturedRows.length ? (
              <div className="space-y-2">
                {autoFeaturedRows.map((item) => (
                  <div
                    key={item.translatorId}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-muted-surface px-3 py-2"
                  >
                    <p className="font-medium text-ink">
                      #{item.rank} {item.name}{" "}
                      <span className="text-xs font-normal text-muted-ink">/{item.slug}</span>
                    </p>
                    <p className="text-xs text-muted-ink">
                      {item.successCount} successful translations · {item.recentSuccessCount} recent ·{" "}
                      {item.totalTokens} tokens
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-ink">
                No auto-featured translators selected yet. Run recalculation after enough usage data is available.
              </p>
            )}
          </div>

          <label className="flex items-center gap-2 rounded-xl border border-border p-3 text-sm font-medium text-muted-ink md:col-span-2">
            <input
              type="checkbox"
              checked={form.adsEnabled}
              onChange={(event) => setForm((current) => ({ ...current, adsEnabled: event.target.checked }))}
            />
            Enable ad rendering globally
          </label>

          <label className="space-y-1 text-sm md:col-span-2">
            <span className="font-medium text-muted-ink">AdSense Client ID (optional)</span>
            <input
              value={form.adSenseClientId}
              onChange={(event) =>
                setForm((current) => ({ ...current, adSenseClientId: event.target.value }))
              }
              className="h-11 w-full rounded-xl border border-border px-3"
              placeholder="ca-pub-xxxxxxxxxxxxxxxx"
            />
          </label>
        </div>
      </section>

      <Button type="button" onClick={() => void save()} disabled={busy}>
        {busy ? "Saving..." : "Save Settings"}
      </Button>
    </div>
  );
}
