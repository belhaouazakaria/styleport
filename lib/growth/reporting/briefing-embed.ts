import { nextAction, percentChange, type BriefingData } from "@/lib/growth/reporting/briefing";

/** Compact number: 1,234 -> 1.2K, 89,045 -> 89K. */
export function compact(n: number | null, digits = 1): string {
  if (n === null || !Number.isFinite(n)) return "n/a";
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return (n / 1_000_000).toFixed(digits).replace(/\.0+$/, "") + "M";
  if (abs >= 10_000) return Math.round(n / 1000) + "K";
  if (abs >= 1_000) return (n / 1000).toFixed(digits).replace(/\.0+$/, "") + "K";
  return String(Math.round(n));
}

const LEVELS = "▁▂▃▄▅▆▇█";

/** Tiny 7-day trend chart. Missing days render as a dot. */
export function sparkline(values: Array<number | null> | undefined): string {
  if (!values || !values.some((v) => v !== null)) return "";
  const max = Math.max(...values.map((v) => v ?? 0));
  return values
    .map((v) => (v === null ? "·" : max <= 0 ? LEVELS[0] : LEVELS[Math.min(7, Math.round((v / max) * 7))]))
    .join("");
}

export function shareBar(share: number, width = 10): string {
  const filled = Math.max(0, Math.min(width, Math.round(share * width)));
  return "▰".repeat(filled) + "▱".repeat(width - filled);
}

/** Arrow plus percent, or a short word when there is nothing to compare. */
export function trend(current: number | null, previous: number | null): string {
  const change = percentChange(current, previous);
  if (change === "n/a") return "";
  if (change === "flat") return "▬ flat";
  if (change === "new") return "▲ new";
  return (change.startsWith("-") ? "▼ " : "▲ ") + change.replace(/^[+-]/, "");
}

