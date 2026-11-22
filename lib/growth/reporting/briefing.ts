import { insightStorage, TRANSLATION_TRACKING_START, type InsightSource } from "@/lib/growth/google/insights";
import { prisma } from "@/lib/prisma";

/** Everything the daily briefing needs for one UTC date. Null means "not available", never zero. */
export interface BriefingData {
  date: string;
  pinterest: {
    accountsReady: number;
    accountsTotal: number;
    impressions: number | null;
    saves: number | null;
    outboundClicks: number | null;
    previousOutboundClicks: number | null;
    avg7OutboundClicks: number | null;
  };
  site: {
    sessions: number | null;
    users: number | null;
    keyEvents: number | null;
    previousSessions: number | null;
    avg7Sessions: number | null;
    pinterestSessions: number | null;
    translations: number | null;
    translationsTrackingSince: string | null;
    hosts: Array<{ host: string; sessions: number }>;
    topPages: Array<{ page: string; sessions: number }>;
  };
  search: {
    clicks: number | null;
    impressions: number | null;
    position: number | null;
    clicks7: number | null;
    impressions7: number | null;
    topQueries7: Array<{ query: string; clicks: number; impressions: number; position: number }>;
  };
  ops: { pinsPublished: number; translatorsCreated: number; ideasCreated: number };
}

const DAY = 86_400_000;
const utc = (date: string) => new Date(date + "T00:00:00.000Z");

export function percentChange(current: number | null, previous: number | null): string {
  if (current === null || previous === null) return "n/a";
  if (previous === 0) return current === 0 ? "flat" : "new";
  const pct = Math.round(((current - previous) / previous) * 100);
  return pct === 0 ? "flat" : (pct > 0 ? "+" : "") + pct + "%";
}

const fmt = (n: number | null, digits = 0) =>
  n === null || !Number.isFinite(n) ? "n/a" : n.toLocaleString("en-US", { maximumFractionDigits: digits });

