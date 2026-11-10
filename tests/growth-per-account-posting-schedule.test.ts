import { describe, expect, it } from "vitest";
import {
  ACCOUNT_DAILY_WINDOWS,
  planAccountPostingSchedule,
} from "@/lib/growth/portfolio/per-account-posting-schedule";

const base = {
  accountId: "saytwist_main", localDate: "2026-11-10",
  timeZone: "America/New_York", plannedPins: 10,
  evidence: [],
  now: new Date("2026-11-10T00:00:00Z"),
};
describe("account-local evidence based scheduling", () => {
  it("offers 10 distinct slots per account with cold start and 105m separation", () => {
    const plan = planAccountPostingSchedule(base);
    expect(plan.accountId).toBe("saytwist_main");
    expect(plan.windows).toHaveLength(10);
    expect(plan.windows.map(x => x.localTime).sort()).toEqual(
      [...ACCOUNT_DAILY_WINDOWS].sort());
    expect(plan.windows.every(x => x.strategy === "COLD_START")).toBe(true);
    for (let i = 1; i < plan.windows.length; i++) {
      expect(Date.parse(plan.windows[i].scheduledAt) -
        Date.parse(plan.windows[i-1].scheduledAt)).toBeGreaterThanOrEqual(90 * 60_000);
    }
    expect(plan.explicitlyApprovedPins).toBe(0);
  });
  it("uses independently mature data for one account and explores some slots", () => {
    const data = ACCOUNT_DAILY_WINDOWS.map((slot, i) => ({
      slot, samplePins: 5, impressions: 2000,
      outboundClicks: 100 - i * 5, saves: 50,
      ready: true,
    }));
    const plan = planAccountPostingSchedule({
      ...base, plannedPins: 5, evidence: data,
    });
    expect(plan.evidence).toBe("QUALIFIED");
    expect(plan.windows).toHaveLength(5);
    expect(plan.windows.filter(x => x.strategy === "EXPLOIT")).toHaveLength(4);
    expect(plan.windows.filter(x => x.strategy === "EXPLORE")).toHaveLength(1);
    expect(plan.windows.find(x => x.localTime === "07:00")).toMatchObject({
      strategy: "EXPLOIT", qualified: true,
    });
  });
  it("converts local scheduling to correct winter/summer UTC including DST", () => {
    const winter = planAccountPostingSchedule(base);
    expect(winter.windows.find(x => x.localTime === "07:00")!.scheduledAt)
      .toBe("2026-11-10T12:00:00.000Z");
    const summer = planAccountPostingSchedule({
      ...base, localDate: "2026-07-10",
      now: new Date("2026-07-10T00:00:00Z"),
    });
    expect(summer.windows.find(x => x.localTime === "07:00")!.scheduledAt)
      .toBe("2026-07-10T11:00:00.000Z");
  });
  it("refuses forged or stale data and never schedules past slots", () => {
    expect(() => planAccountPostingSchedule({
      ...base, plannedPins: 11,
    })).toThrow("ACCOUNT_SCHEDULE_INPUT_INVALID");
    expect(() => planAccountPostingSchedule({
      ...base, localDate: "2026-02-30",
    })).toThrow();
    expect(() => planAccountPostingSchedule({
      ...base, timeZone: "Imaginary/Timezone",
    })).toThrow("ACCOUNT_SCHEDULE_TIMEZONE_INVALID");
    expect(() => planAccountPostingSchedule({
      ...base, evidence: [{
        slot: "07:00", samplePins: 5, impressions: 100,
        outboundClicks: 101, saves: 0, ready: true,
      }],
    })).toThrow("ACCOUNT_SCHEDULE_EVIDENCE_INVALID");
    const later = planAccountPostingSchedule({
      ...base, now: new Date("2026-11-10T18:00:00Z"),
    });
    expect(later.windows.every(x =>
      Date.parse(x.scheduledAt) > Date.parse("2026-11-10T18:00:00Z"))).toBe(true);
    expect(later.windows.length).toBeLessThan(10);
  });
});
