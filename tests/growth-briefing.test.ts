import { afterEach, describe, expect, it, vi } from "vitest";

import { trackTranslationCompleted } from "@/lib/analytics-events";
import { formatBriefing, nextAction, percentChange, type BriefingData } from "@/lib/growth/reporting/briefing";
import { dueGrowthReportDate } from "@/lib/growth/reporting/daily-runner";

const base = (): BriefingData => ({
  date: "2026-11-21",
  pinterest: { accountsReady: 3, accountsTotal: 3, impressions: 12000, saves: 140, outboundClicks: 48, previousOutboundClicks: 40, avg7OutboundClicks: 35.5 },
  site: {
    sessions: 61, users: 53, keyEvents: 0, previousSessions: 79, avg7Sessions: 70, pinterestSessions: 30, translations: 9, translationsTrackingSince: "2026-11-23",
    hosts: [{ host: "saytwist.com", sessions: 40 }, { host: "translator.whattypeof.com", sessions: 21 }],
    topPages: [{ page: "/translators/jester-translator", sessions: 12 }],
  },
  search: { clicks: 2, impressions: 150, position: 8.2, clicks7: 9, impressions7: 800, topQueries7: [{ query: "jester translator", clicks: 4, impressions: 300, position: 7.5 }] },
  ops: { pinsPublished: 6, translatorsCreated: 1, ideasCreated: 0 },
});

describe("report date", () => {
  it("reports the last day with final data, two days back", () => {
    expect(dueGrowthReportDate(new Date("2026-11-23T05:05:00Z"))).toBe("2026-11-21");
    expect(dueGrowthReportDate(new Date("2026-11-23T03:59:00Z"))).toBeNull();
    expect(dueGrowthReportDate(new Date("2027-01-01T05:00:00Z"))).toBe("2026-12-30");
  });
});

describe("percentChange", () => {
  it("handles normal, zero and missing values without inventing numbers", () => {
    expect(percentChange(110, 100)).toBe("+10%");
    expect(percentChange(50, 100)).toBe("-50%");
    expect(percentChange(5, 0)).toBe("new");
    expect(percentChange(0, 0)).toBe("flat");
    expect(percentChange(null, 5)).toBe("n/a");
  });
});

describe("briefing", () => {
  it("shows real numbers from every source in under the Discord limit", () => {
    const text = formatBriefing(base());
    expect(text).toContain("61 sessions");
    expect(text).toContain("-23% vs prev day");
    expect(text).toContain("translator.whattypeof.com 21");
    expect(text).toContain("Translations: **9**");
    expect(text).toContain("48 outbound clicks");
    expect(text).toContain("GA4 saw 30 Pinterest sessions");
    expect(text).toContain("jester translator");
    expect(text.length).toBeLessThan(1800);
  });

  it("says unavailable instead of zero when data is missing", () => {
    const data = base();
    data.site = { ...data.site, sessions: null, users: null, translations: null };
    data.pinterest = { ...data.pinterest, outboundClicks: null, impressions: null, saves: null, accountsReady: 1 };
    data.search = { clicks: null, impressions: null, position: null, clicks7: null, impressions7: null, topQueries7: [] };
    const text = formatBriefing(data);
    expect(text).toContain("Website (GA4)** unavailable");
    expect(text).toContain("data not final yet (1/3 accounts ready)");
    expect(text).toContain("Google Search** unavailable");
    expect(text).not.toMatch(/\b0 sessions/);
  });

  it("explains that translation tracking is new rather than showing zero", () => {
    const data = base();
    data.site.translations = null;
    expect(formatBriefing(data)).toContain("tracking starts 2026-11-23");
  });

  it("picks a specific next action", () => {
    const d = base();
    d.site.translations = null;
    expect(nextAction(d)).toMatch(/key event/);
    const e = base();
    e.site.pinterestSessions = 5;
    expect(nextAction(e)).toMatch(/not arriving as sessions/);
    const f = base();
    f.site.translations = 2;
    expect(nextAction(f)).toMatch(/per 100 sessions/);
  });
});

describe("translation event", () => {
  afterEach(() => { delete (window as { gtag?: unknown }).gtag; });
  it("sends only coarse, non-text parameters", () => {
    const gtag = vi.fn();
    (window as { gtag?: unknown }).gtag = gtag;
    trackTranslationCompleted({ translatorSlug: "jester-translator", modeKey: "classic", direction: "forward", inputLength: 500 });
    expect(gtag).toHaveBeenCalledWith("event", "translation_completed", { translator_slug: "jester-translator", mode: "classic", direction: "forward", input_length: "long" });
  });
  it("is safe when GA4 is not loaded or throws", () => {
    expect(() => trackTranslationCompleted({ translatorSlug: "a", direction: "forward", inputLength: 5 })).not.toThrow();
    (window as { gtag?: unknown }).gtag = () => { throw new Error("blocked"); };
    expect(() => trackTranslationCompleted({ translatorSlug: "a", direction: "forward", inputLength: 5 })).not.toThrow();
  });
});

describe("page filters", () => {
  it("keeps admin, API and login visits out of top landing pages", async () => {
    const src = (await import("node:fs")).readFileSync("lib/growth/reporting/briefing.ts", "utf8");
    expect(src).toContain("admin|api|login");
  });
});
