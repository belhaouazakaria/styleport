"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { ArrowDown, ArrowUp, Copy, Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useToast } from "@/components/providers/toast-provider";
import { ConfirmDialog } from "@/components/admin/confirm-dialog";
import { slugify } from "@/lib/slugify";

interface FormMode {
  key: string;
  label: string;
  description: string;
  instruction: string;
  sortOrder: number;
}

interface FormExample {
  label: string;
  value: string;
  sortOrder: number;
}

interface FormEditorial {
  about: string;
  whatItDoes: string;
  differenceDescription: string;
  bestUses: string[];
  howToUse: string[];
  tips: string[];
  examples: Array<{ contextTitle: string; originalText: string; transformedText: string; sortOrder: number }>;
  faq: Array<{ question: string; answer: string; sortOrder: number }>;
}

function EditorialListEditor({
  label,
  items,
  onChange,
}: {
  label: string;
  items: string[];
  onChange: (items: string[]) => void;
}) {
  return (
    <div className="space-y-2 rounded-xl border border-border p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium text-muted-ink">{label}</span>
        <Button type="button" size="sm" variant="outline" onClick={() => onChange([...items, ""])}>
          <Plus className="h-3.5 w-3.5" /> Add item
        </Button>
      </div>
      {items.length ? items.map((item, index) => (
        <div key={`${label}-${index}`} className="flex items-start gap-2">
          <textarea value={item} onChange={(event) => onChange(items.map((value, itemIndex) => itemIndex === index ? event.target.value : value))} className="min-h-16 flex-1 rounded-lg border border-border px-3 py-2 text-sm" />
          <div className="flex flex-col gap-1">
            <button type="button" aria-label="Move item up" disabled={index === 0} onClick={() => { const next = [...items]; [next[index - 1], next[index]] = [next[index], next[index - 1]]; onChange(next); }} className="rounded border border-border p-1 disabled:opacity-30"><ArrowUp className="h-3 w-3" /></button>
            <button type="button" aria-label="Move item down" disabled={index === items.length - 1} onClick={() => { const next = [...items]; [next[index], next[index + 1]] = [next[index + 1], next[index]]; onChange(next); }} className="rounded border border-border p-1 disabled:opacity-30"><ArrowDown className="h-3 w-3" /></button>
            <button type="button" aria-label="Delete item" onClick={() => onChange(items.filter((_, itemIndex) => itemIndex !== index))} className="rounded border border-red-200 p-1 text-red-600"><Trash2 className="h-3 w-3" /></button>
          </div>
        </div>
      )) : <p className="text-xs text-muted-ink">No items yet.</p>}
    </div>
  );
}

function EditorialExamplesEditor({
  examples,
  onChange,
}: {
  examples: FormEditorial["examples"];
  onChange: (examples: FormEditorial["examples"]) => void;
}) {
  return <div className="space-y-3 rounded-xl border border-border p-3">
    <div className="flex items-center justify-between gap-2"><span className="text-sm font-medium text-muted-ink">Transformation examples</span><Button type="button" size="sm" variant="outline" onClick={() => onChange([...examples, { contextTitle: "", originalText: "", transformedText: "", sortOrder: examples.length + 1 }])}><Plus className="h-3.5 w-3.5" /> Add example</Button></div>
    {examples.map((example, index) => <div key={`editorial-example-${index}`} className="rounded-lg border border-border bg-muted-surface p-3"><div className="grid gap-2 md:grid-cols-2"><input value={example.contextTitle} onChange={(event) => onChange(examples.map((item, itemIndex) => itemIndex === index ? { ...item, contextTitle: event.target.value } : item))} placeholder="Context or title (optional)" className="h-10 rounded-lg border border-border bg-white px-3 text-sm md:col-span-2" /><textarea value={example.originalText} onChange={(event) => onChange(examples.map((item, itemIndex) => itemIndex === index ? { ...item, originalText: event.target.value } : item))} placeholder="Original text" className="min-h-20 rounded-lg border border-border bg-white px-3 py-2 text-sm" /><textarea value={example.transformedText} onChange={(event) => onChange(examples.map((item, itemIndex) => itemIndex === index ? { ...item, transformedText: event.target.value } : item))} placeholder="Transformed text" className="min-h-20 rounded-lg border border-border bg-white px-3 py-2 text-sm" /></div><div className="mt-2 flex justify-end gap-1"><button type="button" disabled={index === 0} onClick={() => { const next = [...examples]; [next[index - 1], next[index]] = [next[index], next[index - 1]]; onChange(next); }} className="rounded border border-border p-1 disabled:opacity-30"><ArrowUp className="h-3 w-3" /></button><button type="button" disabled={index === examples.length - 1} onClick={() => { const next = [...examples]; [next[index], next[index + 1]] = [next[index + 1], next[index]]; onChange(next); }} className="rounded border border-border p-1 disabled:opacity-30"><ArrowDown className="h-3 w-3" /></button><button type="button" onClick={() => onChange(examples.filter((_, itemIndex) => itemIndex !== index))} className="rounded border border-red-200 p-1 text-red-600"><Trash2 className="h-3 w-3" /></button></div></div>)}
    {!examples.length ? <p className="text-xs text-muted-ink">No examples yet.</p> : null}
  </div>;
}

