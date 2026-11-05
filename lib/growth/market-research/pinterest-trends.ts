import { z } from "zod";
import { GrowthPinterestConnectionStatus, GrowthPinterestPublicationRole } from "@prisma/client";

import { recordGrowthActivity } from "@/lib/growth/activity";
import { GrowthActivityActorKind } from "@prisma/client";
import { requirePinterestConfiguration } from "@/lib/growth/pinterest/config";
import { budgetedPinterestFetch } from "@/lib/growth/pinterest/global-budget";
import { getValidPinterestAccessToken } from "@/lib/growth/pinterest/tokens";
import { prisma } from "@/lib/prisma";

/**
 * A real, bounded official Pinterest Trends source. Enterprise/partner access
 * may be unavailable. Both the explicit flag and account OAuth access are
 * required; never scrape Pinterest Trends as a substitute.
 *
 * Each admitted call consumes the existing GLOBAL provider throttle and an
 * additional once-per-24-hour market research reservation, even if it fails.
 * This module never writes Pins, modifies account status or starts Growth.
 */
const trendSchema = z.object({
  keyword: z.string().trim().min(2).max(120),
  pct_growth_wow: z.number().min(-10001).max(10001).nullable().optional(),
  pct_growth_mom: z.number().min(-10001).max(10001).nullable().optional(),
  pct_growth_yoy: z.number().min(-10001).max(10001).nullable().optional(),
}).passthrough();
const trendsSchema = z.object({ trends: z.array(trendSchema).max(50) }).passthrough();

export type MarketTrend = {
  keyword: string;
  weekOverWeek: number | null;
  monthOverMonth: number | null;
  yearOverYear: number | null;
  provider: "PINTEREST_TRENDS";
  region: "US";
  observedAt: string;
};

export class MarketResearchUnavailable extends Error {
  constructor(readonly reason:
    | "DISABLED" | "PROVIDER_ACCESS_NOT_CONFIRMED" | "ACCOUNT_UNAVAILABLE"
    | "ALREADY_RESEARCHED" | "API_ACCESS_DENIED" | "PROVIDER_ERROR") {
    super(reason);
  }
}

const RESERVATION_TYPE = "GrowthMarketResearch";
const RESERVED_ACTION = "PINTEREST_TRENDS_DAILY_GET_RESERVED";
const DAY_MS = 24 * 60 * 60 * 1_000;

async function reserveDailyMarketGet() {
  return prisma.$transaction(async tx => {
    const locked = await tx.$queryRaw<Array<{ id: string }>>`SELECT "id" FROM "GrowthSettings" WHERE "id" = 'global' FOR UPDATE`;
    if (locked.length !== 1) throw new MarketResearchUnavailable("PROVIDER_ERROR");
    const existing = await tx.growthActivity.count({
      where: {
        entityType: RESERVATION_TYPE, entityId: "US:growing",
        action: RESERVED_ACTION,
        createdAt: { gte: new Date(Date.now() - DAY_MS) },
      },
    });
    if (existing) throw new MarketResearchUnavailable("ALREADY_RESEARCHED");
    await recordGrowthActivity({
      actorKind: GrowthActivityActorKind.SYSTEM,
      entityType: RESERVATION_TYPE, entityId: "US:growing",
      action: RESERVED_ACTION,
      summary: { source: "PINTEREST_OFFICIAL_TRENDS", region: "US", limit: 20 },
    }, tx);
  });
}

export async function fetchAuthorizedPinterestMarketTrends(
  options: { transport?: typeof fetch; now?: Date } = {},
): Promise<MarketTrend[]> {
  if (process.env.GROWTH_MARKET_RESEARCH_ENABLED !== "true") {
    throw new MarketResearchUnavailable("DISABLED");
  }
  if (process.env.GROWTH_PINTEREST_TRENDS_ACCESS_APPROVED !== "true") {
    throw new MarketResearchUnavailable("PROVIDER_ACCESS_NOT_CONFIRMED");
  }
  const config = requirePinterestConfiguration();
  if (config.apiEnvironment !== "PRODUCTION") {
    throw new MarketResearchUnavailable("ACCOUNT_UNAVAILABLE");
  }
  const account = await prisma.growthPinterestAccount.findFirst({
    where: {
      activeRole: GrowthPinterestPublicationRole.SAYTWIST,
      connectionStatus: GrowthPinterestConnectionStatus.CONNECTED,
      apiEnvironment: "PRODUCTION",
    },
    select: { id: true, grantedScopes: true },
  });
  if (!account || !account.grantedScopes.includes("user_accounts:read")) {
    throw new MarketResearchUnavailable("ACCOUNT_UNAVAILABLE");
  }

  // An OAuth refresh, if required, is separately charged by the shared
  // Pinterest provider budget, and no provider request occurs without a token.
  const token = await getValidPinterestAccessToken(account.id, options.transport);
  await reserveDailyMarketGet();
  const url = config.apiBaseUrl +
    "/trends/keywords/US/top/growing?limit=20";
  let response: Response;
  try {
    response = await budgetedPinterestFetch(url, {
      method: "GET",
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      signal: AbortSignal.timeout(10_000),
      redirect: "error",
    }, options.transport || fetch);
  } catch (error) {
    if (error instanceof MarketResearchUnavailable) throw error;
    throw new MarketResearchUnavailable("PROVIDER_ERROR");
  }
  // 403 on enterprise-limited Trends must NOT disconnect valid Pinterest OAuth.
  if (response.status === 403 || response.status === 401) {
    throw new MarketResearchUnavailable("API_ACCESS_DENIED");
  }
  if (!response.ok) throw new MarketResearchUnavailable("PROVIDER_ERROR");
  const raw: unknown = await response.json().catch(() => null);
  const parsed = trendsSchema.safeParse(raw);
  if (!parsed.success) throw new MarketResearchUnavailable("PROVIDER_ERROR");
  const observedAt = (options.now || new Date()).toISOString();
  const deduped = new Set<string>();
  const trends: MarketTrend[] = [];
  for (const t of parsed.data.trends) {
    const key = t.keyword.replace(/\s+/g, " ").trim().toLowerCase();
    if (deduped.has(key)) continue;
    deduped.add(key);
    trends.push({
      keyword: t.keyword.replace(/\s+/g, " ").trim(),
      weekOverWeek: t.pct_growth_wow ?? null,
      monthOverMonth: t.pct_growth_mom ?? null,
      yearOverYear: t.pct_growth_yoy ?? null,
      provider: "PINTEREST_TRENDS", region: "US", observedAt,
    });
  }
  return trends;
}