function shortPath(page: string, max = 38) {
  const clean = page.replace(/^\/translators\//, "").replace(/-translator$/, "").replace(/-/g, " ");
  const text = clean === "/" ? "home" : clean;
  return text.length > max ? text.slice(0, max - 1) + "…" : text;
}

const GREEN = 0x2fbf71;
const AMBER = 0xf5a623;
const GREY = 0x8a94a6;

function colorFor(data: BriefingData): number {
  const { sessions, avg7Sessions } = data.site;
  if (sessions === null) return GREY;
  if (avg7Sessions && sessions < avg7Sessions * 0.8) return AMBER;
  return GREEN;
}

function dataQuality(data: BriefingData): string {
  const ok = (v: boolean) => (v ? "✅" : "⏳");
  return `${ok(data.site.sessions !== null)} Website  ${ok(data.pinterest.outboundClicks !== null)} Pinterest  ${ok(data.search.impressions !== null)} Search`;
}

export interface DiscordBriefingPayload {
  content: string;
  allowed_mentions: { parse: never[] };
  embeds: Array<Record<string, unknown>>;
}

/**
 * Discord embed for the daily briefing: a headline, three side-by-side blocks
 * (website, Pinterest, Google Search), where visitors landed, top pages and one
 * next move. Everything is plain text, no mentions, and far below Discord limits.
 */
export function briefingEmbed(data: BriefingData, reportUrl: string): DiscordBriefingPayload {
  const date = new Date(data.date + "T00:00:00Z");
  const label = date.toLocaleDateString("en-US", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
  const s = data.site;
  const p = data.pinterest;
  const q = data.search;

  const headlineParts = [
    s.sessions !== null ? `**${compact(s.sessions)}** visits` : null,
    p.outboundClicks !== null ? `**${compact(p.outboundClicks)}** Pinterest clicks` : null,
    q.impressions !== null ? `**${compact(q.clicks ?? 0)}** Google clicks` : null,
  ].filter(Boolean);
  const headline = headlineParts.length ? headlineParts.join("  ·  ") : "Waiting for final data";

  const website = [
    s.sessions !== null ? `**${compact(s.sessions)}** sessions ${trend(s.sessions, s.previousSessions)}`.trim() : "Not available yet",
    s.users !== null ? `${compact(s.users)} people` : null,
    s.translations !== null ? `**${compact(s.translations)}** translations` : `translations from ${s.translationsTrackingSince ?? "soon"}`,
    s.sessionsSeries && sparkline(s.sessionsSeries) ? `\`${sparkline(s.sessionsSeries)}\` 7 days` : null,
  ].filter(Boolean).join("\n");

  const landing = p.outboundClicks && s.pinterestSessions !== null ? Math.round((s.pinterestSessions / p.outboundClicks) * 100) : null;
  const pinterest =
    p.outboundClicks !== null
      ? [
          `**${compact(p.outboundClicks)}** clicks ${trend(p.outboundClicks, p.previousOutboundClicks)}`.trim(),
          `${compact(p.impressions)} views · ${compact(p.saves)} saves`,
          landing !== null ? `${landing}% reached the site` : null,
          p.clicksSeries && sparkline(p.clicksSeries) ? `\`${sparkline(p.clicksSeries)}\` 7 days` : null,
        ].filter(Boolean).join("\n")
      : `Not final yet (${p.accountsReady}/${p.accountsTotal} accounts)`;

  const search =
    q.impressions !== null
      ? [`**${compact(q.clicks ?? 0)}** clicks · ${compact(q.impressions)} views`, q.position ? `avg position ${q.position.toFixed(1)}` : null, `7 days: ${compact(q.clicks7)} clicks · ${compact(q.impressions7)} views`].filter(Boolean).join("\n")
      : q.impressions7 !== null
        ? `Day not final yet\n7 days: ${compact(q.clicks7)} clicks · ${compact(q.impressions7)} views`
        : "Not available yet";

  const totalHostSessions = s.hosts.reduce((a, h) => a + h.sessions, 0);
  const domains = totalHostSessions
    ? s.hosts.slice(0, 3).map((h) => `\`${shareBar(h.sessions / totalHostSessions)}\` ${Math.round((h.sessions / totalHostSessions) * 100)}%  ${h.host.replace(/^www\./, "")}`).join("\n")
    : null;

  const pages = s.topPages.length ? s.topPages.slice(0, 3).map((x, i) => `${i + 1}. ${shortPath(x.page)} — ${compact(x.sessions)}`).join("\n") : null;
  const queries = q.topQueries7.length ? q.topQueries7.slice(0, 3).map((x) => `“${x.query}” — ${compact(x.impressions)} views, pos ${x.position.toFixed(0)}`).join("\n") : null;
  const ops = `📌 ${data.ops.pinsPublished} Pins  ·  🧩 ${data.ops.translatorsCreated} translators  ·  💡 ${data.ops.ideasCreated} ideas`;
  const next = nextAction(data);

  const fields: Array<{ name: string; value: string; inline: boolean }> = [
    { name: "🌐 Website", value: website, inline: true },
    { name: "📌 Pinterest", value: pinterest, inline: true },
    { name: "🔎 Google Search", value: search, inline: true },
  ];
  if (domains) fields.push({ name: "🌍 Where visitors landed", value: domains, inline: false });
  if (pages) fields.push({ name: "🔥 Top pages", value: pages, inline: true });
  if (queries) fields.push({ name: "💬 Top searches (7 days)", value: queries, inline: true });
  fields.push({ name: "🛠️ Growth activity", value: ops, inline: false });
  if (next) fields.push({ name: "👉 Next move", value: next, inline: false });

  const summary = [s.sessions !== null ? `${compact(s.sessions)} visits` : null, p.outboundClicks !== null ? `${compact(p.outboundClicks)} Pinterest clicks` : null].filter(Boolean).join(", ");
  return {
    content: `📊 SayTwist daily · ${label}${summary ? " — " + summary : ""}`,
    allowed_mentions: { parse: [] },
    embeds: [
      {
        title: `SayTwist daily briefing · ${label}`,
        url: reportUrl,
        description: headline + "\n" + dataQuality(data),
        color: colorFor(data),
        fields,
        footer: { text: "Final data · UTC · tap the title for the full report" },
        timestamp: new Date(data.date + "T12:00:00Z").toISOString(),
      },
    ],
  };
}
