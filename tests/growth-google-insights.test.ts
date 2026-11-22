import { describe, expect, it, vi } from "vitest";

import { readGa4Insights, readSearchConsoleInsights } from "@/lib/growth/google/insights";

const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });

describe("Google insight readers", () => {
  it("parses GA4 sources, hosts, translation events and landing pages", async () => {
    const fetcher = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      const dims = body.dimensions.map((d: { name: string }) => d.name).join(",");
      if (dims === "sessionSource,sessionMedium") return json({ rows: [{ dimensionValues: [{ value: "pinterest" }, { value: "referral" }], metricValues: [{ value: "30" }, { value: "28" }] }] });
      if (dims === "hostName") return json({ rows: [{ dimensionValues: [{ value: "saytwist.com" }], metricValues: [{ value: "40" }, { value: "35" }] }] });
      if (dims === "eventName,sessionSource") return json({ rows: [{ dimensionValues: [{ value: "translation_completed" }, { value: "pinterest" }], metricValues: [{ value: "7" }] }, { dimensionValues: [{ value: "translation_completed" }, { value: "google" }], metricValues: [{ value: "2" }] }] });
      return json({ rows: [{ dimensionValues: [{ value: "/translators/jester-translator" }], metricValues: [{ value: "12" }, { value: "10" }] }] });
    });
    const result = await readGa4Insights("553797535", "token", "2026-11-21", fetcher as unknown as typeof fetch);
    expect(result.GA4_SOURCES.sources[0]).toEqual({ source: "pinterest", medium: "referral", sessions: 30, users: 28 });
    expect(result.GA4_SOURCES.hosts[0].host).toBe("saytwist.com");
    expect(result.GA4_EVENTS.translations).toBe(9);
    expect(result.GA4_PAGES.pages[0].page).toBe("/translators/jester-translator");
    for (const call of fetcher.mock.calls) expect((call[1] as RequestInit).method).toBe("POST");
  });

  it("returns empty results for days with no rows", async () => {
    const fetcher = vi.fn(async () => json({}));
    const result = await readGa4Insights("553797535", "token", "2026-11-21", fetcher as unknown as typeof fetch);
    expect(result.GA4_EVENTS.translations).toBe(0);
    expect(result.GA4_PAGES.pages).toEqual([]);
  });

  it("parses Search Console queries and pages", async () => {
    const fetcher = vi.fn(async () => json({ rows: [{ keys: ["jester translator"], clicks: 3, impressions: 120, ctr: 0.025, position: 7.46 }] }));
    const result = await readSearchConsoleInsights("sc-domain:saytwist.com", "token", "2026-11-19", fetcher as unknown as typeof fetch);
    expect(result.GSC_QUERIES.rows[0]).toEqual({ key: "jester translator", clicks: 3, impressions: 120, position: 7.5 });
    expect(result.GSC_PAGES.rows).toHaveLength(1);
  });

  it("rejects malformed provider output", async () => {
    const fetcher = vi.fn(async () => json({ rows: [{ keys: ["x"], clicks: "bad" }] }));
    await expect(readSearchConsoleInsights("sc-domain:saytwist.com", "t", "2026-11-19", fetcher as unknown as typeof fetch)).rejects.toThrow();
  });
});