function EditorialFaqEditor({ faq, onChange }: { faq: FormEditorial["faq"]; onChange: (faq: FormEditorial["faq"]) => void }) {
  return <div className="space-y-3 rounded-xl border border-border p-3"><div className="flex items-center justify-between gap-2"><span className="text-sm font-medium text-muted-ink">FAQ</span><Button type="button" size="sm" variant="outline" onClick={() => onChange([...faq, { question: "", answer: "", sortOrder: faq.length + 1 }])}><Plus className="h-3.5 w-3.5" /> Add FAQ</Button></div>{faq.map((item, index) => <div key={`editorial-faq-${index}`} className="rounded-lg border border-border bg-muted-surface p-3"><input value={item.question} onChange={(event) => onChange(faq.map((faqItem, itemIndex) => itemIndex === index ? { ...faqItem, question: event.target.value } : faqItem))} placeholder="Question" className="h-10 w-full rounded-lg border border-border bg-white px-3 text-sm" /><textarea value={item.answer} onChange={(event) => onChange(faq.map((faqItem, itemIndex) => itemIndex === index ? { ...faqItem, answer: event.target.value } : faqItem))} placeholder="Answer" className="mt-2 min-h-20 w-full rounded-lg border border-border bg-white px-3 py-2 text-sm" /><div className="mt-2 flex justify-end gap-1"><button type="button" disabled={index === 0} onClick={() => { const next = [...faq]; [next[index - 1], next[index]] = [next[index], next[index - 1]]; onChange(next); }} className="rounded border border-border p-1 disabled:opacity-30"><ArrowUp className="h-3 w-3" /></button><button type="button" disabled={index === faq.length - 1} onClick={() => { const next = [...faq]; [next[index], next[index + 1]] = [next[index + 1], next[index]]; onChange(next); }} className="rounded border border-border p-1 disabled:opacity-30"><ArrowDown className="h-3 w-3" /></button><button type="button" onClick={() => onChange(faq.filter((_, itemIndex) => itemIndex !== index))} className="rounded border border-red-200 p-1 text-red-600"><Trash2 className="h-3 w-3" /></button></div></div>)}{!faq.length ? <p className="text-xs text-muted-ink">No FAQs yet.</p> : null}</div>;
}

interface TranslatorFormInitial {
  id: string;
  name: string;
  slug: string;
  title: string;
  subtitle: string;
  shortDescription: string;
  sourceLabel: string;
  targetLabel: string;
  iconName: string | null;
  promptSystem: string;
  promptInstructions: string;
  seoTitle: string | null;
  seoDescription: string | null;
  modelOverride: string | null;
  isActive: boolean;
  isFeatured: boolean;
  showModeSelector: boolean;
  showSwap: boolean;
  showExamples: boolean;
  sortOrder: number;
  featuredRank: number | null;
  featuredSource: "AUTO" | "MANUAL";
  shareImagePath: string | null;
  shareImageUpdatedAt: string | null;
  archivedAt: string | null;
  primaryCategoryId: string | null;
  categoryIds: string[];
  modes: FormMode[];
  examples: FormExample[];
  editorial: FormEditorial;
}

interface TranslatorFormProps {
  mode: "create" | "edit";
  initial?: TranslatorFormInitial;
  categories: Array<{ id: string; name: string }>;
  modelOptions: string[];
  autoFeaturedEnabled: boolean;
}

function createDefaultState(): Omit<
  TranslatorFormInitial,
  "id" | "archivedAt" | "featuredRank" | "featuredSource" | "shareImagePath" | "shareImageUpdatedAt"
> {
  return {
    name: "",
    slug: "",
    title: "",
    subtitle: "",
    shortDescription: "",
    sourceLabel: "Input",
    targetLabel: "Output",
    iconName: "",
    promptSystem: "You are an expert stylistic translator.",
    promptInstructions: "Preserve meaning while rewriting for the requested style.",
    seoTitle: "",
    seoDescription: "",
    modelOverride: "",
    isActive: true,
    isFeatured: false,
    showModeSelector: true,
    showSwap: true,
    showExamples: false,
    sortOrder: 10,
    primaryCategoryId: null,
    categoryIds: [],
    modes: [
      {
        key: "classic",
        label: "Classic",
        description: "Balanced default style.",
        instruction: "Use balanced style and clear wording.",
        sortOrder: 1,
      },
    ],
    examples: [
      {
        label: "Starter",
        value: "Rewrite this sentence in the translator style.",
        sortOrder: 1,
      },
    ],
    editorial: {
      about: "",
      whatItDoes: "",
      differenceDescription: "",
      bestUses: [],
      howToUse: [],
      tips: [],
      examples: [],
      faq: [],
    },
  };
}

