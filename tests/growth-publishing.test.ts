import { GrowthPublicationTimingMode } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { approvePinSchema, publicationJobPayloadSchema } from "@/lib/growth/publishing/contracts";
import { buildPublicCreativeAssetUrl, pinApprovalSnapshotChecksum, pinterestPublicationUrlsMatch, rebuildApprovedPinDestinationUrl } from "@/lib/growth/publishing/snapshot";
import { planPublicationTiming } from "@/lib/growth/publishing/timing";

function localHour(date: Date) { return Number(new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "2-digit", hourCycle: "h23" }).format(date)); }
const qualifiedHistory = Array.from({ length: 3 }, (_, day) => ({ publishedAt: new Date(`2026-10-0${day + 1}T13:00:00Z`), impressions: BigInt(200), outboundClicks: BigInt(20), saves: BigInt(10) }));

describe("Phase 11 publishing contracts and timing", () => {
  it("accepts only the explicit approval body and requires literal confirmation", () => {
    const valid = { candidateId: "candidate", accountId: "account", boardId: "board", scheduledAt: "2026-10-11T13:00:00.000Z", confirmation: true };
    expect(approvePinSchema.safeParse(valid).success).toBe(true);
    expect(approvePinSchema.safeParse({ ...valid, confirmation: false }).success).toBe(false);
    expect(approvePinSchema.safeParse({ ...valid, snapshot: {}, title: "injected", status: "APPROVED" }).success).toBe(false);
    expect(publicationJobPayloadSchema.safeParse({ publicationId: "publication", url: "https://evil.test" }).success).toBe(false);
  });

  it("produces stable cold-start slots in New York across DST boundaries", () => {
    const before = planPublicationTiming({ stableKey: "same-candidate", now: new Date("2026-03-07T22:00:00Z"), history: [] });
    const after = planPublicationTiming({ stableKey: "same-candidate", now: new Date("2026-03-08T22:00:00Z"), history: [] });
    expect(before.mode).toBe(GrowthPublicationTimingMode.COLD_START);
    expect(after.mode).toBe(GrowthPublicationTimingMode.COLD_START);
    expect(localHour(before.scheduledAt)).toBe(before.evidence.selectedLocalHour);
    expect(localHour(after.scheduledAt)).toBe(after.evidence.selectedLocalHour);
  });

  it("uses deterministic exploit/explore and falls back when evidence is insufficient", () => {
    const now = new Date("2026-10-09T12:00:00Z");
    const results = Array.from({ length: 100 }, (_, index) => planPublicationTiming({ stableKey: `candidate-${index}`, now, history: qualifiedHistory }));
    expect(results.some((result) => result.mode === GrowthPublicationTimingMode.EXPLOIT)).toBe(true);
    expect(results.some((result) => result.mode === GrowthPublicationTimingMode.EXPLORE)).toBe(true);
    expect(planPublicationTiming({ stableKey: "few", now, history: qualifiedHistory.slice(0, 2) }).mode).toBe(GrowthPublicationTimingMode.COLD_START);
    expect(results[0]).toEqual(planPublicationTiming({ stableKey: "candidate-0", now, history: qualifiedHistory }));
  });

  it("moves away from a publication collision inside 90 minutes", () => {
    const base = planPublicationTiming({ stableKey: "collision", now: new Date("2026-10-09T12:00:00Z"), history: [] });
    const moved = planPublicationTiming({ stableKey: "collision", now: new Date("2026-10-09T12:00:00Z"), history: [], collisions: [{ scheduledAt: new Date(base.scheduledAt.getTime() + 30 * 60_000) }] });
    expect(moved.evidence.collisionMoves).toBe(1);
    expect(Math.abs(moved.scheduledAt.getTime() - base.scheduledAt.getTime())).toBeGreaterThanOrEqual(90 * 60_000);
  });

  it("builds canonical public asset URLs and stable canonical checksums", () => {
    const path = `/generated/growth-creatives/creative-${"a".repeat(64)}.png`;
    expect(buildPublicCreativeAssetUrl(path, new URL("https://saytwist.com"))).toBe(`https://saytwist.com${path}`);
    expect(() => buildPublicCreativeAssetUrl("/etc/passwd", new URL("https://saytwist.com"))).toThrow("not publishable");
    expect(pinApprovalSnapshotChecksum({ b: 2, a: 1 })).toBe(pinApprovalSnapshotChecksum({ a: 1, b: 2 }));
  });

  it("revalidates the exact explicitly approved canonical or legacy Translator URL", () => {
    const canonical = "https://saytwist.com/translators/jester-translator?utm_source=pinterest&utm_medium=organic&utm_campaign=saytwist&utm_content=candidate1&pin_ref=p_exact";
    const legacy = canonical.replace("https://saytwist.com", "https://translator.whattypeof.com");
    const app = new URL("https://saytwist.com");
    expect(rebuildApprovedPinDestinationUrl(canonical, canonical, app)).toBe(canonical);
    expect(rebuildApprovedPinDestinationUrl(canonical, legacy, app)).toBe(legacy);
    // Previously, a legitimate selected legacy host was replaced by the
    // canonical host and therefore failed the immutable approval checksum.
    expect(pinApprovalSnapshotChecksum({ destinationUrl: legacy })).not.toBe(
      pinApprovalSnapshotChecksum({ destinationUrl: canonical }),
    );
    expect(pinApprovalSnapshotChecksum({ destinationUrl: rebuildApprovedPinDestinationUrl(canonical, legacy, app) })).toBe(
      pinApprovalSnapshotChecksum({ destinationUrl: legacy }),
    );
  });

  it("rejects destination host, route, tracking, and URL-shape substitution", () => {
    const canonical = "https://saytwist.com/translators/jester-translator?utm_source=pinterest&utm_medium=organic&utm_campaign=saytwist&utm_content=approved&pin_ref=p_exact";
    const app = new URL("https://saytwist.com");
    for (const invalid of [
      "https://evil.example/translators/jester-translator",
      "http://saytwist.com/translators/jester-translator",
      "https://saytwist.com.evil.example/translators/jester-translator",
      "https://user@translator.whattypeof.com/translators/jester-translator",
      canonical + "#fragment",
      canonical.replace("jester-translator", "other-translator"),
      canonical.replace("p_exact", "p_other"),
      canonical + "&utm_source=other",
    ]) {
      expect(rebuildApprovedPinDestinationUrl(canonical, invalid, app)).toBeNull();
    }
    expect(rebuildApprovedPinDestinationUrl(canonical, null, app)).toBeNull();
    const idea = "https://saytwist.com/ideas/quick-check?utm_source=pinterest";
    expect(rebuildApprovedPinDestinationUrl(
      idea, idea.replace("saytwist.com", "translator.whattypeof.com"), app,
    )).toBeNull();
  });

  it("matches exact publication URLs independent of query ordering", () => {
    const expected = "https://saytwist.com/translators/warm?existing=one&utm_source=pinterest&utm_medium=organic&utm_campaign=saytwist&utm_content=content-1&pin_ref=pa_exact";
    const reordered = "https://saytwist.com/translators/warm?pin_ref=pa_exact&utm_content=content-1&utm_campaign=saytwist&utm_medium=organic&utm_source=pinterest&existing=one";
    expect(pinterestPublicationUrlsMatch(expected, expected, new URL("https://saytwist.com"))).toBe(true);
    expect(pinterestPublicationUrlsMatch(reordered, expected, new URL("https://saytwist.com"))).toBe(true);
    expect(pinterestPublicationUrlsMatch(expected.replace("pa_exact", "pa_other"), expected, new URL("https://saytwist.com"))).toBe(false);
    expect(pinterestPublicationUrlsMatch(expected.replace("/warm", "/cold"), expected, new URL("https://saytwist.com"))).toBe(false);
    expect(pinterestPublicationUrlsMatch(`${expected}&utm_source=other`, expected, new URL("https://saytwist.com"))).toBe(false);
    expect(pinterestPublicationUrlsMatch(`${expected}&unexpected=value`, expected, new URL("https://saytwist.com"))).toBe(false);
  });
});
