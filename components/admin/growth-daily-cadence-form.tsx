"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { useToast } from "@/components/providers/toast-provider";
import {
  dailyCadencePolicySchema,
  type CadenceChannelPolicy,
  type DailyCadencePolicy,
} from "@/lib/growth/portfolio/daily-cadence";

type ChannelKey = keyof DailyCadencePolicy;

export function GrowthDailyCadenceForm({
  initial,
  hardLimits,
}: {
  initial: DailyCadencePolicy;
  hardLimits: {
    translatorCreatesPerDay: number;
    aiImagesPerDay: number;
    aiDailyBudgetCents: number;
    aiMonthlyBudgetCents: number;
  };
}) {
  const [policy, setPolicy] = useState<DailyCadencePolicy>(initial);
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();
  const router = useRouter();
  const valid = useMemo(() =>
    dailyCadencePolicySchema.safeParse(policy).success, [policy]);

  function edit(
    key: ChannelKey,
    value: Partial<CadenceChannelPolicy>,
  ) {
    setPolicy(previous => ({
      ...previous,
      [key]: { ...previous[key], ...value },
    }));
  }

  async function save() {
    if (!valid) return;
    setSaving(true);
    try {
      const response = await fetch("/api/admin/growth/cadence", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(policy),
      });
      const result = await response.json();
      if (!response.ok || !result.ok) {
        toast({ title: "Daily cadence was not saved",
          description: result?.error?.message ?? "Check limits and try again.",
          variant: "error" });
        return;
      }
      setPolicy(dailyCadencePolicySchema.parse(result.policy));
      toast({ title: "Daily cadence preferences saved",
        description: "Planning preferences only. No jobs or publications were triggered." });
      router.refresh();
    } catch {
      toast({ title: "Daily cadence was not saved",
        description: "The request could not be completed.", variant: "error" });
    } finally {
      setSaving(false);
    }
  }

  const channels = [
    {
      key: "pinCreatives" as const,
      title: "Pinterest creative drafts",
      note: "The agent selects useful account-specific drafts. Each actual Pin still requires its own approval before publication.",
    },
    {
      key: "translatorCreates" as const,
      title: "New Translator drafts",
      note: "The agent may propose new Translators. Public activation is a separate quality and rollout gate.",
    },
  ];

  return (
    <section className="space-y-5 rounded-2xl border border-border bg-white p-5 sm:p-6">
      <div>
        <p className="section-kicker">Autonomous cadence controls</p>
        <h2 className="font-display mt-1 text-2xl font-bold text-ink">
          How much should the agent prepare each day?
        </h2>
        <p className="mt-2 text-sm leading-6 text-muted-ink">
          Auto chooses a daily amount within your range based on opportunity
          quality. Fixed requests an exact number, subject to safety limits.
          Paused plans zero. Minimums are goals, never permission to generate
          low-quality content or bypass spending, eligibility or approvals.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {channels.map(({ key, title, note }) => {
          const item = policy[key];
          return (
            <div key={key} className="space-y-4 rounded-xl border border-border p-4">
              <div>
                <h3 className="font-bold text-ink">{title}</h3>
                <p className="mt-1 text-xs leading-5 text-muted-ink">{note}</p>
              </div>
              <label className="block space-y-1.5 text-sm font-semibold text-ink">
                <span>Agent control</span>
                <select
                  aria-label={title + " mode"}
                  value={item.mode}
                  onChange={e => {
                    const mode = e.target.value as CadenceChannelPolicy["mode"];
                    edit(key, {
                      mode,
                      fixed: mode === "FIXED" ? Math.min(item.maximum,
                        Math.max(item.minimum, item.fixed ?? item.minimum)) : null,
                    });
                  }}
                  className="min-h-11 w-full rounded-xl border border-border bg-white px-3"
                >
                  <option value="AUTO">Auto, agent decides</option>
                  <option value="FIXED">Fixed number</option>
                  <option value="PAUSED">Paused by owner</option>
                </select>
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="space-y-1.5 text-sm font-semibold text-ink">
                  <span>Daily minimum</span>
                  <input type="number" min={1} max={10} step={1}
                    value={item.minimum}
                    onChange={e => edit(key, { minimum: Number(e.target.value) })}
                    className="min-h-11 w-full rounded-xl border border-border bg-white px-3"/>
                </label>
                <label className="space-y-1.5 text-sm font-semibold text-ink">
                  <span>Daily maximum</span>
                  <input type="number" min={1} max={10} step={1}
                    value={item.maximum}
                    onChange={e => edit(key, { maximum: Number(e.target.value) })}
                    className="min-h-11 w-full rounded-xl border border-border bg-white px-3"/>
                </label>
              </div>
              {item.mode === "FIXED" && (
                <label className="block space-y-1.5 text-sm font-semibold text-ink">
                  <span>Request exactly this many per day</span>
                  <input type="number" min={item.minimum} max={item.maximum}
                    step={1} value={item.fixed ?? ""}
                    onChange={e => edit(key, { fixed: Number(e.target.value) })}
                    className="min-h-11 w-full rounded-xl border border-border bg-white px-3"/>
                </label>
              )}
              <p className="text-xs text-muted-ink">
                {item.mode === "PAUSED" ? "Paused by your instruction." :
                  item.mode === "AUTO" ?
                    `Daily preference: ${item.minimum}–${item.maximum}. The agent picks the amount.` :
                    `Requested daily amount: ${item.fixed ?? "invalid"}.`}
              </p>
            </div>
          );
        })}
      </div>

      <div className="rounded-xl border border-border bg-muted/20 p-4 text-sm">
        <h3 className="font-bold text-ink">Independent hard limits (unchanged)</h3>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          <p>New Translator creations: <strong>{hardLimits.translatorCreatesPerDay}/day</strong></p>
          <p>AI images: <strong>{hardLimits.aiImagesPerDay}/day</strong></p>
          <p>AI daily budget: <strong>${(hardLimits.aiDailyBudgetCents / 100).toFixed(2)}</strong></p>
          <p>AI monthly budget: <strong>${(hardLimits.aiMonthlyBudgetCents / 100).toFixed(2)}</strong></p>
        </div>
        <p className="mt-3 text-xs leading-5 text-muted-ink">
          Your preferred maximum cannot increase these operational caps.
          This page currently saves planning preferences only; it cannot
          enable the Growth worker, create accounts, run AI jobs, activate
          Translator pages or publish Pins.
        </p>
      </div>
      {!valid && (
        <p role="alert" className="text-sm font-semibold text-red-700">
          Enter a valid 1–10 minimum/maximum; fixed values must fit within the range.
        </p>
      )}
      <div className="flex justify-end">
        <Button type="button" onClick={save} disabled={!valid || saving}>
          {saving ? "Saving…" : "Save daily preferences"}
        </Button>
      </div>
    </section>
  );
}