export function TranslatorForm({
  mode,
  initial,
  categories,
  modelOptions,
  autoFeaturedEnabled,
}: TranslatorFormProps) {
  const router = useRouter();
  const { toast } = useToast();

  const defaults = useMemo(() => createDefaultState(), []);

  const [slugTouched, setSlugTouched] = useState(Boolean(initial?.slug));
  const [busy, setBusy] = useState(false);
  const [generatedEditorial, setGeneratedEditorial] = useState<Partial<FormEditorial> | null>(null);
  const [generatedSection, setGeneratedSection] = useState<string | null>(null);
  const [generatingSection, setGeneratingSection] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [shareImagePath, setShareImagePath] = useState<string | null>(initial?.shareImagePath || null);
  const [shareImageUpdatedAt, setShareImageUpdatedAt] = useState<string | null>(
    initial?.shareImageUpdatedAt || null,
  );

  const shareImagePreviewSrc = useMemo(() => {
    if (!shareImagePath) {
      return null;
    }

    const normalizedPath =
      /^https?:\/\//i.test(shareImagePath) || shareImagePath.startsWith("/")
        ? shareImagePath
        : `/${shareImagePath}`;

    if (!shareImageUpdatedAt) {
      return normalizedPath;
    }

    const separator = normalizedPath.includes("?") ? "&" : "?";
    return `${normalizedPath}${separator}v=${encodeURIComponent(shareImageUpdatedAt)}`;
  }, [shareImagePath, shareImageUpdatedAt]);

  const [form, setForm] = useState({
    name: initial?.name ?? defaults.name,
    slug: initial?.slug ?? defaults.slug,
    title: initial?.title ?? defaults.title,
    subtitle: initial?.subtitle ?? defaults.subtitle,
    shortDescription: initial?.shortDescription ?? defaults.shortDescription,
    sourceLabel: initial?.sourceLabel ?? defaults.sourceLabel,
    targetLabel: initial?.targetLabel ?? defaults.targetLabel,
    iconName: initial?.iconName ?? defaults.iconName,
    promptSystem: initial?.promptSystem ?? defaults.promptSystem,
    promptInstructions: initial?.promptInstructions ?? defaults.promptInstructions,
    seoTitle: initial?.seoTitle ?? defaults.seoTitle,
    seoDescription: initial?.seoDescription ?? defaults.seoDescription,
    modelOverride: initial?.modelOverride ?? defaults.modelOverride,
    isActive: initial?.isActive ?? defaults.isActive,
    isFeatured: initial?.isFeatured ?? defaults.isFeatured,
    showModeSelector: initial?.showModeSelector ?? defaults.showModeSelector,
    showSwap: initial?.showSwap ?? defaults.showSwap,
    showExamples: initial?.showExamples ?? defaults.showExamples,
    sortOrder: initial?.sortOrder ?? defaults.sortOrder,
    primaryCategoryId: initial?.primaryCategoryId ?? defaults.primaryCategoryId,
    categoryIds: initial?.categoryIds?.length ? initial.categoryIds : defaults.categoryIds,
    modes: initial?.modes?.length ? initial.modes : defaults.modes,
    examples: initial?.examples?.length ? initial.examples : defaults.examples,
    editorial: initial?.editorial ?? defaults.editorial,
  });

  function setField<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function updateMode(index: number, patch: Partial<FormMode>) {
    setForm((current) => ({
      ...current,
      modes: current.modes.map((modeItem, idx) =>
        idx === index ? { ...modeItem, ...patch } : modeItem,
      ),
    }));
  }

  function updateExample(index: number, patch: Partial<FormExample>) {
    setForm((current) => ({
      ...current,
      examples: current.examples.map((exampleItem, idx) =>
        idx === index ? { ...exampleItem, ...patch } : exampleItem,
      ),
    }));
  }

  function toggleCategory(categoryId: string, checked: boolean) {
    setForm((current) => {
      const nextIds = checked
        ? Array.from(new Set([...current.categoryIds, categoryId]))
        : current.categoryIds.filter((id) => id !== categoryId);

      return {
        ...current,
        categoryIds: nextIds,
        primaryCategoryId:
          current.primaryCategoryId && nextIds.includes(current.primaryCategoryId)
            ? current.primaryCategoryId
            : nextIds[0] || null,
      };
    });
  }

  async function submit(candidate = form) {
    setBusy(true);

    const payload = {
      ...candidate,
      slug: slugify(candidate.slug || candidate.name),
      modes: candidate.modes
        .filter((modeItem) => modeItem.label.trim() && modeItem.instruction.trim())
        .map((modeItem, index) => ({
          ...modeItem,
          key: slugify(modeItem.key || modeItem.label),
          sortOrder: Number(modeItem.sortOrder) || index + 1,
        })),
      examples: candidate.examples
        .filter((exampleItem) => exampleItem.label.trim() && exampleItem.value.trim())
        .map((exampleItem, index) => ({
          ...exampleItem,
          sortOrder: Number(exampleItem.sortOrder) || index + 1,
        })),
      editorial: {
        about: candidate.editorial.about,
        whatItDoes: candidate.editorial.whatItDoes,
        differenceDescription: candidate.editorial.differenceDescription,
        lists: [
          ...candidate.editorial.bestUses.map((content, index) => ({ kind: "BEST_USE", content, sortOrder: index + 1 })),
          ...candidate.editorial.howToUse.map((content, index) => ({ kind: "HOW_TO_USE", content, sortOrder: index + 1 })),
          ...candidate.editorial.tips.map((content, index) => ({ kind: "TIP", content, sortOrder: index + 1 })),
        ].filter((item) => item.content.trim()),
        examples: candidate.editorial.examples.filter((item) => item.originalText.trim() && item.transformedText.trim()),
        faq: candidate.editorial.faq.filter((item) => item.question.trim() && item.answer.trim()),
      },
      sortOrder: Number(candidate.sortOrder) || 0,
      primaryCategoryId: candidate.primaryCategoryId || null,
    };

    const endpoint = mode === "create" ? "/api/admin/translators" : `/api/admin/translators/${initial?.id}`;
    const method = mode === "create" ? "POST" : "PATCH";

    const response = await fetch(endpoint, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const result = await response.json();
    setBusy(false);

    if (!response.ok || !result.ok) {
      toast({
        title: "Save failed",
        description: result?.error?.message || "Please review form values and try again.",
        variant: "error",
      });
      return;
    }

    toast({ title: "Translator saved", description: "Changes are now live in your dashboard." });

    if (mode === "create") {
      router.push(`/admin/translators/${result.translator.id}`);
    } else {
      router.refresh();
    }
  }

  async function duplicate() {
    if (!initial?.id) return;

    setBusy(true);
    const response = await fetch(`/api/admin/translators/${initial.id}/duplicate`, {
      method: "POST",
    });
    const result = await response.json();
    setBusy(false);

    if (!response.ok || !result.ok) {
      toast({ title: "Duplicate failed", description: "Please try again.", variant: "error" });
      return;
    }

    toast({ title: "Translator duplicated" });
    router.push(`/admin/translators/${result.translator.id}`);
  }

  async function deleteForever() {
    if (!initial?.id) return;

    setBusy(true);
    const response = await fetch(`/api/admin/translators/${initial.id}?mode=hard`, {
      method: "DELETE",
    });
    const result = await response.json();
    setBusy(false);

    if (!response.ok || !result.ok) {
      toast({ title: "Delete failed", description: "Please try again.", variant: "error" });
      return;
    }

    toast({ title: "Translator deleted" });
    router.push("/admin/translators");
  }

  async function archiveToggle() {
    if (!initial?.id) return;

    const modeValue = initial.archivedAt ? "unarchive" : "archive";
    setBusy(true);
    const response = await fetch(`/api/admin/translators/${initial.id}?mode=${modeValue}`, {
      method: "DELETE",
    });
    const result = await response.json();
    setBusy(false);

    if (!response.ok || !result.ok) {
      toast({ title: "Action failed", description: "Please try again.", variant: "error" });
      return;
    }

    toast({ title: initial.archivedAt ? "Translator restored" : "Translator archived" });
    router.refresh();
  }

  async function regenerateShareImage() {
    if (!initial?.id) return;

    setBusy(true);
    const response = await fetch(`/api/admin/translators/${initial.id}/regenerate-share-image`, {
      method: "POST",
    });
    const result = await response.json();
    setBusy(false);

    if (!response.ok || !result.ok) {
      toast({
        title: "Regeneration failed",
        description: result?.error?.message || "Unable to regenerate share image.",
        variant: "error",
      });
      return;
    }

    if (!result.shareImagePath || !result.shareImageUrl || !result.shareImageUpdatedAt) {
      toast({
        title: "Regeneration failed",
        description: "Share image generation did not return a usable image.",
        variant: "error",
      });
      return;
    }

    setShareImagePath(result.shareImagePath);
    setShareImageUpdatedAt(result.shareImageUpdatedAt);
    toast({
      title: "Share image regenerated",
      description: "Pinterest share image is up to date.",
    });
    router.refresh();
  }

  function setGeneratedValue(section: string, value: unknown) {
    setGeneratedEditorial((current) => ({ ...(current || {}), [section]: value }));
  }

  async function generateEditorial(section: string) {
    if (!initial?.id) return;
    setGeneratingSection(section);
    setBusy(true);
    const response = await fetch(`/api/admin/translators/${initial.id}/editorial`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ section }),
    });
    const result = await response.json();
    setBusy(false);
    setGeneratingSection(null);
    if (!response.ok || !result.ok) {
      toast({ title: "Editorial generation failed", description: result?.error?.message || "Please try again.", variant: "error" });
      return;
    }
    const value = section === "full" ? result.editorial : result.value;
    setGeneratedSection(section);
    if (section === "full") {
      setGeneratedEditorial({
        about: value.about,
        whatItDoes: value.whatItDoes,
        differenceDescription: value.differenceDescription,
        bestUses: value.bestUses,
        howToUse: value.howToUse,
        tips: value.tips,
        examples: value.examples.map((item: { contextTitle?: string; originalText: string; transformedText: string }, index: number) => ({ ...item, contextTitle: item.contextTitle || "", sortOrder: index + 1 })),
        faq: value.faq.map((item: { question: string; answer: string }, index: number) => ({ ...item, sortOrder: index + 1 })),
      });
    } else if (["examples", "faq"].includes(section)) {
      setGeneratedValue(section, value.map((item: Record<string, string>, index: number) => ({ ...item, contextTitle: item.contextTitle || "", sortOrder: index + 1 })));
    } else if (["bestUses", "howToUse", "tips"].includes(section)) {
      setGeneratedValue(section, value);
    } else {
      setGeneratedValue(section, value);
    }
    toast({ title: "Draft generated", description: "Review, edit, then approve and publish it." });
  }

  async function approveGenerated() {
    if (!generatedEditorial) return;
    const nextForm = { ...form, editorial: { ...form.editorial, ...generatedEditorial } };
    setForm(nextForm);
    await submit(nextForm);
    setGeneratedEditorial(null);
    setGeneratedSection(null);
  }

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-border bg-white p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-display text-2xl font-semibold text-ink">Editorial Content</h2>
            <p className="mt-1 text-sm text-muted-ink">Edit published copy below. AI drafts stay separate until you approve them.</p>
          </div>
          {mode === "edit" ? <Button type="button" variant="outline" onClick={() => void generateEditorial("full")} disabled={busy}><Copy className="h-3.5 w-3.5" />{generatingSection === "full" ? "Generating..." : "Regenerate full pack"}</Button> : null}
        </div>
        <div className="mt-4 space-y-3">
          {(["about", "whatItDoes", "differenceDescription"] as const).map((key) => <details key={key} open className="rounded-xl border border-border p-4"><summary className="flex cursor-pointer list-none items-center justify-between gap-3 font-medium text-ink"><span>{key === "about" ? "About this translator" : key === "whatItDoes" ? "What it does" : "What makes this twist different"}</span>{mode === "edit" ? <Button type="button" size="sm" variant="outline" onClick={(event) => { event.preventDefault(); void generateEditorial(key); }} disabled={busy}>{generatingSection === key ? "Generating..." : "Regenerate"}</Button> : null}</summary><textarea value={form.editorial[key]} onChange={(event) => setField("editorial", { ...form.editorial, [key]: event.target.value })} className="mt-3 min-h-24 w-full rounded-xl border border-border px-3 py-2 text-sm" /></details>)}
          {(["bestUses", "howToUse", "tips"] as const).map((key) => <details key={key} className="rounded-xl border border-border p-4"><summary className="flex cursor-pointer list-none items-center justify-between gap-3 font-medium text-ink"><span>{key === "bestUses" ? "Best uses" : key === "howToUse" ? "How to use" : "Tips for better results"}</span>{mode === "edit" ? <Button type="button" size="sm" variant="outline" onClick={(event) => { event.preventDefault(); void generateEditorial(key); }} disabled={busy}>{generatingSection === key ? "Generating..." : "Regenerate"}</Button> : null}</summary><div className="mt-3"><EditorialListEditor label="Items" items={form.editorial[key]} onChange={(items) => setField("editorial", { ...form.editorial, [key]: items })} /></div></details>)}
          <details className="rounded-xl border border-border p-4"><summary className="flex cursor-pointer list-none items-center justify-between gap-3 font-medium text-ink"><span>Transformation examples</span>{mode === "edit" ? <Button type="button" size="sm" variant="outline" onClick={(event) => { event.preventDefault(); void generateEditorial("examples"); }} disabled={busy}>{generatingSection === "examples" ? "Generating..." : "Regenerate"}</Button> : null}</summary><div className="mt-3"><EditorialExamplesEditor examples={form.editorial.examples} onChange={(examples) => setField("editorial", { ...form.editorial, examples })} /></div></details>
          <details className="rounded-xl border border-border p-4"><summary className="flex cursor-pointer list-none items-center justify-between gap-3 font-medium text-ink"><span>FAQ</span>{mode === "edit" ? <Button type="button" size="sm" variant="outline" onClick={(event) => { event.preventDefault(); void generateEditorial("faq"); }} disabled={busy}>{generatingSection === "faq" ? "Generating..." : "Regenerate"}</Button> : null}</summary><div className="mt-3"><EditorialFaqEditor faq={form.editorial.faq} onChange={(faq) => setField("editorial", { ...form.editorial, faq })} /></div></details>
        </div>
        {generatedEditorial ? <div className="mt-5 rounded-2xl border-2 border-brand-200 bg-brand-50 p-4"><div className="flex flex-wrap items-center justify-between gap-2"><div><p className="text-xs font-semibold uppercase tracking-[0.14em] text-brand-700">Generated draft{generatedSection ? ` · ${generatedSection}` : ""}</p><p className="mt-1 text-sm text-muted-ink">This is not published yet. Review and edit it, then approve when ready.</p></div><div className="flex gap-2"><Button type="button" size="sm" variant="outline" onClick={() => { setGeneratedEditorial(null); setGeneratedSection(null); }}>Discard</Button><Button type="button" size="sm" onClick={() => void approveGenerated()} disabled={busy}>Approve & publish</Button></div></div><div className="mt-4 space-y-3">{(["about", "whatItDoes", "differenceDescription"] as const).filter((key) => generatedEditorial[key] !== undefined).map((key) => <label key={key} className="block text-sm"><span className="font-medium text-ink">{key === "about" ? "About" : key === "whatItDoes" ? "What it does" : "Difference"}</span><textarea value={generatedEditorial[key] as string} onChange={(event) => setGeneratedValue(key, event.target.value)} className="mt-1 min-h-20 w-full rounded-lg border border-brand-200 bg-white px-3 py-2" /></label>)}{(["bestUses", "howToUse", "tips"] as const).filter((key) => generatedEditorial[key] !== undefined).map((key) => <EditorialListEditor key={key} label={key === "bestUses" ? "Best uses" : key === "howToUse" ? "How to use" : "Tips"} items={generatedEditorial[key] as string[]} onChange={(items) => setGeneratedValue(key, items)} />)}{generatedEditorial.examples ? <EditorialExamplesEditor examples={generatedEditorial.examples} onChange={(examples) => setGeneratedValue("examples", examples)} /> : null}{generatedEditorial.faq ? <EditorialFaqEditor faq={generatedEditorial.faq} onChange={(faq) => setGeneratedValue("faq", faq)} /> : null}</div></div> : null}
      </section>

      <section className="rounded-2xl border border-border bg-white p-6">
        <h2 className="font-display text-2xl font-semibold text-ink">Basic Info</h2>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <label className="space-y-1 text-sm">
            <span className="font-medium text-muted-ink">Name</span>
            <input
              value={form.name}
              onChange={(event) => {
                const value = event.target.value;
                setField("name", value);
                if (!slugTouched) {
                  setField("slug", slugify(value));
                }
              }}
              className="h-11 w-full rounded-xl border border-border px-3"
            />
          </label>
          <label className="space-y-1 text-sm">
            <span className="font-medium text-muted-ink">Slug</span>
            <input
              value={form.slug}
              onChange={(event) => {
                setSlugTouched(true);
                setField("slug", slugify(event.target.value));
              }}
              className="h-11 w-full rounded-xl border border-border px-3"
            />
          </label>
          <label className="space-y-1 text-sm md:col-span-2">
            <span className="font-medium text-muted-ink">Public Title</span>
            <input
              value={form.title}
              onChange={(event) => setField("title", event.target.value)}
              className="h-11 w-full rounded-xl border border-border px-3"
            />
          </label>
          <label className="space-y-1 text-sm md:col-span-2">
            <span className="font-medium text-muted-ink">Public Subtitle</span>
            <textarea
              value={form.subtitle}
              onChange={(event) => setField("subtitle", event.target.value)}
              className="min-h-20 w-full rounded-xl border border-border px-3 py-2"
            />
          </label>
          <label className="space-y-1 text-sm md:col-span-2">
            <span className="font-medium text-muted-ink">Short Description</span>
            <textarea
              value={form.shortDescription}
              onChange={(event) => setField("shortDescription", event.target.value)}
              className="min-h-20 w-full rounded-xl border border-border px-3 py-2"
            />
          </label>
        </div>
      </section>

      <section className="rounded-2xl border border-border bg-white p-6">
        <h2 className="font-display text-2xl font-semibold text-ink">Categories & Labels</h2>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <label className="space-y-1 text-sm">
            <span className="font-medium text-muted-ink">Source Label</span>
            <input
              value={form.sourceLabel}
              onChange={(event) => setField("sourceLabel", event.target.value)}
              className="h-11 w-full rounded-xl border border-border px-3"
            />
          </label>
          <label className="space-y-1 text-sm">
            <span className="font-medium text-muted-ink">Target Label</span>
            <input
              value={form.targetLabel}
              onChange={(event) => setField("targetLabel", event.target.value)}
              className="h-11 w-full rounded-xl border border-border px-3"
            />
          </label>
          <label className="space-y-1 text-sm md:col-span-2">
            <span className="font-medium text-muted-ink">Icon Key (optional)</span>
            <input
              value={form.iconName || ""}
              onChange={(event) => setField("iconName", event.target.value)}
              className="h-11 w-full rounded-xl border border-border px-3"
            />
          </label>

          <div className="space-y-2 rounded-xl border border-border p-3 md:col-span-2">
            <p className="text-sm font-medium text-muted-ink">Category Assignment</p>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {categories.map((category) => (
                <label
                  key={category.id}
                  className="flex items-center gap-2 rounded-lg border border-border bg-muted-surface px-3 py-2 text-sm"
                >
                  <input
                    type="checkbox"
                    checked={form.categoryIds.includes(category.id)}
                    onChange={(event) => toggleCategory(category.id, event.target.checked)}
                  />
                  {category.name}
                </label>
              ))}
            </div>
          </div>

          <label className="space-y-1 text-sm md:col-span-2">
            <span className="font-medium text-muted-ink">Primary Category</span>
            <select
              value={form.primaryCategoryId || ""}
              onChange={(event) => setField("primaryCategoryId", event.target.value || null)}
              className="h-11 w-full rounded-xl border border-border px-3"
            >
              <option value="">Choose primary category</option>
              {categories
                .filter((category) => form.categoryIds.includes(category.id))
                .map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
            </select>
          </label>
        </div>
      </section>

      <section className="rounded-2xl border border-border bg-white p-6">
        <h2 className="font-display text-2xl font-semibold text-ink">AI Prompting & Model</h2>
        <div className="mt-4 space-y-4">
          <label className="space-y-1 text-sm">
            <span className="font-medium text-muted-ink">System Prompt</span>
            <textarea
              value={form.promptSystem}
              onChange={(event) => setField("promptSystem", event.target.value)}
              className="min-h-28 w-full rounded-xl border border-border px-3 py-2"
            />
          </label>
          <label className="space-y-1 text-sm">
            <span className="font-medium text-muted-ink">Prompt Instructions</span>
            <textarea
              value={form.promptInstructions}
              onChange={(event) => setField("promptInstructions", event.target.value)}
              className="min-h-28 w-full rounded-xl border border-border px-3 py-2"
            />
          </label>
          <label className="space-y-1 text-sm">
            <span className="font-medium text-muted-ink">Model Override (optional)</span>
            <select
              value={form.modelOverride || ""}
              onChange={(event) => setField("modelOverride", event.target.value)}
              className="h-11 w-full rounded-xl border border-border px-3"
            >
              <option value="">Use global default model</option>
              {modelOptions.map((model) => (
                <option key={model} value={model}>
                  {model}
                </option>
              ))}
            </select>
          </label>
        </div>
      </section>

      <section className="rounded-2xl border border-border bg-white p-6">
        <h2 className="font-display text-2xl font-semibold text-ink">Public UX Controls</h2>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <label className="flex items-center gap-2 rounded-xl border border-border p-3 text-sm font-medium text-muted-ink">
            <input
              type="checkbox"
              checked={form.showModeSelector}
              onChange={(event) => setField("showModeSelector", event.target.checked)}
            />
            Show mode selector publicly
          </label>
          <label className="flex items-center gap-2 rounded-xl border border-border p-3 text-sm font-medium text-muted-ink">
            <input
              type="checkbox"
              checked={form.showSwap}
              onChange={(event) => setField("showSwap", event.target.checked)}
            />
            Show swap action publicly
          </label>
          <label className="flex items-center gap-2 rounded-xl border border-border p-3 text-sm font-medium text-muted-ink md:col-span-2">
            <input
              type="checkbox"
              checked={form.showExamples}
              onChange={(event) => setField("showExamples", event.target.checked)}
            />
            Show example prompt chips publicly
          </label>
        </div>
      </section>

      <section className="rounded-2xl border border-border bg-white p-6">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-display text-2xl font-semibold text-ink">Modes & Examples</h2>
        </div>

        <div className="space-y-3">
          <p className="text-sm font-medium text-muted-ink">Translation Modes</p>
          {form.modes.map((modeItem, index) => (
            <div key={`mode-${index}`} className="rounded-xl border border-border bg-muted-surface p-3">
              <div className="grid gap-3 md:grid-cols-2">
                <input
                  value={modeItem.label}
                  onChange={(event) => updateMode(index, { label: event.target.value })}
                  placeholder="Mode label"
                  className="h-10 rounded-lg border border-border px-3"
                />
                <input
                  value={modeItem.key}
                  onChange={(event) => updateMode(index, { key: slugify(event.target.value) })}
                  placeholder="mode-key"
                  className="h-10 rounded-lg border border-border px-3"
                />
                <input
                  value={modeItem.description || ""}
                  onChange={(event) => updateMode(index, { description: event.target.value })}
                  placeholder="Mode description"
                  className="h-10 rounded-lg border border-border px-3 md:col-span-2"
                />
                <textarea
                  value={modeItem.instruction}
                  onChange={(event) => updateMode(index, { instruction: event.target.value })}
                  placeholder="Instruction"
                  className="min-h-20 rounded-lg border border-border px-3 py-2 md:col-span-2"
                />
                <input
                  type="number"
                  value={modeItem.sortOrder}
                  onChange={(event) => updateMode(index, { sortOrder: Number(event.target.value) || 0 })}
                  className="h-10 rounded-lg border border-border px-3"
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={() =>
                    setForm((current) => ({
                      ...current,
                      modes: current.modes.filter((_, idx) => idx !== index),
                    }))
                  }
                  disabled={form.modes.length <= 1}
                >
                  <Trash2 className="h-4 w-4" />
                  Remove mode
                </Button>
              </div>
            </div>
          ))}

          <Button
            type="button"
            variant="outline"
            onClick={() =>
              setForm((current) => ({
                ...current,
                modes: [
                  ...current.modes,
                  {
                    key: `mode-${current.modes.length + 1}`,
                    label: "New Mode",
                    description: "",
                    instruction: "Provide style instruction.",
                    sortOrder: current.modes.length + 1,
                  },
                ],
              }))
            }
          >
            <Plus className="h-4 w-4" />
            Add mode
          </Button>
        </div>

        <div className="mt-8 space-y-3">
          <p className="text-sm font-medium text-muted-ink">Example Inputs</p>
          {form.examples.map((exampleItem, index) => (
            <div key={`example-${index}`} className="rounded-xl border border-border bg-muted-surface p-3">
              <div className="grid gap-3 md:grid-cols-2">
                <input
                  value={exampleItem.label}
                  onChange={(event) => updateExample(index, { label: event.target.value })}
                  placeholder="Example label"
                  className="h-10 rounded-lg border border-border px-3"
                />
                <input
                  type="number"
                  value={exampleItem.sortOrder}
                  onChange={(event) =>
                    updateExample(index, { sortOrder: Number(event.target.value) || 0 })
                  }
                  className="h-10 rounded-lg border border-border px-3"
                />
                <textarea
                  value={exampleItem.value}
                  onChange={(event) => updateExample(index, { value: event.target.value })}
                  placeholder="Example input"
                  className="min-h-20 rounded-lg border border-border px-3 py-2 md:col-span-2"
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={() =>
                    setForm((current) => ({
                      ...current,
                      examples: current.examples.filter((_, idx) => idx !== index),
                    }))
                  }
                  disabled={form.examples.length <= 1}
                >
                  <Trash2 className="h-4 w-4" />
                  Remove example
                </Button>
              </div>
            </div>
          ))}

          <Button
            type="button"
            variant="outline"
            onClick={() =>
              setForm((current) => ({
                ...current,
                examples: [
                  ...current.examples,
                  {
                    label: "New Example",
                    value: "Type sample input...",
                    sortOrder: current.examples.length + 1,
                  },
                ],
              }))
            }
          >
            <Plus className="h-4 w-4" />
            Add example
          </Button>
        </div>
      </section>

      <section className="rounded-2xl border border-border bg-white p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-display text-2xl font-semibold text-ink">Pinterest Share Image</h2>
            <p className="mt-1 text-sm text-muted-ink">
              Stored, pre-generated image used for Pinterest sharing.
            </p>
            {shareImageUpdatedAt ? (
              <p className="mt-1 text-xs text-muted-ink">Last generated: {shareImageUpdatedAt}</p>
            ) : null}
          </div>
          {mode === "edit" ? (
            <Button type="button" variant="outline" onClick={() => void regenerateShareImage()} disabled={busy}>
              Regenerate share image
            </Button>
          ) : null}
        </div>

        <div className="mt-4 rounded-xl border border-border bg-muted-surface p-3">
          {shareImagePreviewSrc ? (
            <div className="space-y-3">
              <Image
                src={shareImagePreviewSrc}
                alt="Stored Pinterest share preview"
                className="w-full max-w-xs rounded-lg border border-border bg-white object-cover"
                width={300}
                height={450}
                loading="lazy"
                unoptimized
              />
              <p className="text-xs text-muted-ink">{shareImagePath}</p>
            </div>
          ) : (
            <p className="text-sm text-muted-ink">
              No stored share image yet. It will be generated automatically when the translator is saved.
            </p>
          )}
        </div>
      </section>

      <section className="rounded-2xl border border-border bg-white p-6">
        <h2 className="font-display text-2xl font-semibold text-ink">SEO & Visibility</h2>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <label className="space-y-1 text-sm md:col-span-2">
            <span className="font-medium text-muted-ink">SEO Title</span>
            <input
              value={form.seoTitle || ""}
              onChange={(event) => setField("seoTitle", event.target.value)}
              className="h-11 w-full rounded-xl border border-border px-3"
            />
          </label>
          <label className="space-y-1 text-sm md:col-span-2">
            <span className="font-medium text-muted-ink">SEO Description</span>
            <textarea
              value={form.seoDescription || ""}
              onChange={(event) => setField("seoDescription", event.target.value)}
              className="min-h-20 w-full rounded-xl border border-border px-3 py-2"
            />
          </label>

          <label className="flex items-center gap-2 rounded-xl border border-border p-3 text-sm font-medium text-muted-ink">
            <input
              type="checkbox"
              checked={form.isActive}
              onChange={(event) => setField("isActive", event.target.checked)}
            />
            Active
          </label>

          <label className="flex items-center gap-2 rounded-xl border border-border p-3 text-sm font-medium text-muted-ink">
            <input
              type="checkbox"
              checked={form.isFeatured}
              disabled={autoFeaturedEnabled}
              onChange={(event) => setField("isFeatured", event.target.checked)}
            />
            Featured
          </label>

          {autoFeaturedEnabled ? (
            <p className="text-xs text-muted-ink md:col-span-2">
              Auto-featured mode is enabled globally. Top 3 featured slots are assigned by performance.
            </p>
          ) : null}

          <label className="space-y-1 text-sm">
            <span className="font-medium text-muted-ink">Sort Order</span>
            <input
              type="number"
              value={form.sortOrder}
              onChange={(event) => setField("sortOrder", Number(event.target.value) || 0)}
              className="h-11 w-full rounded-xl border border-border px-3"
            />
          </label>
        </div>
      </section>

      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" onClick={() => void submit()} disabled={busy}>
          {busy ? "Saving..." : mode === "create" ? "Create Translator" : "Save Changes"}
        </Button>

        {mode === "edit" ? (
          <>
            <Button type="button" variant="outline" onClick={() => void duplicate()} disabled={busy}>
              <Copy className="h-4 w-4" />
              Duplicate
            </Button>
            <Button type="button" variant="outline" onClick={() => void archiveToggle()} disabled={busy}>
              {initial?.archivedAt ? "Unarchive" : "Archive"}
            </Button>
            <Button
              type="button"
              variant="outline"
              className="border-red-300 text-red-700 hover:bg-red-50"
              onClick={() => setConfirmDelete(true)}
              disabled={busy}
            >
              <Trash2 className="h-4 w-4" />
              Delete Forever
            </Button>
          </>
        ) : null}
      </div>

      <ConfirmDialog
        open={confirmDelete}
        title="Permanently delete translator?"
        description="This action cannot be undone and removes related modes, examples, and logs."
        confirmLabel="Delete forever"
        onCancel={() => setConfirmDelete(false)}
        onConfirm={() => {
          setConfirmDelete(false);
          void deleteForever();
        }}
        variant="danger"
      />
    </div>
  );
}