export function formatBriefing(data: BriefingData): string {
  const d = new Date(data.date + "T00:00:00Z");
  const label = d.toLocaleDateString("en-US", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
  const lines: string[] = [`**SayTwist daily briefing · ${label}** (UTC, final data)`, ""];

  const s = data.site;
  if (s.sessions !== null) {
    lines.push(
      `**Website (GA4)** ${fmt(s.sessions)} sessions (${percentChange(s.sessions, s.previousSessions)} vs prev day, 7-day avg ${fmt(s.avg7Sessions)}) · ${fmt(s.users)} users`,
    );
    const mirror = s.hosts.length > 1 ? " · " + s.hosts.slice(0, 3).map((h) => `${h.host.replace(/^www\./, "")} ${fmt(h.sessions)}`).join(", ") : "";
    if (mirror) lines.push(`Domains${mirror}`);
    lines.push(
      s.translations !== null
        ? `Translations: **${fmt(s.translations)}**${s.sessions ? ` (${((s.translations / s.sessions) * 100).toFixed(0)} per 100 sessions)` : ""}`
        : `Translations: tracking starts ${s.translationsTrackingSince ?? "after the next deploy"}, counts appear once visitors translate`,
    );
  } else {
    lines.push("**Website (GA4)** unavailable for this date");
  }

  const p = data.pinterest;
  lines.push(
    p.outboundClicks !== null
      ? `**Pinterest** ${fmt(p.impressions)} impressions · ${fmt(p.saves)} saves · **${fmt(p.outboundClicks)} outbound clicks** (${percentChange(p.outboundClicks, p.previousOutboundClicks)} vs prev, 7-day avg ${fmt(p.avg7OutboundClicks, 1)})` +
          (s.pinterestSessions !== null ? ` → GA4 saw ${fmt(s.pinterestSessions)} Pinterest sessions` : "")
      : `**Pinterest** data not final yet (${p.accountsReady}/${p.accountsTotal} accounts ready)`,
  );

  const q = data.search;
  if (q.impressions !== null || q.impressions7 !== null) {
    lines.push(
      `**Google Search** ${fmt(q.clicks)} clicks · ${fmt(q.impressions)} impressions${q.position ? ` · avg pos ${fmt(q.position, 1)}` : ""} | 7 days: ${fmt(q.clicks7)} clicks, ${fmt(q.impressions7)} impressions`,
    );
    if (q.topQueries7.length)
      lines.push("Top queries (7d): " + q.topQueries7.slice(0, 3).map((x) => `${x.query} (${fmt(x.impressions)} imp, pos ${fmt(x.position, 1)})`).join("; "));
  } else {
    lines.push("**Google Search** unavailable for this date");
  }

  if (s.topPages.length) lines.push("Top landing pages: " + s.topPages.slice(0, 3).map((x) => `${x.page} (${fmt(x.sessions)})`).join("; "));
  lines.push(`**Growth ops** ${data.ops.pinsPublished} Pins published · ${data.ops.translatorsCreated} translators · ${data.ops.ideasCreated} Ideas created`);

  const next = nextAction(data);
  if (next) lines.push("", `**Next:** ${next}`);
  return lines.join("\n");
}

export function nextAction(data: BriefingData): string | null {
  const { site, pinterest, search } = data;
  if (site.translations === null) return "Mark translation_completed as a key event in GA4 once it appears, so conversions are counted.";
  if (pinterest.outboundClicks !== null && pinterest.outboundClicks >= 20 && site.pinterestSessions !== null && site.pinterestSessions < pinterest.outboundClicks * 0.4)
    return "Pinterest clicks are not arriving as sessions (under 40%). Check Pin destination links and redirects.";
  if (site.translations !== null && site.sessions && site.translations / site.sessions < 0.1)
    return "Fewer than 10 translations per 100 sessions. Look at the top landing pages and make the translate box easier to reach.";
  if (search.topQueries7.length && search.topQueries7[0].position > 10)
    return `"${search.topQueries7[0].query}" ranks around position ${Math.round(search.topQueries7[0].position)}. Improve that page and request indexing.`;
  return null;
}

export async function loadBriefingData(date: string): Promise<BriefingData> {
  const start = utc(date);
  const end = new Date(start.getTime() + DAY);
  const prev = new Date(start.getTime() - DAY);
  const week = new Date(start.getTime() - 7 * DAY);

  const accounts = await prisma.growthPinterestAccount.count({ where: { connectionStatus: { not: "DISCONNECTED" } } });
  const dayRows = await prisma.growthPinterestAccountMetricDaily.findMany({
    where: { metricDate: { gte: start, lt: end }, dataStatus: "READY", account: { connectionStatus: { not: "DISCONNECTED" } } },
    select: { impressions: true, saves: true, outboundClicks: true },
  });
  const prevRows = await prisma.growthPinterestAccountMetricDaily.findMany({
    where: { metricDate: { gte: prev, lt: start }, dataStatus: "READY", account: { connectionStatus: { not: "DISCONNECTED" } } },
    select: { outboundClicks: true },
  });
  const weekRows = await prisma.growthPinterestAccountMetricDaily.groupBy({
    by: ["metricDate"],
    where: { metricDate: { gte: week, lt: start }, dataStatus: "READY", account: { connectionStatus: { not: "DISCONNECTED" } } },
    _sum: { outboundClicks: true },
  });
  const complete = accounts > 0 && dayRows.length === accounts;
  const sum = (rows: Array<{ [k: string]: bigint }>, key: string) => rows.reduce((a, r) => a + Number(r[key]), 0);

  const property =
    (await prisma.growthExternalAnalyticsDaily.findFirst({ where: { source: "GA4", NOT: { accountId: { contains: "#" } } }, select: { accountId: true } }))?.accountId ?? null;
  const insight = (kind: InsightSource) => ({ ...insightStorage(kind, property ?? "") });
  const sources = property ? await prisma.growthExternalAnalyticsDaily.findFirst({ where: { ...insight("GA4_SOURCES"), metricDate: start } }) : null;
  const events = property ? await prisma.growthExternalAnalyticsDaily.findFirst({ where: { ...insight("GA4_EVENTS"), metricDate: start } }) : null;
  const pages = property ? await prisma.growthExternalAnalyticsDaily.findFirst({ where: { ...insight("GA4_PAGES"), metricDate: start } }) : null;
  // Daily GA4 totals come from the collector's own rows (fresh), falling back to the basic sync.
  const totalsRows = property
    ? await prisma.growthExternalAnalyticsDaily.findMany({
        where: { ...insight("GA4_SOURCES"), metricDate: { gte: week, lt: end } },
        select: { metricDate: true, metrics: true },
      })
    : [];
  const basicRows = property
    ? await prisma.growthExternalAnalyticsDaily.findMany({ where: { source: "GA4", accountId: property, metricDate: { gte: week, lt: end } }, select: { metricDate: true, metrics: true } })
    : [];
  const totalsFor = (day: Date) => {
    const t = totalsRows.find((r) => r.metricDate.getTime() === day.getTime())?.metrics as { totals?: { sessions: number; users: number; keyEvents: number } } | undefined;
    if (t?.totals) return t.totals;
    const b = basicRows.find((r) => r.metricDate.getTime() === day.getTime())?.metrics as Record<string, string> | undefined;
    return b ? { sessions: Number(b.sessions), users: Number(b.activeUsers), keyEvents: Number(b.keyEvents) } : null;
  };
  const dayTotals = totalsFor(start);
  const prevTotals = totalsFor(prev);
  const weekSessions = [1, 2, 3, 4, 5, 6, 7].map((i) => totalsFor(new Date(start.getTime() - i * DAY))?.sessions).filter((n): n is number => typeof n === "number" && Number.isFinite(n));

  const srcJson = sources?.metrics as { sources?: Array<{ source: string; sessions: number }>; hosts?: Array<{ host: string; sessions: number }> } | undefined;
  const pinterestSessions = srcJson?.sources ? srcJson.sources.filter((x) => /pinterest/i.test(x.source)).reduce((a, x) => a + x.sessions, 0) : null;
  const evJson = events?.metrics as { translations?: number } | undefined;
  const translationsSeen = date >= TRANSLATION_TRACKING_START;

  const site = (await prisma.growthExternalAnalyticsDaily.findFirst({ where: { source: "SEARCH_CONSOLE", NOT: { accountId: { contains: "#" } } }, select: { accountId: true } }))?.accountId ?? null;
  const weekStart = new Date(start.getTime() - 6 * DAY);
  const gscBasic = site ? await prisma.growthExternalAnalyticsDaily.findMany({ where: { source: "SEARCH_CONSOLE", accountId: site, metricDate: { gte: weekStart, lt: end } }, select: { metricDate: true, metrics: true } }) : [];
  const queryRows = site ? await prisma.growthExternalAnalyticsDaily.findMany({ where: { ...insightStorage("GSC_QUERIES", site), metricDate: { gte: weekStart, lt: end } }, select: { metricDate: true, metrics: true } }) : [];
  // Per-day Search Console totals: prefer the collector's own totals, fall back to the basic sync.
  const gscDay = (day: Date): { clicks: number; impressions: number; position: number } | null => {
    const q = queryRows.find((r) => r.metricDate.getTime() === day.getTime())?.metrics as { totals?: { clicks: number; impressions: number; position: number } } | undefined;
    if (q?.totals) return q.totals;
    const b = gscBasic.find((r) => r.metricDate.getTime() === day.getTime())?.metrics as Record<string, string> | undefined;
    return b ? { clicks: Number(b.clicks), impressions: Number(b.impressions), position: Number(b.position) } : null;
  };
  const gscDays = [0, 1, 2, 3, 4, 5, 6].map((i) => gscDay(new Date(start.getTime() - i * DAY))).filter((x): x is NonNullable<typeof x> => x !== null);
  const gscToday = gscDay(start);
  const agg = new Map<string, { clicks: number; impressions: number; posWeighted: number }>();
  for (const row of queryRows)
    for (const r of ((row.metrics as { rows?: Array<{ key: string; clicks: number; impressions: number; position: number }> }).rows ?? [])) {
      const cur = agg.get(r.key) ?? { clicks: 0, impressions: 0, posWeighted: 0 };
      cur.clicks += r.clicks; cur.impressions += r.impressions; cur.posWeighted += r.position * r.impressions;
      agg.set(r.key, cur);
    }
  const topQueries7 = [...agg.entries()]
    .map(([query, v]) => ({ query, clicks: v.clicks, impressions: v.impressions, position: v.impressions ? v.posWeighted / v.impressions : 0 }))
    .sort((a, b) => b.impressions - a.impressions)
    .slice(0, 5);

  const [pinsPublished, translatorsCreated, ideasCreated] = await Promise.all([
    prisma.growthPinPublication.count({ where: { publishedAt: { gte: start, lt: end }, status: { in: ["PUBLISHED", "RECONCILING", "RECONCILED"] } } }),
    prisma.growthContentVersion.count({ where: { createdAt: { gte: start, lt: end }, action: "CREATE" } }),
    prisma.growthIdeaVersion.count({ where: { createdAt: { gte: start, lt: end }, action: "CREATE" } }),
  ]);

  const weekClicks = weekRows.map((r) => Number(r._sum.outboundClicks ?? 0));
  return {
    date,
    pinterest: {
      accountsReady: dayRows.length,
      accountsTotal: accounts,
      impressions: complete ? sum(dayRows as never, "impressions") : null,
      saves: complete ? sum(dayRows as never, "saves") : null,
      outboundClicks: complete ? sum(dayRows as never, "outboundClicks") : null,
      previousOutboundClicks: prevRows.length === accounts && accounts > 0 ? sum(prevRows as never, "outboundClicks") : null,
      avg7OutboundClicks: weekClicks.length ? weekClicks.reduce((a, b) => a + b, 0) / weekClicks.length : null,
    },
    site: {
      sessions: dayTotals ? dayTotals.sessions : null,
      users: dayTotals ? dayTotals.users : null,
      keyEvents: dayTotals ? dayTotals.keyEvents : null,
      previousSessions: prevTotals ? prevTotals.sessions : null,
      avg7Sessions: weekSessions.length ? weekSessions.reduce((a, b) => a + b, 0) / weekSessions.length : null,
      pinterestSessions,
      translations: translationsSeen && evJson?.translations !== undefined ? evJson.translations : null,
      translationsTrackingSince: TRANSLATION_TRACKING_START,
      hosts: srcJson?.hosts ?? [],
      topPages: ((pages?.metrics as { pages?: Array<{ page: string; sessions: number }> } | undefined)?.pages ?? []).filter((p) => p.page && p.page !== "(not set)").slice(0, 3),
    },
    search: {
      clicks: gscToday ? gscToday.clicks : null,
      impressions: gscToday ? gscToday.impressions : null,
      position: gscToday && gscToday.position > 0 ? gscToday.position : null,
      clicks7: gscDays.length ? gscDays.reduce((a, r) => a + r.clicks, 0) : null,
      impressions7: gscDays.length ? gscDays.reduce((a, r) => a + r.impressions, 0) : null,
      topQueries7,
    },
    ops: { pinsPublished, translatorsCreated, ideasCreated },
  };
}
