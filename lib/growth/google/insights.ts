import { z } from "zod";

import {
  GoogleAnalyticsError,
  googleAnalyticsConfig,
  obtainGoogleAnalyticsToken,
} from "@/lib/growth/google/provider";
import { prisma } from "@/lib/prisma";

/**
 * Richer, read-only Google reads that make the daily briefing useful:
 * GA4 traffic by source and host, translation events, top landing pages, and
 * Search Console top queries and pages. Each is stored as one JSON row per
 * date in GrowthExternalAnalyticsDaily under its own `source` label.
 */
export const INSIGHT_SOURCES = ["GA4_SOURCES", "GA4_EVENTS", "GA4_PAGES", "GSC_QUERIES", "GSC_PAGES"] as const;
export type InsightSource = (typeof INSIGHT_SOURCES)[number];

/**
 * The table only accepts the provider sources GA4 and SEARCH_CONSOLE (database
 * check constraint), and the basic sync owns the plain account ids. Insight rows
 * therefore live under the same provider source with a suffixed account id, so
 * the basic sync never overwrites or flags them.
 */
export function insightStorage(kind: InsightSource, baseAccountId: string) {
  const provider = kind.startsWith("GA4") ? "GA4" : "SEARCH_CONSOLE";
  return { source: provider, accountId: baseAccountId + "#" + kind.split("_")[1].toLowerCase() };
}

export const TRANSLATION_EVENT_NAME = "translation_completed";

/** First full UTC day on which the site sends the translation event. Earlier days have no tracking, so they must show "n/a", not zero. */
export const TRANSLATION_TRACKING_START = "2026-11-23";

const num = z.string().regex(/^\d{1,16}(?:\.\d{1,8})?$/);

async function post(url: string, body: unknown, token: string, fetcher: typeof fetch) {
  let response: Response;
  try {
    response = await fetcher(url, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: "Bearer " + token },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(20000),
      redirect: "error",
      cache: "no-store",
    });
  } catch {
    throw new GoogleAnalyticsError("TRANSIENT");
  }
  if (!response.ok) {
    throw new GoogleAnalyticsError(
      response.status === 401 || response.status === 403 ? "AUTHORIZATION" : response.status === 429 ? "RATE_LIMIT" : "TRANSIENT",
    );
  }
  try {
    return (await response.json()) as unknown;
  } catch {
    throw new GoogleAnalyticsError("INVALID_DATA");
  }
}

const ga4Report = z.object({
  rows: z
    .array(z.object({ dimensionValues: z.array(z.object({ value: z.string() })).default([]), metricValues: z.array(z.object({ value: num })) }))
    .optional(),
});

async function ga4(
  property: string,
  token: string,
  date: string,
  dimensions: string[],
  metrics: string[],
  fetcher: typeof fetch,
  extra: Record<string, unknown> = {},
) {
  const raw = await post(
    "https://analyticsdata.googleapis.com/v1beta/properties/" + property + ":runReport",
    {
      dateRanges: [{ startDate: date, endDate: date }],
      dimensions: dimensions.map((name) => ({ name })),
      metrics: metrics.map((name) => ({ name })),
      limit: "50",
      ...extra,
    },
    token,
    fetcher,
  );
  const parsed = ga4Report.safeParse(raw);
  if (!parsed.success) throw new GoogleAnalyticsError("INVALID_DATA");
  return (parsed.data.rows ?? []).map((row) => ({
    dims: row.dimensionValues.map((v) => v.value),
    vals: row.metricValues.map((v) => Number(v.value)),
  }));
}

export async function readGa4Insights(property: string, token: string, date: string, fetcher: typeof fetch = fetch) {
  const [totals, sources, hosts, events, pages] = await Promise.all([
    ga4(property, token, date, [], ["sessions", "activeUsers", "keyEvents"], fetcher),
    ga4(property, token, date, ["sessionSource", "sessionMedium"], ["sessions", "activeUsers"], fetcher, {
      orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
      limit: "15",
    }),
    ga4(property, token, date, ["hostName"], ["sessions", "activeUsers"], fetcher, {
      orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
      limit: "5",
    }),
    ga4(property, token, date, ["eventName", "sessionSource"], ["eventCount"], fetcher, {
      dimensionFilter: { filter: { fieldName: "eventName", stringFilter: { matchType: "EXACT", value: TRANSLATION_EVENT_NAME } } },
      limit: "15",
    }),
    ga4(property, token, date, ["landingPage"], ["sessions", "activeUsers"], fetcher, {
      orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
      limit: "12",
    }),
  ]);
  return {
    GA4_SOURCES: {
      totals: { sessions: totals[0]?.vals[0] ?? 0, users: totals[0]?.vals[1] ?? 0, keyEvents: totals[0]?.vals[2] ?? 0 },
      sources: sources.map((r) => ({ source: r.dims[0], medium: r.dims[1], sessions: r.vals[0], users: r.vals[1] })),
      hosts: hosts.map((r) => ({ host: r.dims[0], sessions: r.vals[0], users: r.vals[1] })),
    },
    GA4_EVENTS: {
      translations: events.reduce((sum, r) => sum + r.vals[0], 0),
      bySource: events.map((r) => ({ source: r.dims[1], count: r.vals[0] })),
    },
    GA4_PAGES: { pages: pages.map((r) => ({ page: r.dims[0].slice(0, 160), sessions: r.vals[0], users: r.vals[1] })) },
  };
}

