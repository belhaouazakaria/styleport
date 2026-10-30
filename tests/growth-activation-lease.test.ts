import { describe, expect, it } from "vitest";
import { isGrowthWorkerActivationValid, MAX_GROWTH_ACTIVATION_LEASE_MS } from "@/lib/growth/activation-lease";

describe("Phase 14C expiring worker activation", () => {
  const now = new Date("2026-10-29T20:00:00.000Z");
  const at = (ms: number) => new Date(now.getTime() + ms);

  it("requires both the persistent kill switch and a bounded future deadline", () => {
    expect(isGrowthWorkerActivationValid({ enabled: false, workerActivationExpiresAt: at(60_000) }, now)).toBe(false);
    expect(isGrowthWorkerActivationValid({ enabled: true, workerActivationExpiresAt: null }, now)).toBe(false);
    expect(isGrowthWorkerActivationValid({ enabled: true, workerActivationExpiresAt: at(-1) }, now)).toBe(false);
    expect(isGrowthWorkerActivationValid({ enabled: true, workerActivationExpiresAt: at(0) }, now)).toBe(false);
    expect(isGrowthWorkerActivationValid({ enabled: true, workerActivationExpiresAt: new Date(NaN) }, now)).toBe(false);
    expect(isGrowthWorkerActivationValid({ enabled: true, workerActivationExpiresAt: at(60_000) }, now)).toBe(true);
    expect(isGrowthWorkerActivationValid({ enabled: true, workerActivationExpiresAt: at(MAX_GROWTH_ACTIVATION_LEASE_MS) }, now)).toBe(true);
    expect(isGrowthWorkerActivationValid({ enabled: true, workerActivationExpiresAt: at(MAX_GROWTH_ACTIVATION_LEASE_MS + 1) }, now)).toBe(false);
  });
});
