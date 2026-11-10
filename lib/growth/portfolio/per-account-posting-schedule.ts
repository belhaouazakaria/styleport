import { createHash } from "node:crypto";

/**
 * Account-local editorial schedule, source-only. Ten distinct windows per
 * local calendar day; the planner DOES NOT approve or publish Pins.
 * Future caller must recheck provider/account, quota and time gates.
 */
export const ACCOUNT_DAILY_WINDOWS = [
  "07:00", "08:45", "10:30", "12:15", "14:00",
  "15:45", "17:30", "19:15", "21:00", "22:45",
] as const;
const MIN_MATURE_PINS = 4;
const MIN_MATURE_IMPRESSIONS = 1000;
const MIN_SEPARATION_MINUTES = 90;
type SlotName = typeof ACCOUNT_DAILY_WINDOWS[number];

export type AccountPostingWindowEvidence = {
  slot: SlotName;
  samplePins: number;
  impressions: number;
  outboundClicks: number;
  saves: number;
  ready: boolean;
};

export type AccountPostingPlan = {
  accountId: string;
  timeZone: string;
  localDate: string;
  evidence: "QUALIFIED" | "COLD_START";
  windows: Array<{
    localTime: SlotName;
    scheduledAt: string;
    strategy: "EXPLOIT" | "EXPLORE" | "COLD_START";
    qualified: boolean;
  }>;
  explicitlyApprovedPins: 0;
};

function hash(key: string): number {
  return Number.parseInt(createHash("sha256").update(key).digest("hex").slice(0, 8), 16);
}

