import { GrowthPublicationTimingMode } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { approvePinSchema, publicationJobPayloadSchema } from "@/lib/growth/publishing/contracts";
import { buildPublicCreativeAssetUrl, pinApprovalSnapshotChecksum } from "@/lib/growth/publishing/snapshot";
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
});
