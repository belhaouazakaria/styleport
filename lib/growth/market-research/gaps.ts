import { GrowthActivityActorKind } from "@prisma/client";
import { recordGrowthActivity } from "@/lib/growth/activity";
import { prisma } from "@/lib/prisma";
import type { MarketTrend } from "./pinterest-trends";

export type ResearchRole = "SAYTWIST" | "SAYTWIST_IDEAS" | "SAYTWIST_PLAYGROUND";
export type MarketGap = {
  keyword: string;
  topicKey: string;
  role: ResearchRole;
  suggestedKind: "TRANSLATOR" | "IDEA";
  marketGrowthWeek: number | null;
  evidenceScore: number;
  source: "PINTEREST_TRENDS";
  status: "PROPOSED_FOR_EDITORIAL_REVIEW";
  rationale: "MARKET_GAP" | "POSSIBLE_GAP_VERIFY";
};

export type MarketDiscoveryReport = {
  modelVersion: "market_discovery_v1";
  observedAt: string;
  region: "US";
  source: "PINTEREST_TRENDS";
  inspected: number;
  filteredUnrelated: number;
  coveredAlready: number;
  signals: MarketGap[];
  createsNewContent: false;
  publishesPins: false;
};

const intentRules: Array<{ test: RegExp; role: ResearchRole; kind: "TRANSLATOR" | "IDEA" }> = [
  { test: /\b(quiz|personality|game|funny|meme|challenge|decode|guess|gen alpha)\b/i,
    role: "SAYTWIST_PLAYGROUND", kind: "IDEA" },
  { test: /\b(caption|quote|message|birthday|greeting|good morning|good night|conversation|reply|replies|texting|flirt|compliment|bio ideas|wedding vows)\b/i,
    role: "SAYTWIST_IDEAS", kind: "IDEA" },
  { test: /\b(slang|gen z|rewrite|rewriting|writing style|translator|tone|polite wording|formal writing|old english|shakespeare)\b/i,
    role: "SAYTWIST", kind: "TRANSLATOR" },
];
const noise = new Set(["text","texts","translator","translation","ideas","idea",
  "pinterest","saytwist","popular","best","new","funny","message","messages",
  "quotes","quote","style","styles","trend","trends","the","and","for","with"]);
function tokens(value: string): Set<string> {
  return new Set(value.toLowerCase().replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/).filter(t => t.length >= 3 && !noise.has(t)));
}
function normalized(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}
function materiallySimilar(a: string, b: string) {
  const x = tokens(a), y = tokens(b);
  if (!x.size || !y.size) return normalized(a) === normalized(b);
  let shared = 0;
  for (const t of x) if (y.has(t)) shared++;
  const min = Math.min(x.size, y.size);
  return shared / min >= 0.85 && shared / Math.max(x.size, y.size) >= 0.5;
}
function growthScore(trend: MarketTrend) {
  const g = trend.weekOverWeek ?? trend.monthOverMonth ?? trend.yearOverYear;
  if (g === null || g <= 0) return 0;
  return Math.min(35, Math.floor(Math.log2(1 + g) * 5));
}
function safeTopic(raw: string) {
  // Search query strings are untrusted data, never executable instructions.
  if (/\b(ignore (previous|all) instructions|system prompt|javascript:|data:|https?:\/\/|@|<script)\b/i.test(raw)) {
    return null;
  }
  const trimmed = raw.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
  if (trimmed.length < 4 || trimmed.length > 90) return null;
  return trimmed;
}

/**
 * Compare independently sourced market demand to existing SayTwist catalog.
 * Strictly advisory: keyword interest is not evidence of article quality,
 * achievable traffic or demand for a particular translator.
 */
