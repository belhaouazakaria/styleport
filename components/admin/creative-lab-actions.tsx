"use client";

import { GrowthCreativeArchetype, GrowthCreativeDestinationKind, GrowthExperimentDimension } from "@prisma/client";
import { ChevronDown, FlaskConical, Sparkles } from "lucide-react";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

const archetypeOptions = [
  { value: GrowthCreativeArchetype.V1_CONTROL, label: "Control", description: "The established Translator share image." },
  { value: GrowthCreativeArchetype.TYPOGRAPHY_LED, label: "Typography", description: "A bold, words-first editorial layout." },
  { value: GrowthCreativeArchetype.EDITORIAL_LIST, label: "Editorial list", description: "Structured ideas made easy to scan." },
  { value: GrowthCreativeArchetype.CONVERSATION_CHAT, label: "Conversation", description: "A familiar message-and-reply format." },
  { value: GrowthCreativeArchetype.MINIMAL_STATEMENT, label: "Minimal", description: "One clear thought with generous space." },
];

const experimentDimensions = [
  { value: GrowthExperimentDimension.ARCHETYPE, label: "Creative format", help: "Compare two creative archetypes." },
  { value: GrowthExperimentDimension.TEMPLATE, label: "Template", help: "Compare two controlled template IDs." },
  { value: GrowthExperimentDimension.HEADLINE_PATTERN, label: "Headline approach", help: "Compare two headline pattern IDs." },
  { value: GrowthExperimentDimension.CTA_PATTERN, label: "Call to action", help: "Compare two CTA pattern IDs." },
  { value: GrowthExperimentDimension.VISUAL_TREATMENT, label: "Visual treatment", help: "Compare two visual treatment IDs." },
];

const fieldClass = "mt-2 min-h-11 w-full rounded-xl border border-border bg-white px-3 py-2.5 text-sm text-ink outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/15";

async function post(url: string, body: unknown) {
  const response = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(payload?.error?.message || "Request failed.");
  return payload;
}

