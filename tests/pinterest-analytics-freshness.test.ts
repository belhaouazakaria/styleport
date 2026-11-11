import { describe, expect, it } from "vitest";
import { effectiveStatus } from "@/lib/growth/pinterest/reporting";

const now = new Date("2026-11-11T14:00:00.000Z");
const state = () => ({
  status: "FRESH",
  lastSuccessfulSyncAt: new Date("2026-11-11T13:00:00.000Z"),
  lastAccountAnalyticsSyncAt: new Date("2026-11-11T13:00:00.000Z"),
  lastInventorySyncAt: new Date("2026-11-11T13:00:00.000Z"),
  lastPinAnalyticsSyncAt: new Date("2026-11-11T13:00:00.000Z"),
  backfillCompletedAt: new Date("2026-11-11T12:00:00.000Z"),
  backfillPinsProcessed: 226,
  backfillPinsTotal: 226,
});

describe("Pinterest dashboard multi-component freshness", () => {
  it("is FRESH only when all components and current eligible Pins are current", () => {
    expect(effectiveStatus(state(), 226, now, 226)).toBe("FRESH");
    expect(effectiveStatus(state(), 226, now, 225)).toBe("STALE");
    expect(effectiveStatus(state(), 0, now, 0)).toBe("FRESH");
  });
  it("does not hide a weeks-old inventory or pin backfill after account-only sync", () => {
    expect(effectiveStatus({
      ...state(), lastInventorySyncAt: new Date("2026-10-17T13:04:57Z"),
    }, 226, now)).toBe("STALE");
    expect(effectiveStatus({
      ...state(), lastPinAnalyticsSyncAt: new Date("2026-10-17T13:22:56Z"),
    }, 226, now)).toBe("STALE");
    expect(effectiveStatus({
      ...state(), backfillPinsProcessed: 222, backfillPinsTotal: 222,
    }, 226, now)).toBe("STALE");
  });
  it("checks account freshness separately from latest-anything freshness", () => {
    expect(effectiveStatus({
      ...state(), lastAccountAnalyticsSyncAt: new Date("2026-11-09T04:20:07Z"),
    }, 226, now)).toBe("STALE");
    expect(effectiveStatus({
      ...state(), lastSuccessfulSyncAt: new Date("2026-11-09T04:20:07Z"),
    }, 226, now)).toBe("STALE");
  });
  it("preserves existing incomplete statuses and never marks incomplete backfill as FRESH", () => {
    expect(effectiveStatus(null, 226, now)).toBe("NEVER_SYNCED");
    expect(effectiveStatus({ ...state(), status: "BACKFILLING" }, 226, now)).toBe("BACKFILLING");
    expect(effectiveStatus({ ...state(), status: "PARTIAL" }, 226, now)).toBe("PARTIAL");
    expect(effectiveStatus({ ...state(), status: "FAILED" }, 226, now)).toBe("FAILED");
    expect(effectiveStatus({ ...state(), backfillCompletedAt: null }, 226, now)).toBe("STALE");
  });
  it("rejects missing, future, and stale component timestamps", () => {
    expect(effectiveStatus({ ...state(), lastInventorySyncAt: null }, 226, now)).toBe("STALE");
    expect(effectiveStatus({ ...state(), lastPinAnalyticsSyncAt: new Date("2026-11-11T15:00:00Z") }, 226, now)).toBe("STALE");
    expect(effectiveStatus({ ...state(), lastAccountAnalyticsSyncAt: undefined }, 226, now)).toBe("STALE");
  });
});