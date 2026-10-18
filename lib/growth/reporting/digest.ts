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

function textLine(value: string, maximum: number): string {
  return value.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, maximum);
}

export function formatGrowthWhatsAppDigest(data: GrowthDigestData): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data.date) ||
      !Number.isFinite(new Date(`${data.date}T00:00:00Z`).getTime())) {
    throw new Error("Invalid daily Growth report date");
  }
  const spend = data.aiSpendUsd === null || !Number.isFinite(data.aiSpendUsd) || data.aiSpendUsd < 0
    ? "Unavailable"
    : `$${data.aiSpendUsd.toFixed(2)} USD`;
  const entries = [
    `*SayTwist Growth · ${data.date} (UTC)*`,
    `Pinterest landings: ${value(data.pinterestLandingSessions)}`,
    `Qualified translations: ${value(data.qualifiedConversions)}`,
    `Pinterest outbound clicks: ${value(data.outboundClicks)}`,
    `Pins published: ${value(data.pinsPublished)}`,
    `New Translators / Ideas: ${value(data.newTranslators)} / ${value(data.newIdeas)}`,
    `Growth AI spend: ${spend}`,
    `Breakout: ${data.breakout ? textLine(data.breakout, 180) : "Insufficient data"}`,
    `Warnings: ${data.warnings.length ? data.warnings.slice(0, 2).map((w) => textLine(w, 170)).join("; ") : "None reported"}`,
    `Next: ${data.nextAction ? textLine(data.nextAction, 180) : "No action recommended"}`,
  ];
  if (data.reportId) {
    if (!/^[a-zA-Z0-9_-]{1,100}$/.test(data.reportId)) throw new Error("Invalid Growth report ID");
    entries.push(`Full report: https://saytwist.com/admin/growth/reports/${data.reportId}`);
  }
  return entries.join("\n");
}