export function CreativeGenerationForm({ translators, ideas, accounts, experiments }: {
  translators: Array<{ id: string; name: string }>;
  ideas: Array<{ id: string; title: string }>;
  accounts: Array<{ id: string; label: string }>;
  experiments: Array<{ id: string; hypothesis: string; variants: Array<{ key: string; label: string }> }>;
}) {
  const router = useRouter();
  const [kind, setKind] = useState<GrowthCreativeDestinationKind>(GrowthCreativeDestinationKind.TRANSLATOR);
  const [targetId, setTargetId] = useState(translators[0]?.id || "");
  const [archetype, setArchetype] = useState<GrowthCreativeArchetype>(GrowthCreativeArchetype.V1_CONTROL);
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
    if (next === GrowthCreativeDestinationKind.IDEA && archetype === GrowthCreativeArchetype.V1_CONTROL) setArchetype(GrowthCreativeArchetype.TYPOGRAPHY_LED);
  }

  return <form className="overflow-hidden rounded-[1.75rem] border border-brand-200 bg-white shadow-[0_24px_70px_-48px_rgba(15,23,42,0.55)]" onSubmit={async (event) => {
    event.preventDefault(); setBusy(true); setMessage("");
    try {
      await post("/api/admin/growth/creative/generate", { targetKind: kind, targetId, archetype, ...(accountId ? { accountId } : {}), ...(experimentId && variantKey ? { experimentId, variantKey } : {}), creativeModelVersion: "creative_lab_v1" });
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

      <label className="block text-sm font-extrabold text-ink">2. Select the {kind === GrowthCreativeDestinationKind.TRANSLATOR ? "Translator" : "Idea"}
        <select className={`${fieldClass} max-w-2xl`} value={targetId} onChange={(event) => setTargetId(event.target.value)}>{targets.map((item) => <option key={item.id} value={item.id}>{"name" in item ? item.name : item.title}</option>)}</select>
      </label>

      <fieldset>
        <legend className="text-sm font-extrabold text-ink">3. Pick a creative style</legend>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">{archetypeOptions.filter((item) => kind === GrowthCreativeDestinationKind.TRANSLATOR || item.value !== GrowthCreativeArchetype.V1_CONTROL).map((item) => <label key={item.value} className={`relative cursor-pointer rounded-2xl border p-4 transition ${archetype === item.value ? "border-brand-500 bg-brand-50 shadow-[0_4px_0_rgba(20,184,166,0.2)]" : "border-border bg-white hover:border-brand-300"}`}><input type="radio" name="archetype" className="sr-only" value={item.value} checked={archetype === item.value} onChange={() => setArchetype(item.value)} /><span className="block font-display text-base font-bold text-ink">{item.label}</span><span className="mt-1 block text-xs leading-5 text-muted-ink">{item.description}</span>{archetype === item.value ? <span className="absolute right-3 top-3 h-2.5 w-2.5 rounded-full bg-brand-500" aria-hidden="true" /> : null}</label>)}</div>
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

      <div className="flex flex-wrap items-center gap-4 border-t border-border pt-5"><button disabled={busy || !targetId || Boolean(experimentId) !== Boolean(variantKey)} className="min-h-11 rounded-full bg-accent-500 px-6 py-2.5 text-sm font-bold text-white shadow-[0_4px_0_#d9563b] transition hover:-translate-y-0.5 disabled:translate-y-0 disabled:opacity-50 disabled:shadow-none">{busy ? "Adding to queue…" : "Generate one candidate"}</button>{message ? <p role="status" className="text-sm font-medium text-muted-ink">{message}</p> : null}</div>
    </div>
  </form>;
}

export function CreativeExperimentForm() {
  const router = useRouter();
  const [busy, setBusy] = useState(false); const [message, setMessage] = useState("");
  const [dimension, setDimension] = useState<GrowthExperimentDimension>(GrowthExperimentDimension.ARCHETYPE);
  const selectedDimension = experimentDimensions.find((item) => item.value === dimension)!;
  return <form className="rounded-[1.5rem] border border-dashed border-border bg-white/60 p-5 sm:p-6" onSubmit={async (event) => {
    event.preventDefault(); setBusy(true); setMessage(""); const data = new FormData(event.currentTarget);
    try { await post("/api/admin/growth/creative/experiments", { hypothesis: String(data.get("hypothesis")), dimension: String(data.get("dimension")), variants: [{ key: "a", label: "Variant A", value: String(data.get("variantA")) }, { key: "b", label: "Variant B", value: String(data.get("variantB")) }], primaryKpi: "OUTBOUND_CLICKS", guardrails: { minimumImpressions: 1000, minimumOutboundClicks: 20, maximumDays: 30 } }); setMessage("Draft experiment created."); router.refresh(); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Request failed."); } finally { setBusy(false); }
  }}>
    <div className="flex gap-3"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-supporting-100 text-supporting-800"><FlaskConical className="h-4 w-4" aria-hidden="true" /></span><div><p className="section-kicker">Secondary tool</p><h2 className="font-display mt-1 text-2xl font-bold text-ink">Plan a draft experiment</h2><p className="mt-1 max-w-2xl text-sm leading-6 text-muted-ink">Define a controlled comparison that candidates can join later. This creates a draft only; it does not launch or allocate traffic.</p></div></div>
    <div className="mt-6 grid gap-4 lg:grid-cols-2">
      <label className="text-sm font-bold text-ink lg:col-span-2">What do you expect to learn?<textarea name="hypothesis" required minLength={10} maxLength={500} placeholder="Example: Conversation creatives will earn more outbound clicks than typography creatives." className={`${fieldClass} min-h-24 resize-y`} /></label>
      <label className="text-sm font-bold text-ink">What changes?<select name="dimension" value={dimension} onChange={(event) => setDimension(event.target.value as GrowthExperimentDimension)} className={fieldClass}>{experimentDimensions.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select><span className="mt-1.5 block text-xs font-normal leading-5 text-muted-ink">{selectedDimension.help}</span></label>
      <div className="grid gap-4 sm:grid-cols-2 lg:self-start"><label className="text-sm font-bold text-ink">Variant A value<input name="variantA" required maxLength={120} placeholder="First controlled value" className={fieldClass} /></label><label className="text-sm font-bold text-ink">Variant B value<input name="variantB" required maxLength={120} placeholder="Second controlled value" className={fieldClass} /></label></div>
    </div>
    <div className="mt-5 flex flex-wrap items-center gap-4"><button disabled={busy} className="min-h-10 rounded-full border border-ink bg-white px-5 py-2 text-sm font-bold text-ink transition hover:bg-ink hover:text-white disabled:opacity-50">{busy ? "Creating draft…" : "Create draft experiment"}</button>{message ? <p role="status" className="text-sm text-muted-ink">{message}</p> : null}</div>
  </form>;
}
