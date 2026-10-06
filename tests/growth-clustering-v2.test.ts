import { describe, expect, it } from "vitest";
import {
  clusterPins,
  GENERIC_CLUSTER_TOKENS,
  MAX_CLUSTER_DOCUMENT_FREQUENCY_RATIO,
  type ClusterPinInput,
} from "@/lib/growth/opportunity/clustering";
import {
  OPPORTUNITY_MAX_CLUSTERS,
  OPPORTUNITY_PIN_CAP,
} from "@/lib/growth/opportunity/constants";
const pin = (
  id: string,
  input: Partial<ClusterPinInput> = {},
): ClusterPinInput => ({
  id,
  pinterestPinId: id,
  title: null,
  description: null,
  destinationUrl: `https://saytwist.com/translators/topic-${id}`,
  role: null,
  ...input,
});
const translator = (
  id: string,
  name: string,
  category: string | null = null,
  primaryCategory: { slug: string; name: string } | null = null,
) => ({
  id,
  slug: name.toLowerCase().replaceAll(" ", "-"),
  name,
  category,
  primaryCategory,
});
describe("content_clustering_v2 route and specificity safeguards", () => {
  it("A: never creates a translators cluster from 20 translator routes", () => {
    const clusters = clusterPins(
      Array.from({ length: 24 }, (_, i) =>
        pin(String(i), {
          title: "SayTwist text translator",
          destinationUrl: `https://saytwist.com/translators/unique-${i}`,
        }),
      ),
    );
    expect(
      clusters.find(
        (c) => c.name === "translators" || c.key.includes("translators"),
      ),
    ).toBeUndefined();
    expect(clusters).toEqual([]);
  });
  it("B: produces multiple meaningful clusters for mixed translator themes", () => {
    const definitions = [
      ...Array.from(
        { length: 3 },
        (_, i) =>
          [
            "gen" + i,
            "Gen Z " + (i ? "Texting" : "Flirting"),
            { slug: "gen-z", name: "Gen Z" },
          ] as const,
      ),
      ...[0, 1].map(
        (i) =>
          [
            "shake" + i,
            "Shakespeare",
            { slug: "classic", name: "Classic" },
          ] as const,
      ),
      ...[0, 1].map(
        (i) =>
          [
            "formal" + i,
            "Formal",
            { slug: "professional", name: "Professional" },
          ] as const,
      ),
      ...[0, 1].map(
        (i) =>
          [
            "pirate" + i,
            "Pirate",
            { slug: "playful", name: "Playful" },
          ] as const,
      ),
    ];
    const clusters = clusterPins(
      definitions.map(([id, name, category]) =>
        pin(id, {
          translator: translator(id, name, null, category),
          destinationUrl: `https://saytwist.com/translators/${id}`,
        }),
      ),
    );
    expect(clusters.map((c) => c.key)).toEqual(
      expect.arrayContaining([
        "category:classic",
        "category:gen",
        "category:playful",
        "category:professional",
      ]),
    );
  });
  it("C: rejects a token above the 60 percent corpus threshold", () => {
    const inputs = Array.from({ length: 10 }, (_, i) =>
      pin(String(i), {
        title: i < 7 ? `common subject ${i}` : `unique subject ${i}`,
        destinationUrl: null,
      }),
    );
    expect(MAX_CLUSTER_DOCUMENT_FREQUENCY_RATIO).toBe(0.6);
    expect(clusterPins(inputs).some((c) => c.key === "topic:common")).toBe(
      false,
    );
  });
  it("D: accepts a discriminative token repeated in several but not most Pins", () => {
    const inputs = Array.from({ length: 10 }, (_, i) =>
      pin(String(i), {
        title: i < 3 ? `nebula ${i}` : `solitary${i}`,
        destinationUrl: null,
      }),
    );
    expect(
      clusterPins(inputs).find((c) => c.key === "topic:nebula")?.pins,
    ).toHaveLength(3);
  });
  it("E: produces identical keys and membership after input shuffling", () => {
    const inputs = Array.from({ length: 12 }, (_, i) =>
      pin(String(i), {
        title:
          i < 4 ? "nebula captions" : i < 8 ? "pirate captions" : `unique ${i}`,
        destinationUrl: null,
      }),
    );
    const project = (rows: ReturnType<typeof clusterPins>) =>
      rows.map((c) => [c.key, c.pins.map((p) => p.pinterestPinId)]);
    expect(project(clusterPins(inputs))).toEqual(
      project(clusterPins([...inputs].reverse())),
    );
  });
  it("F: excludes translator routes and prefers resolved category metadata", () => {
    const category = { slug: "social-tone", name: "Social Tone" };
    const clusters = clusterPins([
      pin("1", {
        translator: translator("1", "Gen Z Flirting", null, category),
        destinationUrl: "https://saytwist.com/translators/gen-z-flirting",
      }),
      pin("2", {
        translator: translator("2", "Gen Z Texting", null, category),
        destinationUrl: "https://saytwist.com/translators/gen-z-texting",
      }),
    ]);
    expect(clusters[0]?.key).toBe("category:social");
    expect(clusters[0]?.pins[0].matchTokens).not.toContain("translators");
  });
  it("G: uses only meaningful terminal content for unknown destinations", () => {
    const clusters = clusterPins([
      pin("1", {
        destinationUrl: "https://saytwist.com/resources/pirate-captions",
      }),
      pin("2", {
        destinationUrl: "https://saytwist.com/generated/pirate-captions",
      }),
    ]);
    expect(clusters[0]?.key).toBe("topic:captions");
    expect(clusters[0]?.pins[0].matchTokens).not.toContain("resources");
    expect(clusters[0]?.pins[0].matchTokens).not.toContain("generated");
  });
  it("H: emits no cluster without a meaningful shared token", () =>
    expect(
      clusterPins(
        Array.from({ length: 12 }, (_, i) =>
          pin(String(i), { title: `unique-${i}`, destinationUrl: null }),
        ),
      ),
    ).toEqual([]));
  it("centralizes structural and corpus-generic SayTwist vocabulary", () => {
    for (const token of [
      "translator",
      "translators",
      "translate",
      "translation",
      "saytwist",
      "text",
      "texts",
      "pin",
      "pins",
      "pinterest",
      "style",
      "styles",
    ])
      expect(GENERIC_CLUSTER_TOKENS.has(token)).toBe(true);
  });
  it("handles a bounded live-like corpus without route collapse", () => {
    const themes = [
      "gen-z",
      "pirate",
      "formal",
      "classic",
      "flirting",
      "professional",
    ];
    const corpus = Array.from({ length: OPPORTUNITY_PIN_CAP + 20 }, (_, i) => {
      const theme = i < 240 ? themes[Math.floor(i / 40)] : null;
      return pin(String(i), {
        title: theme ? `${theme} captions ${i}` : `solitary${i}`,
        destinationUrl: `https://saytwist.com/translators/distinct-${i}`,
        translator: theme
          ? translator(String(i), `Distinct ${i}`, null, {
              slug: theme,
              name: theme,
            })
          : null,
      });
    }).slice(0, OPPORTUNITY_PIN_CAP);
    const clusters = clusterPins(corpus).slice(0, OPPORTUNITY_MAX_CLUSTERS);
    expect(corpus).toHaveLength(500);
    expect(clusters.length).toBeGreaterThan(1);
    expect(clusters.length).toBeLessThanOrEqual(100);
    expect(clusters.some((c) => c.key.includes("translators"))).toBe(false);
    expect(clusters.reduce((n, c) => n + c.pins.length, 0)).toBeLessThan(500);
  });
});
