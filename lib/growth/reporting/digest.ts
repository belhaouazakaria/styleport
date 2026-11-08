/** Deterministic, concise operator digest, built only from confirmed metrics. */
export interface GrowthDigestData {
  date: string; // UTC YYYY-MM-DD
  pinterestLandingSessions: number | null;
  qualifiedConversions: number | null;
  outboundClicks: number | null;
  pinsPublished: number | null;
  newTranslators: number | null;
  newIdeas: number | null;
  aiSpendUsd: number | null;
  aiReservedCents?: number | null;
  aiDraftsReady?: number | null;
  aiImageAttempts?: number | null;
  aiTextAttempts?: number | null;
  jobsSucceeded?: number | null;
  jobsFailed?: number | null;
  previousDay?: string | null;
  previousPinsPublished?: number | null;
  previousAiDraftsReady?: number | null;
  previousNewTranslators?: number | null;
  previousNewIdeas?: number | null;
  analyticsAccountsReady?: number | null;
  analyticsAccountsTotal?: number | null;
  analyticsPinsReady?: number | null;
  analyticsPinsEligible?: number | null;
  breakout: string | null;
  warnings: string[];
  nextAction: string | null;
  reportId: string | null;
}

function value(n: number | null): string {
  return n === null || !Number.isFinite(n) || n < 0
    ? "Unavailable"
    : n.toLocaleString("en-US", { maximumFractionDigits: 0 });
}

function coverage(ready: number | null | undefined, total: number | null | undefined): string {
  if (ready === null || ready === undefined || total === null || total === undefined ||
      !Number.isSafeInteger(ready) || !Number.isSafeInteger(total) ||
      ready < 0 || total < 0 || ready > total) return "Unavailable";
  return `${ready}/${total}`;
}

function signedChange(current: number | null | undefined, previous: number | null | undefined): string {
  if (current === null || current === undefined || previous === null || previous === undefined ||
      !Number.isSafeInteger(current) || !Number.isSafeInteger(previous) ||
      current < 0 || previous < 0) return "Unavailable";
  const delta = current - previous;
  return delta > 0 ? "+" + delta.toLocaleString("en-US") : delta.toLocaleString("en-US");
}

function textLine(value: string, maximum: number): string {
  return value.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, maximum);
}

export function formatGrowthDailyDigest(data: GrowthDigestData): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data.date) ||
      !Number.isFinite(new Date(`${data.date}T00:00:00Z`).getTime())) {
    throw new Error("Invalid daily Growth report date");
  }
  const spend = data.aiSpendUsd === null || !Number.isFinite(data.aiSpendUsd) || data.aiSpendUsd < 0
    ? "Unavailable"
    : `$${data.aiSpendUsd.toFixed(2)} USD`;
  const entries = [
    `SayTwist Growth · ${data.date} (UTC)`,
    `Pinterest landings: ${value(data.pinterestLandingSessions)}`,
    `Qualified translations: ${value(data.qualifiedConversions)}`,
    `Pinterest outbound clicks: ${value(data.outboundClicks)}`,
    `Pinterest analytics coverage: ${coverage(data.analyticsAccountsReady, data.analyticsAccountsTotal)} accounts READY; ${coverage(data.analyticsPinsReady, data.analyticsPinsEligible)} eligible Pins READY`,
    `AI image drafts READY: ${value(data.aiDraftsReady ?? null)}`,
    `Growth AI image attempts reserved: ${value(data.aiImageAttempts ?? null)} (attempts, not billed spend)`,
    `Growth AI text attempts reserved: ${value(data.aiTextAttempts ?? null)} (attempts, not billed spend)`,
    `Growth jobs created: ${value(data.jobsSucceeded ?? null)} succeeded / ${value(data.jobsFailed ?? null)} failed (latest recorded status)`,
    `Growth-managed Pins published: ${value(data.pinsPublished)}`,
    `Growth-created Translators / Ideas: ${value(data.newTranslators)} / ${value(data.newIdeas)}`,
    `Growth AI spend: ${spend === "Unavailable" ? "Unavailable (billing not reconciled)" : spend}`,
    `Growth AI reserved ceiling: ${data.aiReservedCents != null &&
      Number.isSafeInteger(data.aiReservedCents) && data.aiReservedCents >= 0
      ? "$" + (data.aiReservedCents / 100).toFixed(2) + " USD (not billed spend)"
      : "Unavailable"}`,
    `Breakout: ${data.breakout ? textLine(data.breakout, 180) : "Unavailable (no complete Pin-level evidence)"}`,
    `Warnings: ${data.warnings.length ? data.warnings.slice(0, 5).map((w) => textLine(w, 170)).join("; ") + (data.warnings.length > 5 ? `; plus ${data.warnings.length - 5} more warning(s) in the archive` : "") : "None reported"}`,
    `Next: ${data.nextAction ? textLine(data.nextAction, 180) : "Review data availability before proposing action"}`,
  ];
  if (data.previousDay) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(data.previousDay) ||
        !Number.isFinite(new Date(data.previousDay + "T00:00:00Z").getTime())) {
      throw new Error("Invalid previous Growth report date");
    }
    entries.push(`Day-over-day vs ${data.previousDay} (local records): Pins ${signedChange(data.pinsPublished, data.previousPinsPublished)}; AI drafts ${signedChange(data.aiDraftsReady, data.previousAiDraftsReady)}; Translators ${signedChange(data.newTranslators, data.previousNewTranslators)}; Ideas ${signedChange(data.newIdeas, data.previousNewIdeas)}`);
  }
  if (data.reportId) {
    if (!/^[a-zA-Z0-9_-]{1,100}$/.test(data.reportId)) throw new Error("Invalid Growth report ID");
    entries.push(`Full report: https://saytwist.com/admin/growth/reports/${data.reportId}`);
  }
  return entries.join("\n");
}
