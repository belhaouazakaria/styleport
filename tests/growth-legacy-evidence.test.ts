import { describe, expect, it } from "vitest";

import {
  deduplicatePinterestEvidence,
  matchLegacyPinToTranslator,
  selectBoundedPinterestEvidence,
  selectFinalizedMetricEvidence,
  validateLegacyPinDestination,
} from "@/lib/growth/learning/legacy-evidence";

const translators = [{ id: "translator-1", slug: "warm-tone" }];

describe("Phase 12.1 legacy Pinterest evidence", () => {
  it.each([
    "https://saytwist.com/translators/warm-tone",
    "https://www.saytwist.com/translators/warm-tone/",
    "https://translator.whattypeof.com/translators/warm-tone?utm_source=pinterest",
  ])(
    "matches an exact active Translator path on an approved host: %s",
    (url) => {
      expect(matchLegacyPinToTranslator(url, translators)).toMatchObject({
        translatorId: "translator-1",
        canonicalPath: "/translators/warm-tone",
      });
    },
  );

  it.each([
    "https://attacker.example/translators/warm-tone",
    "http://saytwist.com/translators/warm-tone",
    "https://saytwist.com:444/translators/warm-tone",
    "https://saytwist.com/translators/warm-tone/extra",
    "https://saytwist.com/translators/warm-tone#fragment",
    "https://saytwist.com/translators/warm-tone%2Fextra",
    "not a url",
  ])("rejects unrelated, malformed, or ambiguous destinations: %s", (url) => {
    expect(matchLegacyPinToTranslator(url, translators)).toBeNull();
  });

  it("reports strict rejection reasons without weakening host or encoding safety", () => {
    expect(
      validateLegacyPinDestination(
        "https://attacker.example/translators/warm-tone",
        translators,
      ).reason,
    ).toBe("UNAPPROVED_HOST");
    expect(
      validateLegacyPinDestination(
        "https://saytwist.com/translators/Warm-Tone",
        translators,
      ).reason,
    ).toBe("NON_CANONICAL_SLUG_ENCODING");
    expect(
      validateLegacyPinDestination(
        "https://saytwist.com/translators/warm%2Dtone",
        translators,
      ).reason,
    ).toBe("NON_CANONICAL_SLUG_ENCODING");
  });

  it("rejects inactive targets by accepting only the caller's active target set", () => {
    expect(
      matchLegacyPinToTranslator(
        "https://saytwist.com/translators/inactive",
        translators,
      ),
    ).toBeNull();
  });

  it("rejects ambiguous target maps", () => {
    expect(
      matchLegacyPinToTranslator("https://saytwist.com/translators/warm-tone", [
        ...translators,
        { id: "translator-2", slug: "warm-tone" },
      ]),
    ).toBeNull();
  });

  it("prefers managed provenance when a stable Pinterest Pin ID appears twice", () => {
    const result = deduplicatePinterestEvidence(
      [{ pinterestPinId: "pin-1", source: "managed" }],
      [
        { pinterestPinId: "pin-1", source: "legacy-duplicate" },
        { pinterestPinId: "pin-2", source: "legacy" },
      ],
    );
    expect(result.managed).toHaveLength(1);
    expect(result.legacy).toEqual([
      { pinterestPinId: "pin-2", source: "legacy" },
    ]);
  });

  it("counts only READY rows and exposes processing or missing evidence", () => {
    const day = new Date("2026-10-01T00:00:00Z");
    expect(
      selectFinalizedMetricEvidence([
        {
          metricDate: day,
          dataStatus: "READY",
          impressions: 100n,
          outboundClicks: 10n,
          saves: 4n,
        },
        {
          metricDate: new Date("2026-10-02T00:00:00Z"),
          dataStatus: "PROCESSING",
          impressions: 999n,
          outboundClicks: 999n,
          saves: 999n,
        },
      ]),
    ).toMatchObject({
      observedReadyDays: 1,
      evidenceComplete: false,
      reasonCodes: ["PIN_METRICS_INCOMPLETE"],
      ready: [expect.objectContaining({ impressions: 100n })],
    });
    expect(selectFinalizedMetricEvidence([])).toMatchObject({
      evidenceComplete: false,
      reasonCodes: ["PIN_METRICS_MISSING"],
    });
  });

  it("reports cap exhaustion instead of presenting a partial selection as complete", () => {
    expect(selectBoundedPinterestEvidence([1, 2, 3], 2)).toEqual({
      selected: [1, 2],
      capExhausted: true,
    });
  });

  it("reports absent completed UTC days instead of treating them as zero", () => {
    const evidence = selectFinalizedMetricEvidence(
      [
        {
          metricDate: new Date("2026-10-12T00:00:00Z"),
          dataStatus: "READY",
          impressions: 100n,
          outboundClicks: 3n,
          saves: 1n,
        },
      ],
      {
        windowStart: new Date("2026-10-10T00:00:00Z"),
        windowEndExclusive: new Date("2026-10-15T00:00:00Z"),
        publishedAt: new Date("2026-10-10T13:00:00Z"),
      },
    );
    expect(evidence).toMatchObject({
      expectedDays: 4,
      missingDays: 3,
      evidenceComplete: false,
      reasonCodes: ["PIN_METRICS_MISSING"],
    });
  });

  it("requires only full UTC days after publication inside the evidence window", () => {
    const evidence = selectFinalizedMetricEvidence(
      [
        { metricDate: "2026-10-11T00:00:00Z", dataStatus: "PROCESSING" },
        { metricDate: "2026-10-13T00:00:00Z", dataStatus: "READY" },
        { metricDate: "2026-10-14T00:00:00Z", dataStatus: "READY" },
        { metricDate: "2026-10-15T00:00:00Z", dataStatus: "PROCESSING" },
      ].map(({ metricDate, dataStatus }) => ({
        metricDate: new Date(metricDate),
        dataStatus,
        impressions: 10n,
        outboundClicks: 1n,
        saves: 1n,
      })),
      {
        windowStart: new Date("2026-07-17T00:00:00Z"),
        windowEndExclusive: new Date("2026-10-15T00:00:00Z"),
        publishedAt: new Date("2026-10-12T18:30:00Z"),
      },
    );
    expect(evidence).toMatchObject({
      expectedDays: 2,
      observedReadyDays: 2,
      missingDays: 0,
      evidenceComplete: true,
    });
  });
});
