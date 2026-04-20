"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCcw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useToast } from "@/components/providers/toast-provider";
import type { AppSettings } from "@/lib/types";

interface SettingsFormProps {
  initial: AppSettings;
  translators: Array<{
    id: string;
    slug: string;
    name: string;
    isActive: boolean;
  }>;
  modelOptions: string[];
}

export function SettingsForm({ initial, translators, modelOptions: initialModels }: SettingsFormProps) {
  const [form, setForm] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [models, setModels] = useState(initialModels);
  const [refreshingModels, setRefreshingModels] = useState(false);
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
