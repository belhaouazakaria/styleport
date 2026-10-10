import { createHash } from "node:crypto";
import { GrowthPublicationTimingMode } from "@prisma/client";

export const CONTROLLED_LOCAL_HOURS = [9, 13, 18, 21] as const;
export const PUBLISHING_TIME_ZONE = "America/New_York";
const MIN_SLOT_PINS = 3;
const MIN_SLOT_IMPRESSIONS = BigInt(300);

type HistoricalPin = { publishedAt: Date | null; impressions: bigint | number | null; outboundClicks: bigint | number | null; saves: bigint | number | null };
type Collision = { scheduledAt: Date };

function number(value: bigint | number | null) { return value == null ? 0 : Number(value); }
function localParts(date: Date) {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: PUBLISHING_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23" }).formatToParts(date);
  const value = (type: string) => Number(parts.find((part) => part.type === type)?.value);
  return { year: value("year"), month: value("month"), day: value("day"), hour: value("hour") };
}
function offsetMilliseconds(date: Date) {
  const p = localParts(date);
  return Date.UTC(p.year, p.month - 1, p.day, p.hour) - date.getTime();
}
function localToUtc(year: number, month: number, day: number, hour: number) {
  const guess = new Date(Date.UTC(year, month - 1, day, hour));
  let result = new Date(guess.getTime() - offsetMilliseconds(guess));
  result = new Date(guess.getTime() - offsetMilliseconds(result));
  return result;
}
function nextSlot(hour: number, after: Date) {
  const p = localParts(after);
  let result = localToUtc(p.year, p.month, p.day, hour);
  if (result <= after) result = localToUtc(p.year, p.month, p.day + 1, hour);
  return result;
}
function closestControlledHour(hour: number) {
  return CONTROLLED_LOCAL_HOURS.reduce((best, candidate) => Math.abs(candidate - hour) < Math.abs(best - hour) ? candidate : best);
}
function hashNumber(key: string) { return Number.parseInt(createHash("sha256").update(key).digest("hex").slice(0, 8), 16); }

export function planPublicationTiming(input: { stableKey: string; now: Date; history: HistoricalPin[]; collisions?: Collision[] }) {
  const buckets = new Map(CONTROLLED_LOCAL_HOURS.map((hour) => [hour, { hour, pins: 0, impressions: 0, outboundClicks: 0, saves: 0 }]));
  for (const pin of input.history.slice(0, 500)) {
    if (!pin.publishedAt || pin.publishedAt < new Date(input.now.getTime() - 90 * 86_400_000)) continue;
    const bucket = buckets.get(closestControlledHour(localParts(pin.publishedAt).hour))!;
    bucket.pins += 1; bucket.impressions += number(pin.impressions); bucket.outboundClicks += number(pin.outboundClicks); bucket.saves += number(pin.saves);
  }
  const scored = [...buckets.values()].map((bucket) => ({ ...bucket, qualified: bucket.pins >= MIN_SLOT_PINS && BigInt(Math.trunc(bucket.impressions)) >= MIN_SLOT_IMPRESSIONS, ctr: bucket.impressions ? bucket.outboundClicks / bucket.impressions : 0, saveRate: bucket.impressions ? bucket.saves / bucket.impressions : 0 }));
  const qualified = scored.filter((slot) => slot.qualified).sort((a, b) => b.ctr - a.ctr || b.saveRate - a.saveRate || a.hour - b.hour);
  const seed = hashNumber(input.stableKey);
  let mode: GrowthPublicationTimingMode;
  let selectedHour: number;
  if (!qualified.length) {
    mode = GrowthPublicationTimingMode.COLD_START;
    selectedHour = CONTROLLED_LOCAL_HOURS[seed % CONTROLLED_LOCAL_HOURS.length];
  } else if (seed % 10 < 8) {
    mode = GrowthPublicationTimingMode.EXPLOIT;
    selectedHour = qualified[0].hour;
  } else {
    mode = GrowthPublicationTimingMode.EXPLORE;
    const alternatives = scored.filter((slot) => slot.hour !== qualified[0].hour).sort((a, b) => a.pins - b.pins || a.hour - b.hour);
    selectedHour = alternatives[seed % alternatives.length].hour;
  }
  let scheduledAt = nextSlot(selectedHour, input.now);
  let collisionMoves = 0;
  while ((input.collisions || []).some((row) => Math.abs(row.scheduledAt.getTime() - scheduledAt.getTime()) < 90 * 60_000) && collisionMoves < 8) {
    const index = CONTROLLED_LOCAL_HOURS.indexOf(selectedHour as typeof CONTROLLED_LOCAL_HOURS[number]);
    selectedHour = CONTROLLED_LOCAL_HOURS[(index + 1) % CONTROLLED_LOCAL_HOURS.length];
    scheduledAt = nextSlot(selectedHour, new Date(scheduledAt.getTime() + 1));
    collisionMoves += 1;
  }
  return { scheduledAt, mode, evidence: { timeZone: PUBLISHING_TIME_ZONE, selectedLocalHour: selectedHour, historyPins: input.history.slice(0, 500).length, qualifiedSlots: qualified.map((slot) => ({ hour: slot.hour, pins: slot.pins, impressions: slot.impressions, outboundCtr: Number(slot.ctr.toFixed(6)), saveRate: Number(slot.saveRate.toFixed(6)) })), collisionMoves } };
}