function localParts(date: Date, timeZone: string) {
  const f = new Intl.DateTimeFormat("en-US", {
    timeZone, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  });
  const parts = f.formatToParts(date);
  const part = (key: string) => Number(parts.find(x => x.type === key)?.value);
  return { year: part("year"), month: part("month"), day: part("day"),
    hour: part("hour"), minute: part("minute") };
}
function utcForWallTime(day: string, slot: SlotName, timeZone: string) {
  const [year, month, date] = day.split("-").map(Number);
  const [hour, minute] = slot.split(":").map(Number);
  const target = Date.UTC(year, month - 1, date, hour, minute);
  let candidate = new Date(target);
  for (let i = 0; i < 3; i++) {
    const p = localParts(candidate, timeZone);
    const wallUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute);
    candidate = new Date(candidate.getTime() - (wallUtc - target));
  }
  const p = localParts(candidate, timeZone);
  if (p.year !== year || p.month !== month || p.day !== date ||
      p.hour !== hour || p.minute !== minute) throw Error("ACCOUNT_SCHEDULE_DST_UNRESOLVED");
  return candidate.toISOString();
}
function validNonnegative(value: number) {
  return Number.isSafeInteger(value) && value >= 0 && value <= Number.MAX_SAFE_INTEGER;
}
function mustBeValidDate(day: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) ||
      new Date(day + "T00:00:00Z").toISOString().slice(0, 10) !== day) {
    throw Error("ACCOUNT_SCHEDULE_DATE_INVALID");
  }
}
export function planAccountPostingSchedule(input: {
  accountId: string;
  localDate: string;
  timeZone: string;
  plannedPins: number;
  evidence: readonly AccountPostingWindowEvidence[];
  now?: Date;
}): AccountPostingPlan {
  if (!/^[A-Za-z0-9_-]{1,191}$/.test(input.accountId) ||
      !Number.isSafeInteger(input.plannedPins) ||
      input.plannedPins < 0 || input.plannedPins > ACCOUNT_DAILY_WINDOWS.length) {
    throw Error("ACCOUNT_SCHEDULE_INPUT_INVALID");
  }
  mustBeValidDate(input.localDate);
  try { new Intl.DateTimeFormat("en-US", { timeZone: input.timeZone }).format(new Date()); }
  catch { throw Error("ACCOUNT_SCHEDULE_TIMEZONE_INVALID"); }
  const seen = new Set<string>();
  for (const row of input.evidence) {
    if (!ACCOUNT_DAILY_WINDOWS.includes(row.slot) || seen.has(row.slot) ||
        ![row.samplePins, row.impressions, row.outboundClicks, row.saves]
          .every(validNonnegative) ||
        row.outboundClicks > row.impressions || row.saves > row.impressions) {
      throw Error("ACCOUNT_SCHEDULE_EVIDENCE_INVALID");
    }
    seen.add(row.slot);
  }
  const now = input.now ?? new Date();
  if (Number.isNaN(now.getTime())) throw Error("ACCOUNT_SCHEDULE_DATE_INVALID");
  const data = new Map(input.evidence.map(row => [row.slot, row]));
  const scored = ACCOUNT_DAILY_WINDOWS.map(slot => {
    const row = data.get(slot);
    const qualified = Boolean(row && row.ready &&
      row.samplePins >= MIN_MATURE_PINS &&
      row.impressions >= MIN_MATURE_IMPRESSIONS);
    return { slot, qualified,
      quality: qualified
        ? ((row!.outboundClicks * 1.5 + row!.saves) / row!.impressions)
        : -1,
    };
  });
  const hasMatureEvidence = scored.some(s => s.qualified);
  const byQuality = [...scored].sort((a, b) => b.quality - a.quality ||
    hash(input.accountId + ":" + input.localDate + ":" + a.slot) -
    hash(input.accountId + ":" + input.localDate + ":" + b.slot));
  const seed = hash(input.accountId + ":" + input.localDate);
  // Keep a real exploration allocation for a subset of publication slots
  // even with mature evidence. No data: rotate through all ten slots.
  let chosen: typeof scored = [];
  if (!hasMatureEvidence) {
    const rotated = [...ACCOUNT_DAILY_WINDOWS.slice(seed % ACCOUNT_DAILY_WINDOWS.length),
      ...ACCOUNT_DAILY_WINDOWS.slice(0, seed % ACCOUNT_DAILY_WINDOWS.length)];
    chosen = rotated.slice(0, input.plannedPins).map(slot =>
      scored.find(s => s.slot === slot)!);
  } else {
    const exploit = Math.min(input.plannedPins, Math.floor(input.plannedPins * 0.8));
    const mature = byQuality.filter(s => s.qualified);
    const selected = mature.slice(0, exploit);
    const rest = byQuality.filter(s => !selected.includes(s))
      .sort((a, b) => a.quality - b.quality ||
        hash(input.accountId + input.localDate + a.slot) -
        hash(input.accountId + input.localDate + b.slot));
    chosen = [...selected, ...rest.slice(0, input.plannedPins - selected.length)];
  }
  const sorted = chosen.map((s, index) => {
    const time = utcForWallTime(input.localDate, s.slot, input.timeZone);
    return { ...s, time, ordinal: index };
  }).sort((a, b) => a.time.localeCompare(b.time));
  for (let i = 1; i < sorted.length; i++) {
    if (Date.parse(sorted[i].time) - Date.parse(sorted[i-1].time) <
        MIN_SEPARATION_MINUTES * 60_000) {
      throw Error("ACCOUNT_SCHEDULE_COLLISION");
    }
  }
  // Do not attempt to backdate an actual publication: an early candidate
  // can legitimately be omitted until next day's planning.
  const windows = sorted.filter(s => Date.parse(s.time) > now.getTime()).map(s => ({
    localTime: s.slot,
    scheduledAt: s.time,
    strategy: !hasMatureEvidence ? "COLD_START" as const :
      s.ordinal < Math.min(input.plannedPins, Math.floor(input.plannedPins * 0.8)) &&
        s.qualified ? "EXPLOIT" as const : "EXPLORE" as const,
    qualified: s.qualified,
  }));
  return {
    accountId: input.accountId, timeZone: input.timeZone,
    localDate: input.localDate,
    evidence: hasMatureEvidence ? "QUALIFIED" : "COLD_START",
    windows, explicitlyApprovedPins: 0,
  };
}
