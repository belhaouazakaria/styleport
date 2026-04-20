"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCcw, Sparkles } from "lucide-react";

import { useToast } from "@/components/providers/toast-provider";
import { Button } from "@/components/ui/button";
import { slugify } from "@/lib/slugify";
import type { TranslatorDraft } from "@/lib/types";

interface AiTranslatorCreatorProps {
  categories: Array<{ id: string; name: string; slug: string }>;
}

export function AiTranslatorCreator({ categories }: AiTranslatorCreatorProps) {
  const [brief, setBrief] = useState("");
  const [draft, setDraft] = useState<TranslatorDraft | null>(null);
  const [busy, setBusy] = useState<"generate" | "create" | null>(null);
  const [selectedCategoryId, setSelectedCategoryId] = useState(categories[0]?.id || "");
  const [modesJson, setModesJson] = useState("[]");
  const [examplesJson, setExamplesJson] = useState("[]");

  const router = useRouter();
  const { toast } = useToast();

  const canCreate = useMemo(() => Boolean(draft && selectedCategoryId), [draft, selectedCategoryId]);

  function applyDraft(nextDraft: TranslatorDraft) {
    setDraft(nextDraft);
    setModesJson(JSON.stringify(nextDraft.modes, null, 2));
    setExamplesJson(JSON.stringify(nextDraft.examples, null, 2));

    if (!categories.length) {
      return;
    }

    const suggestion = (nextDraft.categorySuggestion || "").trim().toLowerCase();
    const matched = categories.find(
      (item) => item.slug === slugify(suggestion) || item.name.toLowerCase() === suggestion,
    );

    if (matched) {
      setSelectedCategoryId(matched.id);
    }
  }

  async function generateDraft() {
    if (!brief.trim()) {
      toast({
        title: "Brief required",
        description: "Add a short prompt describing the translator you want to create.",
        variant: "error",
      });
      return;
    }

    setBusy("generate");

    const response = await fetch("/api/admin/translators/ai-draft", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ brief }),
    });

    const payload = await response.json();
    setBusy(null);

    if (!response.ok || !payload.ok) {
      toast({
        title: "AI generation failed",
        description: payload?.error?.message || "Please refine your brief and try again.",
        variant: "error",
      });
      return;
    }

    applyDraft(payload.draft);
    toast({ title: "Draft generated", description: "Review and edit before creating translator." });
  }

  async function createTranslatorFromDraft() {
    if (!draft || !selectedCategoryId) {
      return;
    }

    let modes: Array<{ key: string; label: string; description?: string; instruction: string; sortOrder: number }>;
    let examples: Array<{ label: string; value: string; sortOrder: number }>;

    try {
      modes = JSON.parse(modesJson);
      examples = JSON.parse(examplesJson);
    } catch {
      toast({
        title: "Invalid JSON",
        description: "Modes or examples JSON is invalid.",
        variant: "error",
      });
      return;
    }

    setBusy("create");

    const response = await fetch("/api/admin/translators", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: draft.name,
        slug: slugify(draft.slug || draft.name),
        title: draft.title,
        subtitle: draft.subtitle,
        shortDescription: draft.shortDescription,
        sourceLabel: draft.sourceLabel,
        targetLabel: draft.targetLabel,
        iconName: "",
        promptSystem: draft.systemPrompt,
        promptInstructions: draft.promptInstructions,
        seoTitle: draft.seoTitle || "",
        seoDescription: draft.seoDescription || "",
        modelOverride: "",
        isActive: false,
        isFeatured: false,
        showModeSelector: false,
        showSwap: false,
        showExamples: false,
        sortOrder: 50,
        primaryCategoryId: selectedCategoryId,
        categoryIds: [selectedCategoryId],
        modes,
        examples,
      }),
    });

    const payload = await response.json();
    setBusy(null);

    if (!response.ok || !payload.ok) {
      toast({
        title: "Create failed",
        description: payload?.error?.message || "Please review the draft and try again.",
        variant: "error",
      });
      return;
    }

    toast({ title: "Translator created", description: "Opening editor for final review." });
    router.push(`/admin/translators/${payload.translator.id}`);
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-border bg-surface p-6">
        <h2 className="font-display text-2xl font-semibold text-ink">Create With One Prompt</h2>
        <p className="mt-1 text-sm text-muted-ink">
          Describe your translator in plain language. AI will generate the full config draft automatically.
        </p>

        <label className="mt-4 block space-y-1 text-sm">
          <span className="font-medium text-muted-ink">Translator brief</span>
          <textarea
            value={brief}
            onChange={(event) => setBrief(event.target.value)}
            className="min-h-32 w-full rounded-xl border border-border bg-surface px-3 py-2 text-ink"
            placeholder="A translator that rewrites rough customer support replies into calm, professional responses while preserving intent."
          />
        </label>

        <div className="mt-4">
          <Button type="button" onClick={() => void generateDraft()} disabled={busy === "generate"}>
            <Sparkles className="h-4 w-4" />
            {busy === "generate" ? "Generating..." : draft ? "Regenerate Draft" : "Generate Draft"}
          </Button>
        </div>
      </section>

      {draft ? (
        <section className="rounded-2xl border border-border bg-surface p-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-display text-2xl font-semibold text-ink">Review Draft</h2>
            <Button type="button" variant="outline" onClick={() => void generateDraft()} disabled={busy === "generate"}>
              <RefreshCcw className={`h-4 w-4 ${busy === "generate" ? "animate-spin" : ""}`} />
              Regenerate
            </Button>
          </div>

          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <label className="space-y-1 text-sm">
              <span className="font-medium text-muted-ink">Name</span>
              <input
                value={draft.name}
                onChange={(event) => setDraft((current) => (current ? { ...current, name: event.target.value } : current))}
                className="h-11 w-full rounded-xl border border-border bg-surface px-3 text-ink"
              />
            </label>
            <label className="space-y-1 text-sm">
              <span className="font-medium text-muted-ink">Slug</span>
              <input
                value={draft.slug}
                onChange={(event) =>
                  setDraft((current) => (current ? { ...current, slug: slugify(event.target.value) } : current))
                }
                className="h-11 w-full rounded-xl border border-border bg-surface px-3 text-ink"
              />
            </label>
            <label className="space-y-1 text-sm md:col-span-2">
              <span className="font-medium text-muted-ink">Title</span>
              <input
                value={draft.title}
                onChange={(event) =>
                  setDraft((current) => (current ? { ...current, title: event.target.value } : current))
                }
                className="h-11 w-full rounded-xl border border-border bg-surface px-3 text-ink"
              />
            </label>
            <label className="space-y-1 text-sm md:col-span-2">
              <span className="font-medium text-muted-ink">Subtitle</span>
              <textarea
                value={draft.subtitle}
                onChange={(event) =>
                  setDraft((current) => (current ? { ...current, subtitle: event.target.value } : current))
                }
                className="min-h-20 w-full rounded-xl border border-border bg-surface px-3 py-2 text-ink"
              />
            </label>
            <label className="space-y-1 text-sm md:col-span-2">
              <span className="font-medium text-muted-ink">Short Description</span>
              <textarea
                value={draft.shortDescription}
                onChange={(event) =>
                  setDraft((current) => (current ? { ...current, shortDescription: event.target.value } : current))
                }
                className="min-h-20 w-full rounded-xl border border-border bg-surface px-3 py-2 text-ink"
              />
            </label>
            <label className="space-y-1 text-sm">
              <span className="font-medium text-muted-ink">Source Label</span>
              <input
                value={draft.sourceLabel}
                onChange={(event) =>
                  setDraft((current) => (current ? { ...current, sourceLabel: event.target.value } : current))
                }
                className="h-11 w-full rounded-xl border border-border bg-surface px-3 text-ink"
              />
            </label>
            <label className="space-y-1 text-sm">
              <span className="font-medium text-muted-ink">Target Label</span>
              <input
                value={draft.targetLabel}
                onChange={(event) =>
                  setDraft((current) => (current ? { ...current, targetLabel: event.target.value } : current))
                }
                className="h-11 w-full rounded-xl border border-border bg-surface px-3 text-ink"
              />
            </label>
            <label className="space-y-1 text-sm md:col-span-2">
              <span className="font-medium text-muted-ink">System Prompt</span>
              <textarea
                value={draft.systemPrompt}
                onChange={(event) =>
                  setDraft((current) => (current ? { ...current, systemPrompt: event.target.value } : current))
                }
                className="min-h-24 w-full rounded-xl border border-border bg-surface px-3 py-2 text-ink"
              />
            </label>
            <label className="space-y-1 text-sm md:col-span-2">
              <span className="font-medium text-muted-ink">Prompt Instructions</span>
              <textarea
                value={draft.promptInstructions}
                onChange={(event) =>
                  setDraft((current) =>
                    current
                      ? {
                          ...current,
                          promptInstructions: event.target.value,
                        }
                      : current,
                  )
                }
                className="min-h-24 w-full rounded-xl border border-border bg-surface px-3 py-2 text-ink"
              />
            </label>
            <label className="space-y-1 text-sm md:col-span-2">
              <span className="font-medium text-muted-ink">Modes JSON</span>
              <textarea
                value={modesJson}
                onChange={(event) => setModesJson(event.target.value)}
                className="min-h-32 w-full rounded-xl border border-border bg-surface px-3 py-2 font-mono text-xs text-ink"
              />
            </label>
            <label className="space-y-1 text-sm md:col-span-2">
              <span className="font-medium text-muted-ink">Examples JSON</span>
              <textarea
                value={examplesJson}
                onChange={(event) => setExamplesJson(event.target.value)}
                className="min-h-28 w-full rounded-xl border border-border bg-surface px-3 py-2 font-mono text-xs text-ink"
              />
            </label>
            <label className="space-y-1 text-sm">
              <span className="font-medium text-muted-ink">Category for new translator</span>
              <select
                value={selectedCategoryId}
                onChange={(event) => setSelectedCategoryId(event.target.value)}
                className="h-11 w-full rounded-xl border border-border bg-surface px-3 text-ink"
              >
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1 text-sm">
              <span className="font-medium text-muted-ink">SEO Title</span>
              <input
                value={draft.seoTitle || ""}
                onChange={(event) =>
                  setDraft((current) => (current ? { ...current, seoTitle: event.target.value } : current))
                }
                className="h-11 w-full rounded-xl border border-border bg-surface px-3 text-ink"
              />
            </label>
            <label className="space-y-1 text-sm md:col-span-2">
              <span className="font-medium text-muted-ink">SEO Description</span>
              <textarea
                value={draft.seoDescription || ""}
                onChange={(event) =>
                  setDraft((current) => (current ? { ...current, seoDescription: event.target.value } : current))
                }
                className="min-h-20 w-full rounded-xl border border-border bg-surface px-3 py-2 text-ink"
              />
            </label>
          </div>

          <div className="mt-5 flex flex-wrap gap-2">
            <Button type="button" onClick={() => void createTranslatorFromDraft()} disabled={!canCreate || busy === "create"}>
              <Sparkles className="h-4 w-4" />
              {busy === "create" ? "Creating..." : "Create translator from draft"}
            </Button>
          </div>
        </section>
      ) : null}
    </div>
  );
}