const gscRows = z.object({
  rows: z
    .array(z.object({ keys: z.array(z.string()), clicks: z.number(), impressions: z.number(), ctr: z.number(), position: z.number() }))
    .optional(),
});

export async function readSearchConsoleInsights(site: string, token: string, date: string, fetcher: typeof fetch = fetch) {
  const url = "https://www.googleapis.com/webmasters/v3/sites/" + encodeURIComponent(site) + "/searchAnalytics/query";
  const query = async (dimension: "query" | "page") => {
    const raw = await post(
      url,
      { startDate: date, endDate: date, dimensions: [dimension], type: "web", dataState: "final", rowLimit: 15 },
      token,
      fetcher,
    );
    const parsed = gscRows.safeParse(raw);
    if (!parsed.success) throw new GoogleAnalyticsError("INVALID_DATA");
    return (parsed.data.rows ?? []).map((r) => ({
      key: r.keys[0].slice(0, 160),
      clicks: r.clicks,
      impressions: r.impressions,
      position: Math.round(r.position * 10) / 10,
    }));
  };
  const [queries, pages] = await Promise.all([query("query"), query("page")]);
  return { GSC_QUERIES: { rows: queries }, GSC_PAGES: { rows: pages } };
}

function isoDay(offsetDays: number, now: Date) {
  return new Date(now.getTime() - offsetDays * 86400000).toISOString().slice(0, 10);
}

/** Stores insight rows for each date in the window (idempotent upsert). */
export async function collectGoogleInsights(
  now = new Date(),
  env: Record<string, string | undefined> = process.env,
  options: { days?: number; fetcher?: typeof fetch } = {},
) {
  const fetcher = options.fetcher ?? fetch;
  const config = googleAnalyticsConfig(env);
  const days = Math.min(Math.max(options.days ?? 3, 1), 45);
  const stored: Record<string, number> = {};
  const errors: string[] = [];

  const save = async (kind: InsightSource, baseAccountId: string, date: string, tz: string, metrics: unknown) => {
    const metricDate = new Date(date + "T00:00:00.000Z");
    const { source, accountId } = insightStorage(kind, baseAccountId);
    await prisma.growthExternalAnalyticsDaily.upsert({
      where: { source_accountId_metricDate: { source, accountId, metricDate } },
      create: { source, accountId, metricDate, providerTimeZone: tz, metrics: metrics as object, qualityFlags: ["PROVIDER_DATE_LABEL"] },
      update: { metrics: metrics as object, providerTimeZone: tz, fetchedAt: new Date() },
    });
    stored[kind] = (stored[kind] ?? 0) + 1;
  };

  if (config.propertyId) {
    const token = await obtainGoogleAnalyticsToken(config, "GA4", fetcher, now);
    for (let i = 1; i <= days; i += 1) {
      const date = isoDay(i, now);
      try {
        const data = await readGa4Insights(config.propertyId, token, date, fetcher);
        for (const source of ["GA4_SOURCES", "GA4_EVENTS", "GA4_PAGES"] as const) await save(source, config.propertyId, date, "property-timezone", data[source]);
      } catch (error) {
        errors.push(`GA4 ${date}: ${error instanceof Error ? error.message : "error"}`);
      }
    }
  }
  if (config.site) {
    const token = await obtainGoogleAnalyticsToken(config, "SEARCH_CONSOLE", fetcher, now);
    // Search Console finalizes data about two days late.
    for (let i = 2; i <= days + 2; i += 1) {
      const date = isoDay(i, now);
      try {
        const data = await readSearchConsoleInsights(config.site, token, date, fetcher);
        await save("GSC_QUERIES", config.site, date, "America/Los_Angeles", data.GSC_QUERIES);
        await save("GSC_PAGES", config.site, date, "America/Los_Angeles", data.GSC_PAGES);
      } catch (error) {
        errors.push(`GSC ${date}: ${error instanceof Error ? error.message : "error"}`);
      }
    }
  }
  return { stored, errors };
}
