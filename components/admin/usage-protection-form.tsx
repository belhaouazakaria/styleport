"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Mail, ShieldAlert } from "lucide-react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { useToast } from "@/components/providers/toast-provider";
import type { UsageProtectionDashboardData, UsageProtectionSettingsInput } from "@/lib/types";
import { formatDateTime } from "@/lib/utils";

interface UsageProtectionFormProps {
  initial: UsageProtectionDashboardData;
}

function NumberField(props: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
  description?: string;
}) {
  return (
    <label className="space-y-1 text-sm">
      <span className="font-medium text-muted-ink">{props.label}</span>
      <input
        type="number"
        min={props.min}
        max={props.max}
        value={props.value}
        onChange={(event) => props.onChange(Number(event.target.value) || props.min)}
        className="h-11 w-full rounded-xl border border-border bg-white px-3 text-ink focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
      />
      {props.description ? <p className="text-xs text-muted-ink">{props.description}</p> : null}
    </label>
  );
}

export function UsageProtectionForm({ initial }: UsageProtectionFormProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const [reenabling, setReenabling] = useState(false);
  const [state, setState] = useState(initial);
  const [form, setForm] = useState<UsageProtectionSettingsInput>({
    usageProtectionEnabled: initial.state.usageProtectionEnabled,
    ipLimitPerMinute: initial.state.ipLimitPerMinute,
    ipLimitPerHour: initial.state.ipLimitPerHour,
    ipLimitPerDay: initial.state.ipLimitPerDay,
    globalDailyTokenCap: initial.state.globalDailyTokenCap,
    autoEmergencyShutdownEnabled: initial.state.autoEmergencyShutdownEnabled,
    alertEmail: initial.state.alertEmail || "",
  });

  const tokenUsagePercent = useMemo(() => {
    if (!state.today.tokenCap) return 0;
    return Math.min(100, Math.round((state.today.totalTokens / state.today.tokenCap) * 100));
  }, [state.today.tokenCap, state.today.totalTokens]);

  async function save() {
    setBusy(true);
    const response = await fetch("/api/admin/usage-protection", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const result = await response.json();
    setBusy(false);

    if (!response.ok || !result.ok) {
      toast({
        title: "Save failed",
        description: result?.error?.message || "Unable to save usage protection settings.",
        variant: "error",
      });
      return;
    }

    if (result.usageProtection) {
      setState(result.usageProtection);
    }

    toast({ title: "Usage protection settings saved." });
    router.refresh();
  }

  async function reenable() {
    setReenabling(true);
    const response = await fetch("/api/admin/usage-protection/re-enable", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason: "Manual re-enable from usage protection page." }),
    });
    const result = await response.json();
    setReenabling(false);

    if (!response.ok || !result.ok) {
      toast({
        title: "Re-enable failed",
        description: result?.error?.message || "Unable to re-enable translation right now.",
        variant: "error",
      });
      return;
    }

    const refreshed = await fetch("/api/admin/usage-protection");
    const refreshedResult = await refreshed.json();
    if (refreshed.ok && refreshedResult.ok) {
      setState(refreshedResult.usageProtection);
    }

    toast({ title: "Translations re-enabled." });
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <section
        className={`rounded-2xl border p-5 sm:p-6 ${
          state.state.translationsEnabled ? "border-emerald-200 bg-emerald-50/60" : "border-red-200 bg-red-50/60"
        }`}
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-ink">System Translation Status</p>
            <h2 className="mt-1 font-display text-2xl font-semibold text-ink">
              {state.state.translationsEnabled ? "Active" : "Emergency Stopped"}
            </h2>
            <p className="mt-1 text-sm text-muted-ink">
              {state.state.translationsEnabled
                ? "Translation requests are currently accepted."
                : "Public translation is blocked until you manually re-enable it."}
            </p>
            {state.state.shutdownReason ? (
              <p className="mt-2 text-sm text-ink">
                <span className="font-semibold">Reason:</span> {state.state.shutdownReason}
              </p>
            ) : null}
            {state.state.shutdownTriggeredAt ? (
              <p className="mt-1 text-xs text-muted-ink">
                Triggered: {formatDateTime(state.state.shutdownTriggeredAt)}
              </p>
            ) : null}
          </div>

          {state.state.translationsEnabled ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700">
              <CheckCircle2 className="h-3.5 w-3.5" />
              Running
            </span>
          ) : (
            <Button
              type="button"
              onClick={() => void reenable()}
              disabled={reenabling}
              className="bg-red-600 hover:bg-red-700"
            >
              {reenabling ? "Re-enabling..." : "Manually Re-enable"}
            </Button>
          )}
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-2xl border border-border bg-white p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-ink">Requests Today (UTC)</p>
          <p className="mt-2 text-2xl font-semibold text-ink">{state.today.totalRequests}</p>
        </div>
        <div className="rounded-2xl border border-border bg-white p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-ink">Blocked Today</p>
          <p className="mt-2 text-2xl font-semibold text-ink">{state.today.blockedRequests}</p>
        </div>
        <div className="rounded-2xl border border-border bg-white p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-ink">Tokens Today</p>
          <p className="mt-2 text-2xl font-semibold text-ink">{state.today.totalTokens}</p>
          <p className="mt-1 text-xs text-muted-ink">
            {tokenUsagePercent}% of {state.today.tokenCap.toLocaleString()} cap
          </p>
        </div>
        <div className="rounded-2xl border border-border bg-white p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-ink">Remaining Token Budget</p>
          <p className="mt-2 text-2xl font-semibold text-ink">{state.today.remainingTokens}</p>
        </div>
      </section>

      <section className="rounded-2xl border border-border bg-white p-5 sm:p-6">
        <h2 className="font-display text-2xl font-semibold text-ink">Protection Limits</h2>
        <p className="mt-1 text-sm text-muted-ink">
          Limits are enforced server-side before every translation call.
        </p>

        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <NumberField
            label="Per-IP Requests Per Minute"
            value={form.ipLimitPerMinute}
            min={1}
            max={500}
            onChange={(value) => setForm((current) => ({ ...current, ipLimitPerMinute: value }))}
          />
          <NumberField
            label="Per-IP Requests Per Hour"
            value={form.ipLimitPerHour}
            min={1}
            max={20000}
            onChange={(value) => setForm((current) => ({ ...current, ipLimitPerHour: value }))}
          />
          <NumberField
            label="Per-IP Requests Per Day"
            value={form.ipLimitPerDay}
            min={1}
            max={200000}
            onChange={(value) => setForm((current) => ({ ...current, ipLimitPerDay: value }))}
          />
          <NumberField
            label="Global Daily Token Cap"
            value={form.globalDailyTokenCap}
            min={1000}
            max={2000000000}
            onChange={(value) => setForm((current) => ({ ...current, globalDailyTokenCap: value }))}
            description="UTC day boundary; manual re-enable required after shutdown."
          />
        </div>

        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <label className="flex items-start gap-2 rounded-xl border border-border p-3 text-sm text-muted-ink">
            <input
              type="checkbox"
              checked={form.usageProtectionEnabled}
              onChange={(event) =>
                setForm((current) => ({ ...current, usageProtectionEnabled: event.target.checked }))
              }
              className="mt-0.5"
            />
            <span>
              <span className="block font-medium text-ink">Enable usage protection</span>
              Apply per-IP limits and global token cap checks.
            </span>
          </label>

          <label className="flex items-start gap-2 rounded-xl border border-border p-3 text-sm text-muted-ink">
            <input
              type="checkbox"
              checked={form.autoEmergencyShutdownEnabled}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  autoEmergencyShutdownEnabled: event.target.checked,
                }))
              }
              className="mt-0.5"
            />
            <span>
              <span className="block font-medium text-ink">Auto emergency shutdown</span>
              Automatically stop all translations when token cap is reached.
            </span>
          </label>
        </div>

        <label className="mt-4 block space-y-1 text-sm">
          <span className="inline-flex items-center gap-1 font-medium text-muted-ink">
            <Mail className="h-4 w-4" />
            Alert Email
          </span>
          <input
            type="email"
            value={form.alertEmail || ""}
            onChange={(event) => setForm((current) => ({ ...current, alertEmail: event.target.value }))}
            className="h-11 w-full rounded-xl border border-border bg-white px-3 text-ink focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
            placeholder="alerts@example.com"
          />
          <p className="text-xs text-muted-ink">
            Recipient precedence: this field, then `ALERT_ADMIN_EMAIL`, then earliest admin email.
          </p>
        </label>

        <div className="mt-5">
          <Button type="button" onClick={() => void save()} disabled={busy}>
            {busy ? "Saving..." : "Save Usage Protection Settings"}
          </Button>
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        <div className="rounded-2xl border border-border bg-white p-5 sm:p-6">
          <h3 className="font-display text-xl font-semibold text-ink">Blocked Reasons (Today)</h3>
          <div className="mt-3 space-y-2">
            {state.today.blockedByReason.length ? (
              state.today.blockedByReason.map((item) => (
                <div
                  key={item.code}
                  className="flex items-center justify-between rounded-xl border border-border bg-muted-surface px-3 py-2"
                >
                  <span className="text-sm font-medium text-ink">{item.code}</span>
                  <span className="text-sm text-muted-ink">{item.count}</span>
                </div>
              ))
            ) : (
              <p className="text-sm text-muted-ink">No blocked requests recorded today.</p>
            )}
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-white p-5 sm:p-6">
          <h3 className="font-display text-xl font-semibold text-ink">Last Shutdown Event</h3>
          {state.lastShutdownEvent ? (
            <div className="mt-3 space-y-2 text-sm">
              <p className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-1 text-xs font-semibold text-red-700">
                <ShieldAlert className="h-3.5 w-3.5" />
                {state.lastShutdownEvent.type}
              </p>
              <p className="text-ink">{state.lastShutdownEvent.reason}</p>
              <p className="text-muted-ink">Triggered: {formatDateTime(state.lastShutdownEvent.createdAt)}</p>
              <p className="text-muted-ink">
                Tokens at trigger: {state.lastShutdownEvent.tokenUsageAtTrigger || 0} /{" "}
                {state.lastShutdownEvent.tokenCapAtTrigger || state.today.tokenCap}
              </p>
              <p className="text-muted-ink">
                Alert recipient: {state.lastShutdownEvent.alertEmail || "Not configured"}
              </p>
              {state.lastShutdownEvent.alertSentAt ? (
                <p className="inline-flex items-center gap-1 text-emerald-700">
                  <CheckCircle2 className="h-4 w-4" />
                  Alert sent at {formatDateTime(state.lastShutdownEvent.alertSentAt)}
                </p>
              ) : state.lastShutdownEvent.alertError ? (
                <p className="inline-flex items-center gap-1 text-red-600">
                  <AlertTriangle className="h-4 w-4" />
                  Alert failed: {state.lastShutdownEvent.alertError}
                </p>
              ) : (
                <p className="text-muted-ink">Alert pending.</p>
              )}
            </div>
          ) : (
            <p className="mt-3 text-sm text-muted-ink">No shutdown events recorded yet.</p>
          )}
        </div>
      </section>
    </div>
  );
}