export function evaluateMarketGaps(input: {
  trends: readonly MarketTrend[];
  translatorTitles: readonly string[];
  ideaTitles: readonly string[];
  now: Date;
}): MarketDiscoveryReport {
  if (input.trends.length > 50 || input.translatorTitles.length > 2_000 ||
      input.ideaTitles.length > 2_000 || !Number.isFinite(input.now.getTime())) {
    throw Error("MARKET_INPUT_EXCEEDS_LIMIT");
  }
  let filteredUnrelated = 0, coveredAlready = 0;
  const seen = new Set<string>();
  const signals: MarketGap[] = [];
  for (const trend of input.trends) {
    if (trend.provider !== "PINTEREST_TRENDS" || trend.region !== "US") {
      throw Error("MARKET_SOURCE_UNTRUSTED");
    }
    const observed = new Date(trend.observedAt);
    const age = input.now.getTime() - observed.getTime();
    if (!Number.isFinite(observed.getTime()) || age < -5 * 60_000 ||
        age > 48 * 60 * 60_000) {
      throw Error("MARKET_EVIDENCE_STALE");
    }
    const keyword = safeTopic(trend.keyword);
    if (!keyword || seen.has(normalized(keyword))) {
      filteredUnrelated++;
      continue;
    }
    seen.add(normalized(keyword));
    const rule = intentRules.find(x => x.test.test(keyword));
    if (!rule) { filteredUnrelated++; continue; }
    if ((trend.weekOverWeek ?? 0) <= 0 && (trend.monthOverMonth ?? 0) <= 0 &&
        (trend.yearOverYear ?? 0) <= 0) {
      filteredUnrelated++;
      continue;
    }
    const catalog = [...input.translatorTitles, ...input.ideaTitles];
    if (catalog.some(existing => materiallySimilar(existing, keyword))) {
      coveredAlready++;
      continue;
    }
    if (signals.some(x => materiallySimilar(x.keyword, keyword))) continue;
    const score = Math.min(85, 35 + growthScore(trend) + Math.min(15, tokens(keyword).size * 3));
    const key = normalized(keyword).replace(/\s+/g, "-").slice(0, 80);
    signals.push({
      keyword, topicKey: key, role: rule.role, suggestedKind: rule.kind,
      marketGrowthWeek: trend.weekOverWeek,
      evidenceScore: score,
      source: "PINTEREST_TRENDS",
      status: "PROPOSED_FOR_EDITORIAL_REVIEW",
      rationale: score >= 65 ? "MARKET_GAP" : "POSSIBLE_GAP_VERIFY",
    });
  }
  signals.sort((a, b) => b.evidenceScore - a.evidenceScore ||
    a.keyword.localeCompare(b.keyword));
  return {
    modelVersion: "market_discovery_v1",
    observedAt: input.now.toISOString(), region: "US", source: "PINTEREST_TRENDS",
    inspected: input.trends.length, filteredUnrelated, coveredAlready,
    signals: signals.slice(0, 12),
    createsNewContent: false, publishesPins: false,
  };
}

/**
 * Read current catalog (including inactive/archived rows) so previously
 * authored content cannot be mistaken for an unexplored market gap.
 */
export async function evaluateAndArchiveMarketTrends(
  trends: readonly MarketTrend[],
  now = new Date(),
): Promise<MarketDiscoveryReport> {
  const [translators, ideas] = await Promise.all([
    prisma.translator.findMany({
      select: { name: true, title: true, slug: true },
      orderBy: { id: "asc" }, take: 2000,
    }),
    prisma.growthIdea.findMany({
      select: { seoTitle: true, slug: true },
      orderBy: { id: "asc" }, take: 2000,
    }),
  ]);
  const report = evaluateMarketGaps({
    trends, now,
    translatorTitles: translators.flatMap(x => [x.name, x.title, x.slug]),
    ideaTitles: ideas.flatMap(x => [x.seoTitle, x.slug]),
  });
  // Stored evidence is deliberately capped to fit GrowthActivity (8 KiB).
  await recordGrowthActivity({
    actorKind: GrowthActivityActorKind.SYSTEM,
    entityType: "GrowthMarketResearch",
    entityId: "US:growing",
    action: "MARKET_DISCOVERY_REVIEW_READY",
    summary: {
      modelVersion: report.modelVersion, observedAt: report.observedAt,
      source: report.source, inspected: report.inspected,
      filteredUnrelated: report.filteredUnrelated,
      coveredAlready: report.coveredAlready,
      signals: report.signals.slice(0, 6).map(x => ({
        keyword: x.keyword.slice(0, 75), role: x.role,
        suggestedKind: x.suggestedKind,
        evidenceScore: x.evidenceScore,
      })),
      autonomousContentCreation: false,
      publicationAllowed: false,
    },
  });
  return report;
}
