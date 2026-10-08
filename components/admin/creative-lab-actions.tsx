"use client";

import { GrowthCreativeArchetype, GrowthCreativeDestinationKind, GrowthExperimentDimension } from "@prisma/client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

const archetypes = [GrowthCreativeArchetype.V1_CONTROL, GrowthCreativeArchetype.TYPOGRAPHY_LED, GrowthCreativeArchetype.EDITORIAL_LIST, GrowthCreativeArchetype.CONVERSATION_CHAT, GrowthCreativeArchetype.MINIMAL_STATEMENT];

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
  return <form className="grid gap-3 rounded-2xl border border-border bg-white p-5 sm:grid-cols-2" onSubmit={async (event) => {
    event.preventDefault(); setBusy(true); setMessage("");
    try {
      await post("/api/admin/growth/creative/generate", { targetKind: kind, targetId, archetype, ...(accountId ? { accountId } : {}), ...(experimentId && variantKey ? { experimentId, variantKey } : {}), creativeModelVersion: "creative_lab_v1" });
      setMessage("One Creative Lab job was queued."); router.refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Request failed."); } finally { setBusy(false); }
  }}>
    <label className="text-sm font-bold">Destination kind<select className="mt-1 w-full rounded-xl border border-border p-2" value={kind} onChange={(event) => { const next = event.target.value as GrowthCreativeDestinationKind; setKind(next); setTargetId((next === GrowthCreativeDestinationKind.TRANSLATOR ? translators : ideas)[0]?.id || ""); if (next === GrowthCreativeDestinationKind.IDEA && archetype === GrowthCreativeArchetype.V1_CONTROL) setArchetype(GrowthCreativeArchetype.TYPOGRAPHY_LED); }}><option value="TRANSLATOR">Translator</option><option value="IDEA">Idea</option></select></label>
    <label className="text-sm font-bold">Destination<select className="mt-1 w-full rounded-xl border border-border p-2" value={targetId} onChange={(event) => setTargetId(event.target.value)}>{targets.map((item) => <option key={item.id} value={item.id}>{"name" in item ? item.name : item.title}</option>)}</select></label>
    <label className="text-sm font-bold">Archetype<select className="mt-1 w-full rounded-xl border border-border p-2" value={archetype} onChange={(event) => setArchetype(event.target.value as GrowthCreativeArchetype)}>{archetypes.filter((item) => kind === GrowthCreativeDestinationKind.TRANSLATOR || item !== GrowthCreativeArchetype.V1_CONTROL).map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
    <label className="text-sm font-bold">Account (optional)<select className="mt-1 w-full rounded-xl border border-border p-2" value={accountId} onChange={(event) => setAccountId(event.target.value)}><option value="">None</option>{accounts.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
    <label className="text-sm font-bold">Draft experiment (optional)<select className="mt-1 w-full rounded-xl border border-border p-2" value={experimentId} onChange={(event) => { setExperimentId(event.target.value); setVariantKey(""); }}><option value="">None</option>{experiments.map((item) => <option key={item.id} value={item.id}>{item.hypothesis}</option>)}</select></label>
    <label className="text-sm font-bold">Variant<select disabled={!selectedExperiment} className="mt-1 w-full rounded-xl border border-border p-2 disabled:opacity-50" value={variantKey} onChange={(event) => setVariantKey(event.target.value)}><option value="">Select</option>{selectedExperiment?.variants.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}</select></label>
    <div className="sm:col-span-2"><button disabled={busy || !targetId || Boolean(experimentId) !== Boolean(variantKey)} className="rounded-xl bg-ink px-4 py-2 text-sm font-bold text-white disabled:opacity-50">{busy ? "Queueing…" : "Generate one candidate"}</button>{message ? <p className="mt-2 text-sm text-muted-ink">{message}</p> : null}</div>
  </form>;
}

export function CreativeExperimentForm() {
  const router = useRouter();
  const [busy, setBusy] = useState(false); const [message, setMessage] = useState("");
  return <form className="grid gap-3 rounded-2xl border border-border bg-white p-5" onSubmit={async (event) => {
    event.preventDefault(); setBusy(true); setMessage(""); const data = new FormData(event.currentTarget);
    try { await post("/api/admin/growth/creative/experiments", { hypothesis: String(data.get("hypothesis")), dimension: String(data.get("dimension")), variants: [{ key: "a", label: "Variant A", value: String(data.get("variantA")) }, { key: "b", label: "Variant B", value: String(data.get("variantB")) }], primaryKpi: "OUTBOUND_CLICKS", guardrails: { minimumImpressions: 1000, minimumOutboundClicks: 20, maximumDays: 30 } }); setMessage("Draft experiment created."); router.refresh(); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Request failed."); } finally { setBusy(false); }
  }}><input name="hypothesis" required minLength={10} maxLength={500} placeholder="Hypothesis" className="rounded-xl border border-border p-2"/><select name="dimension" className="rounded-xl border border-border p-2">{Object.values(GrowthExperimentDimension).map((item) => <option key={item} value={item}>{item}</option>)}</select><div className="grid gap-3 sm:grid-cols-2"><input name="variantA" required maxLength={120} placeholder="Variant A value" className="rounded-xl border border-border p-2"/><input name="variantB" required maxLength={120} placeholder="Variant B value" className="rounded-xl border border-border p-2"/></div><div><button disabled={busy} className="rounded-xl border border-border px-4 py-2 text-sm font-bold disabled:opacity-50">{busy ? "Creating…" : "Create draft experiment"}</button>{message ? <p className="mt-2 text-sm text-muted-ink">{message}</p> : null}</div></form>;
}

