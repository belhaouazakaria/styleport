"use client";

import { GrowthCreativeArchetype, GrowthCreativeDestinationKind, GrowthExperimentDimension } from "@prisma/client";
import { Check, ChevronDown, FlaskConical, Search, Sparkles } from "lucide-react";
import { useEffect, useId, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

const archetypeOptions = [
  { value: GrowthCreativeArchetype.MINIMAL_STATEMENT, label: "Minimal poster", description: "Fast deterministic branded creative." },
  { value: GrowthCreativeArchetype.BEFORE_AFTER, label: "Before → after", description: "AI-assisted conversion creative showing a real transformation." },
];

const experimentDimensions = [
  { value: GrowthExperimentDimension.ARCHETYPE, label: "Creative format", help: "Compare two creative archetypes." },
  { value: GrowthExperimentDimension.TEMPLATE, label: "Template", help: "Compare two controlled template IDs." },
  { value: GrowthExperimentDimension.HEADLINE_PATTERN, label: "Headline approach", help: "Compare two headline pattern IDs." },
  { value: GrowthExperimentDimension.CTA_PATTERN, label: "Call to action", help: "Compare two CTA pattern IDs." },
  { value: GrowthExperimentDimension.VISUAL_TREATMENT, label: "Visual treatment", help: "Compare two visual treatment IDs." },
];

const experimentVariantOptions: Record<GrowthExperimentDimension, Array<{ label: string; value: string }>> = {
  [GrowthExperimentDimension.ARCHETYPE]: [
    { label: "Minimal poster", value: "MINIMAL_STATEMENT" },
    { label: "Before → after", value: "BEFORE_AFTER" },
  ],
  [GrowthExperimentDimension.TEMPLATE]: [
    { label: "Minimal poster · layout 1", value: "minimal-poster-v2-layout-1" },
    { label: "Minimal poster · layout 2", value: "minimal-poster-v2-layout-2" },
    { label: "Minimal poster · layout 3", value: "minimal-poster-v2-layout-3" },
    { label: "Before → after · Editorial split", value: "before-after-ai-v1-editorial-split" },
    { label: "Before → after · Chat focus", value: "before-after-ai-v1-chat-focus" },
    { label: "Before → after · Bold poster", value: "before-after-ai-v1-bold-poster" },
    { label: "Before → after · Collage", value: "before-after-ai-v1-collage" },
    { label: "Before → after · Magazine frame", value: "before-after-ai-v1-magazine-frame" },
  ],
  [GrowthExperimentDimension.HEADLINE_PATTERN]: [
    { label: "Single statement", value: "single-statement-v2" },
    { label: "Transformation proof", value: "transformation-proof" },
  ],
  [GrowthExperimentDimension.CTA_PATTERN]: [
    { label: "See full destination", value: "see-full-destination" },
    { label: "See the transformation", value: "see-the-transformation" },
  ],
  [GrowthExperimentDimension.VISUAL_TREATMENT]: [
    { label: "Minimal brand poster", value: "minimal-brand-poster" },
    { label: "Transformation cards", value: "transformation-cards" },
  ],
};

const fieldClass = "mt-2 min-h-11 w-full rounded-xl border border-border bg-white px-3 py-2.5 text-sm text-ink outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/15";

async function post(url: string, body: unknown) {
  const response = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(payload?.error?.message || "Request failed.");
  return payload;
}

interface TranslatorOption { id: string; name: string; slug: string }

function TranslatorTargetPicker({ initialOptions, targetId, onSelect }: { initialOptions: TranslatorOption[]; targetId: string; onSelect: (id: string) => void }) {
  const listId = useId();
  const initialSelection = initialOptions.find((item) => item.id === targetId) || null;
  const [query, setQuery] = useState(initialSelection?.name || "");
  const [options, setOptions] = useState(initialOptions);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const selected = options.find((item) => item.id === targetId) || initialSelection;

  useEffect(() => {
    const normalized = query.trim();
    if (!open || normalized.length < 2) {
      if (!normalized) setOptions(initialOptions);
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setLoading(true);
      try {
        const response = await fetch(`/api/admin/translators?status=active&q=${encodeURIComponent(normalized)}`, { signal: controller.signal });
        const payload = await response.json() as { ok?: boolean; translators?: TranslatorOption[] };
        if (!response.ok || !payload.ok) throw new Error("Search unavailable");
        const matches = (payload.translators || []).map(({ id, name, slug }) => ({ id, name, slug })).sort((left, right) => left.name.localeCompare(right.name));
        setOptions(matches);
      } catch (error) {
        if (!(error instanceof DOMException && error.name === "AbortError")) setOptions(initialOptions.filter((item) => item.id === targetId));
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 250);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [initialOptions, open, query, targetId]);

  return <div className="relative max-w-2xl">
    <label htmlFor={`${listId}-input`} className="block text-sm font-extrabold text-ink">2. Find an active Translator</label>
    <p className="mt-1 text-xs leading-5 text-muted-ink">Search by name or slug. Results include every active, non-archived Translator.</p>
    <div className="relative mt-2"><Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-ink" aria-hidden="true" /><input id={`${listId}-input`} role="combobox" aria-autocomplete="list" aria-expanded={open} aria-controls={`${listId}-list`} autoComplete="off" value={query} onFocus={() => setOpen(true)} onBlur={() => window.setTimeout(() => setOpen(false), 150)} onChange={(event) => { setQuery(event.target.value); onSelect(""); setOpen(true); }} placeholder="Search active Translators…" className={`${fieldClass} mt-0 pl-10 pr-12`} />{loading ? <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs font-bold text-brand-700">Searching…</span> : null}</div>
    {open ? <div id={`${listId}-list`} role="listbox" className="absolute z-30 mt-2 max-h-72 w-full overflow-y-auto rounded-2xl border border-border bg-white p-1.5 shadow-[0_20px_55px_-28px_rgba(15,23,42,0.4)]">{options.length ? options.map((item) => <button key={item.id} type="button" role="option" aria-selected={item.id === targetId} onMouseDown={(event) => event.preventDefault()} onClick={() => { onSelect(item.id); setQuery(item.name); setOpen(false); }} className="flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-left transition hover:bg-brand-50"><span className="min-w-0"><span className="block truncate text-sm font-bold text-ink">{item.name}</span><span className="block truncate text-xs text-muted-ink">/translators/{item.slug}</span></span>{item.id === targetId ? <Check className="h-4 w-4 shrink-0 text-brand-600" aria-hidden="true" /> : null}</button>) : <p className="px-3 py-5 text-center text-sm text-muted-ink">{query.trim().length < 2 ? "Type at least two characters to search." : loading ? "Searching active Translators…" : "No active Translators matched that search."}</p>}</div> : null}
    {selected && targetId ? <div className="mt-3 flex items-center gap-3 rounded-xl border border-brand-200 bg-brand-50 px-3.5 py-3"><span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-500 text-white"><Check className="h-4 w-4" aria-hidden="true" /></span><span className="min-w-0"><span className="block text-xs font-bold uppercase tracking-wide text-brand-800">Selected Translator</span><span className="block truncate text-sm font-bold text-ink">{selected.name} <span className="font-normal text-muted-ink">· /{selected.slug}</span></span></span></div> : <p className="mt-2 text-xs font-semibold text-amber-800">Choose a Translator from the search results to continue.</p>}
  </div>;
}

export function CreativeGenerationForm({ translators, ideas, accounts, experiments, aiImageEnabled = false }: {
  translators: TranslatorOption[];
  ideas: Array<{ id: string; title: string }>;
  accounts: Array<{ id: string; label: string }>;
  experiments: Array<{ id: string; hypothesis: string; variants: Array<{ key: string; label: string }> }>;
  aiImageEnabled?: boolean;
}) {
  const router = useRouter();
  const [kind, setKind] = useState<GrowthCreativeDestinationKind>(GrowthCreativeDestinationKind.TRANSLATOR);
  const [targetId, setTargetId] = useState(translators[0]?.id || "");
  const [archetype, setArchetype] = useState<GrowthCreativeArchetype>(GrowthCreativeArchetype.MINIMAL_STATEMENT);
  const [useAiExample, setUseAiExample] = useState(true);
  const [accountId, setAccountId] = useState("");
  const [experimentId, setExperimentId] = useState("");
  const selectedExperiment = experiments.find((item) => item.id === experimentId);
  const [variantKey, setVariantKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const targets = useMemo(() => kind === GrowthCreativeDestinationKind.TRANSLATOR ? translators : ideas, [kind, translators, ideas]);

  function chooseKind(next: GrowthCreativeDestinationKind) {
    setKind(next);
    setTargetId((next === GrowthCreativeDestinationKind.TRANSLATOR ? translators : ideas)[0]?.id || "");
    if (next === GrowthCreativeDestinationKind.IDEA && archetype === GrowthCreativeArchetype.BEFORE_AFTER) setArchetype(GrowthCreativeArchetype.MINIMAL_STATEMENT);
  }

  return <form className="overflow-hidden rounded-[1.75rem] border border-brand-200 bg-white shadow-[0_24px_70px_-48px_rgba(15,23,42,0.55)]" onSubmit={async (event) => {
    event.preventDefault(); setBusy(true); setMessage("");
    try {
      await post("/api/admin/growth/creative/generate", { targetKind: kind, targetId, archetype, ...(archetype === GrowthCreativeArchetype.BEFORE_AFTER && useAiExample ? { useAiExample: true } : {}), ...(accountId ? { accountId } : {}), ...(experimentId && variantKey ? { experimentId, variantKey } : {}), creativeModelVersion: "creative_lab_v1" });
      setMessage("One creative has been added to the Growth queue."); router.refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Request failed."); } finally { setBusy(false); }
  }}>
    <div className="border-b border-brand-100 bg-brand-50/70 p-5 sm:p-7">
      <div className="flex items-start gap-3"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-brand-500 text-white"><Sparkles className="h-5 w-5" aria-hidden="true" /></span><div><p className="section-kicker">Primary workspace</p><h2 className="font-display mt-1 text-2xl font-bold text-ink sm:text-3xl">Create a creative</h2><p className="mt-1 max-w-2xl text-sm leading-6 text-muted-ink">Choose what the Pin should lead to, then select a visual approach. One bounded candidate will be queued.</p></div></div>
    </div>
    <div className="space-y-7 p-5 sm:p-7">
      <fieldset>
        <legend className="text-sm font-extrabold text-ink">1. Choose a destination</legend>
        <p className="mt-1 text-xs leading-5 text-muted-ink">Create for an interactive Translator or an editorial Idea.</p>
        <div className="mt-3 grid max-w-md grid-cols-2 rounded-2xl bg-muted-surface p-1" aria-label="Destination type">
          {[{ value: GrowthCreativeDestinationKind.TRANSLATOR, label: "Translator" }, { value: GrowthCreativeDestinationKind.IDEA, label: "Idea" }].map((item) => <button key={item.value} type="button" aria-pressed={kind === item.value} onClick={() => chooseKind(item.value)} className={`min-h-10 rounded-xl px-4 text-sm font-bold transition ${kind === item.value ? "bg-ink text-white shadow-sm" : "text-muted-ink hover:text-ink"}`}>{item.label}</button>)}
        </div>
      </fieldset>

      {kind === GrowthCreativeDestinationKind.TRANSLATOR ? <TranslatorTargetPicker initialOptions={translators} targetId={targetId} onSelect={setTargetId} /> : <label className="block text-sm font-extrabold text-ink">2. Select the Idea<select className={`${fieldClass} max-w-2xl`} value={targetId} onChange={(event) => setTargetId(event.target.value)}>{targets.map((item) => <option key={item.id} value={item.id}>{"name" in item ? item.name : item.title}</option>)}</select></label>}

      <fieldset>
        <legend className="text-sm font-extrabold text-ink">3. Pick a creative style</legend>
        <div className="mt-3 grid max-w-3xl gap-3 sm:grid-cols-2">{archetypeOptions.filter((item) => kind === GrowthCreativeDestinationKind.TRANSLATOR || item.value === GrowthCreativeArchetype.MINIMAL_STATEMENT).map((item) => <label key={item.value} className={`relative cursor-pointer rounded-2xl border p-4 transition ${archetype === item.value ? "border-brand-500 bg-brand-50 shadow-[0_4px_0_rgba(20,184,166,0.2)]" : "border-border bg-white hover:border-brand-300"}`}><input type="radio" name="archetype" className="sr-only" value={item.value} checked={archetype === item.value} onChange={() => setArchetype(item.value)} /><span className="block font-display text-base font-bold text-ink">{item.label}</span><span className="mt-1 block text-xs leading-5 text-muted-ink">{item.description}</span>{archetype === item.value ? <span className="absolute right-3 top-3 h-2.5 w-2.5 rounded-full bg-brand-500" aria-hidden="true" /> : null}</label>)}</div>
        {kind === GrowthCreativeDestinationKind.TRANSLATOR && archetype === GrowthCreativeArchetype.BEFORE_AFTER ? <div className="mt-4 max-w-3xl rounded-xl border border-supporting-200 bg-supporting-50 px-4 py-3"><label className="flex cursor-pointer items-start gap-3"><input type="checkbox" checked={useAiExample} onChange={(event) => setUseAiExample(event.target.checked)} className="mt-1 h-4 w-4 accent-teal-600" /><span><span className="block text-sm font-bold text-ink">Generate a real transformation when needed</span><span className="mt-0.5 block text-xs leading-5 text-muted-ink">A saved Translator example is preferred. Otherwise Creative Lab makes one bounded text transformation. The visual base uses one controlled AI image call.</span></span></label><p className={`mt-2 text-xs font-bold ${aiImageEnabled ? "text-brand-800" : "text-amber-800"}`}>{aiImageEnabled ? "AI image generation is enabled." : "AI image generation is currently disabled; this concept will not run until enabled."}</p></div> : null}
      </fieldset>

      <details className="group border-t border-dashed border-border pt-5">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-sm font-bold text-ink"><span>Advanced settings <span className="font-normal text-muted-ink">— optional</span></span><ChevronDown className="h-4 w-4 transition group-open:rotate-180" aria-hidden="true" /></summary>
        <p className="mt-1 text-xs leading-5 text-muted-ink">Associate this candidate with a connected account or an existing draft experiment.</p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <label className="text-sm font-bold text-ink">Pinterest account<select className={fieldClass} value={accountId} onChange={(event) => setAccountId(event.target.value)}><option value="">No account association</option>{accounts.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
          <label className="text-sm font-bold text-ink">Draft experiment<select className={fieldClass} value={experimentId} onChange={(event) => { setExperimentId(event.target.value); setVariantKey(""); }}><option value="">No experiment</option>{experiments.map((item) => <option key={item.id} value={item.id}>{item.hypothesis}</option>)}</select></label>
          {selectedExperiment ? <label className="text-sm font-bold text-ink sm:col-start-2">Experiment variant<select className={fieldClass} value={variantKey} onChange={(event) => setVariantKey(event.target.value)}><option value="">Choose a variant</option>{selectedExperiment.variants.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}</select></label> : null}
        </div>
      </details>

      <div className="flex flex-wrap items-center gap-4 border-t border-border pt-5"><button disabled={busy || !targetId || Boolean(experimentId) !== Boolean(variantKey) || (archetype === GrowthCreativeArchetype.BEFORE_AFTER && !aiImageEnabled)} className="min-h-11 rounded-full bg-accent-500 px-6 py-2.5 text-sm font-bold text-white shadow-[0_4px_0_#d9563b] transition hover:-translate-y-0.5 disabled:translate-y-0 disabled:opacity-50 disabled:shadow-none">{busy ? "Adding to queue…" : "Generate one candidate"}</button>{message ? <p role="status" className="text-sm font-medium text-muted-ink">{message}</p> : null}</div>
    </div>
  </form>;
}

export function CreativeRegenerateButton({ candidateId }: { candidateId: string }) {
  const router = useRouter();
  const [state, setState] = useState<"idle" | "busy" | "queued">("idle");
  const [error, setError] = useState("");
  return <div>
    <button type="button" disabled={state !== "idle"} onClick={async () => {
      setState("busy"); setError("");
      try {
        await post("/api/admin/growth/creative/regenerate", { candidateId });
        setState("queued"); router.refresh();
      } catch (caught) {
        setState("idle"); setError(caught instanceof Error ? caught.message : "Regeneration failed.");
      }
    }} className="min-h-10 rounded-full bg-ink px-4 py-2 text-sm font-bold text-white transition hover:bg-brand-700 disabled:opacity-60">{state === "busy" ? "Regenerating…" : state === "queued" ? "Regeneration queued" : "Regenerate"}</button>
    {error ? <p role="alert" className="mt-2 text-xs font-semibold text-red-700">{error}</p> : null}
  </div>;
}

export function CreativeExperimentForm() {
  const router = useRouter();
  const [busy, setBusy] = useState(false); const [message, setMessage] = useState("");
  const [dimension, setDimension] = useState<GrowthExperimentDimension>(GrowthExperimentDimension.ARCHETYPE);
  const [variantA, setVariantA] = useState("");
  const [variantB, setVariantB] = useState("");
  const selectedDimension = experimentDimensions.find((item) => item.value === dimension)!;
  const variantOptions = experimentVariantOptions[dimension];
  return <form className="rounded-[1.5rem] border border-dashed border-border bg-white/60 p-5 sm:p-6" onSubmit={async (event) => {
    event.preventDefault(); setBusy(true); setMessage(""); const data = new FormData(event.currentTarget);
    try { await post("/api/admin/growth/creative/experiments", { hypothesis: String(data.get("hypothesis")), dimension: String(data.get("dimension")), variants: [{ key: "a", label: "Variant A", value: String(data.get("variantA")) }, { key: "b", label: "Variant B", value: String(data.get("variantB")) }], primaryKpi: "OUTBOUND_CLICKS", guardrails: { minimumImpressions: 1000, minimumOutboundClicks: 20, maximumDays: 30 } }); setMessage("Draft experiment created."); router.refresh(); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Request failed."); } finally { setBusy(false); }
  }}>
    <div className="flex gap-3"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-supporting-100 text-supporting-800"><FlaskConical className="h-4 w-4" aria-hidden="true" /></span><div><p className="section-kicker">Secondary tool</p><h2 className="font-display mt-1 text-2xl font-bold text-ink">Plan a draft experiment</h2><p className="mt-1 max-w-2xl text-sm leading-6 text-muted-ink">Define a controlled comparison that candidates can join later. This creates a draft only; it does not launch or allocate traffic.</p></div></div>
    <div className="mt-6 grid gap-4 lg:grid-cols-2">
      <label className="text-sm font-bold text-ink lg:col-span-2">What do you expect to learn?<textarea name="hypothesis" required minLength={10} maxLength={500} placeholder="Example: Conversation creatives will earn more outbound clicks than typography creatives." className={`${fieldClass} min-h-24 resize-y`} /></label>
      <label className="text-sm font-bold text-ink">What changes?<select name="dimension" value={dimension} onChange={(event) => { setDimension(event.target.value as GrowthExperimentDimension); setVariantA(""); setVariantB(""); }} className={fieldClass}>{experimentDimensions.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select><span className="mt-1.5 block text-xs font-normal leading-5 text-muted-ink">{selectedDimension.help}</span></label>
      <fieldset className="lg:self-start"><legend className="text-sm font-bold text-ink">Treatments to compare</legend><p className="mt-1 text-xs leading-5 text-muted-ink">Choose the two controlled treatments you want to compare.</p><div className="mt-1 grid gap-4 sm:grid-cols-2"><label className="text-sm font-bold text-ink">Variant A<select name="variantA" required value={variantA} onChange={(event) => setVariantA(event.target.value)} className={fieldClass}><option value="">Choose first treatment</option>{variantOptions.map((item) => <option key={item.value} value={item.value} disabled={item.value === variantB}>{item.label}</option>)}</select></label><label className="text-sm font-bold text-ink">Variant B<select name="variantB" required value={variantB} onChange={(event) => setVariantB(event.target.value)} className={fieldClass}><option value="">Choose second treatment</option>{variantOptions.map((item) => <option key={item.value} value={item.value} disabled={item.value === variantA}>{item.label}</option>)}</select></label></div></fieldset>
    </div>
    <div className="mt-5 flex flex-wrap items-center gap-4"><button disabled={busy || !variantA || !variantB || variantA === variantB} className="min-h-10 rounded-full border border-ink bg-white px-5 py-2 text-sm font-bold text-ink transition hover:bg-ink hover:text-white disabled:opacity-50">{busy ? "Creating draft…" : "Create draft experiment"}</button>{message ? <p role="status" className="text-sm text-muted-ink">{message}</p> : null}</div>
  </form>;
}
