import { describe, expect, it } from "vitest";

import type { BriefingData } from "@/lib/growth/reporting/briefing";
import { briefingEmbed, compact, shareBar, sparkline, trend } from "@/lib/growth/reporting/briefing-embed";

const base = (): BriefingData => ({
  date: "2026-11-20",
  pinterest: { accountsReady: 3, accountsTotal: 3, impressions: 89045, saves: 640, outboundClicks: 62, previousOutboundClicks: 59, avg7OutboundClicks: 72.6, clicksSeries: [60, 80, 70, 90, 55, 59, 62] },
  site: {
    sessions: 79, users: 67, keyEvents: 0, previousSessions: 69, avg7Sessions: 79, sessionsSeries: [70, 85, 90, 88, 76, 69, 79],
    pinterestSessions: 55, translations: null, translationsTrackingSince: "2026-11-23",
    hosts: [{ host: "translator.whattypeof.com", sessions: 59 }, { host: "saytwist.com", sessions: 20 }],
    topPages: [{ page: "/translators/jealous-language-translator", sessions: 16 }, { page: "/translators/1890s-victorian-english-translator", sessions: 14 }],
  },
  search: { clicks: 0, impressions: 0, position: null, clicks7: 0, impressions7: 2, topQueries7: [{ query: "jester translator", clicks: 0, impressions: 12, position: 7.5 }] },
  ops: { pinsPublished: 3, translatorsCreated: 0, ideasCreated: 0 },
});

describe("embed helpers", () => {
  it("formats compact numbers", () => {
    expect(compact(950)).toBe("950");
    expect(compact(1234)).toBe("1.2K");
    expect(compact(89045)).toBe("89K");
    expect(compact(null)).toBe("n/a");
  });
  it("draws sparklines and marks missing days", () => {
    expect(sparkline([0, 10])).toBe("▁█");
    expect(sparkline([null, 5, null])).toBe("·█·");
    expect(sparkline([null, null])).toBe("");
    expect(sparkline(undefined)).toBe("");
  });
  it("draws share bars", () => {
    expect(shareBar(0.5)).toBe("▰▰▰▰▰▱▱▱▱▱");
    expect(shareBar(1)).toHaveLength(10);
    expect(shareBar(0)).toBe("▱▱▱▱▱▱▱▱▱▱");
  });
  it("shows direction with arrows", () => {
    expect(trend(110, 100)).toBe("▲ 10%");
    expect(trend(50, 100)).toBe("▼ 50%");
    expect(trend(5, 5)).toBe("▬ flat");
    expect(trend(null, 5)).toBe("");
  });
});

describe("briefing embed", () => {
  it("is organized into labeled blocks with real numbers", () => {
    const payload = briefingEmbed(base(), "https://saytwist.com/admin/growth/reports/growth-20261120");
    const embed = payload.embeds[0] as { title: string; description: string; color: number; fields: Array<{ name: string; value: string; inline: boolean }>; url: string };
    expect(payload.content).toContain("79 visits");
    expect(payload.content).toContain("62 Pinterest clicks");
    expect(embed.title).toContain("Fri, Nov 20");
    expect(embed.url).toContain("/admin/growth/reports/");
    const names = embed.fields.map((f) => f.name);
    expect(names).toEqual(expect.arrayContaining(["🌐 Website", "📌 Pinterest", "🔎 Google Search", "🌍 Where visitors landed", "🔥 Top pages", "🛠️ Growth activity"]));
    expect(embed.fields.find((f) => f.name === "📌 Pinterest")!.value).toContain("89K views");
    expect(embed.fields.find((f) => f.name === "📌 Pinterest")!.value).toContain("89% reached the site");
    expect(embed.fields.find((f) => f.name === "🌍 Where visitors landed")!.value).toContain("75%");
    expect(embed.fields.find((f) => f.name === "🔥 Top pages")!.value).toContain("jealous language");
    expect(embed.color).toBe(0x2fbf71);
  });

  it("stays well inside Discord limits and never leaks undefined or NaN", () => {
    const payload = briefingEmbed(base(), "https://saytwist.com/x");
    const text = JSON.stringify(payload);
    expect(text).not.toMatch(/undefined|NaN|null"/);
    const embed = payload.embeds[0] as { description: string; fields: Array<{ name: string; value: string }> };
    expect(embed.fields.length).toBeLessThanOrEqual(25);
    for (const f of embed.fields) {
      expect(f.name.length).toBeLessThanOrEqual(256);
      expect(f.value.length).toBeLessThanOrEqual(1024);
    }
    expect(embed.description.length).toBeLessThanOrEqual(4096);
    expect(text.length).toBeLessThan(6000);
    expect(payload.allowed_mentions).toEqual({ parse: [] });
  });

  it("turns amber when visits fall well below the weekly average", () => {
    const d = base();
    d.site.sessions = 40;
    expect((briefingEmbed(d, "u").embeds[0] as { color: number }).color).toBe(0xf5a623);
  });

  it("handles missing data without inventing numbers", () => {
    const d = base();
    d.site = { ...d.site, sessions: null, users: null, previousSessions: null, avg7Sessions: null, sessionsSeries: undefined, pinterestSessions: null, hosts: [], topPages: [] };
    d.pinterest = { ...d.pinterest, outboundClicks: null, impressions: null, saves: null, accountsReady: 1, clicksSeries: undefined };
    d.search = { clicks: null, impressions: null, position: null, clicks7: null, impressions7: null, topQueries7: [] };
    const payload = briefingEmbed(d, "u");
    const embed = payload.embeds[0] as { description: string; color: number; fields: Array<{ name: string; value: string }> };
    expect(embed.description).toContain("Waiting for final data");
    expect(embed.color).toBe(0x8a94a6);
    expect(embed.fields.find((f) => f.name === "📌 Pinterest")!.value).toContain("Not final yet (1/3 accounts)");
    expect(embed.fields.find((f) => f.name === "🌐 Website")!.value).toContain("Not available yet");
    expect(JSON.stringify(payload)).not.toMatch(/undefined|NaN/);
  });

  it("says translation tracking starts later instead of showing zero", () => {
    const embed = briefingEmbed(base(), "u").embeds[0] as { fields: Array<{ name: string; value: string }> };
    expect(embed.fields.find((f) => f.name === "🌐 Website")!.value).toContain("translations from 2026-11-23");
  });
});
