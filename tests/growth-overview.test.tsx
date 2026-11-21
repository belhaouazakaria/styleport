import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const db = vi.hoisted(() => ({
  accounts: vi.fn(),
  native: vi.fn(),
  sources: vi.fn(),
  nativeCount: vi.fn(),
  sourceCount: vi.fn(),
  groups: vi.fn(),
  pins: vi.fn(),
  rotation: vi.fn(),
  policy: vi.fn(),
  activity: vi.fn(),
  activityOne: vi.fn(),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    growthPinterestAccount: { findMany: db.accounts },
    growthPinPublication: { findMany: db.native, count: db.nativeCount },
    growthViralPinTest: { findMany: db.sources, count: db.sourceCount },
    growthViralProgramSettings: { findUnique: db.policy },
    growthApprovalRequest: { count: vi.fn().mockResolvedValue(3) },
    growthPinCandidate: { count: vi.fn().mockResolvedValue(5) },
    growthNotification: { count: vi.fn().mockResolvedValue(0) },
    growthActivity: { findMany: db.activity, findFirst: db.activityOne },
    growthPinterestPinMetricDaily: { groupBy: db.groups },
    growthPinterestPin: { findMany: db.pins },
  },
}));
vi.mock("@/lib/growth/portfolio/daily-rotation-store", () => ({
  readDailyRotation: db.rotation,
}));
import {
  accountTrend,
  getGrowthPublishingOverview,
  overviewWindow,
  publicationState,
} from "@/lib/growth/overview";
import {
  GrowthOverviewPanels,
  MetricChart,
} from "@/components/admin/growth-overview-panels";

const now = new Date("2026-11-18T12:30:00Z");
beforeEach(() => {
  vi.clearAllMocks();
  db.activity.mockResolvedValue([]);
  db.activityOne.mockResolvedValue(null);
  db.policy.mockResolvedValue({ mode: "ACTIVE", maxPinsPerDay: 5 });
  db.rotation.mockResolvedValue({
    accountId: "main",
    targetPins: 5,
    original: 3,
    source: 2,
    status: "READY",
  });
  db.accounts.mockResolvedValue([
    {
      id: "main",
      username: "saytwist",
      connectionStatus: "CONNECTED",
      analyticsState: null,
      dailyMetrics: [],
    },
    {
      id: "ideas",
      username: "saytwistideas",
      connectionStatus: "CONNECTED",
      analyticsState: null,
      dailyMetrics: [],
    },
  ]);
  db.native.mockImplementation(async ({ take }: { take: number }) =>
    take === 10
      ? []
      : [
          {
            id: "posted",
            accountId: "main",
            status: "RECONCILED",
            scheduledAt: new Date("2026-11-18T02:00:00Z"),
            publishedAt: new Date("2026-11-18T02:00:03Z"),
            pinterestPinId: "12345",
            candidate: { title: "Posted translator" },
          },
          {
            id: "scheduled",
            accountId: "main",
            status: "SCHEDULED",
            scheduledAt: new Date("2026-11-18T18:00:00Z"),
            publishedAt: null,
            pinterestPinId: null,
            candidate: { title: "Upcoming translator" },
          },
          {
            id: "failure",
            accountId: "ideas",
            status: "FAILED_TERMINAL",
            scheduledAt: new Date("2026-11-18T07:00:00Z"),
            publishedAt: null,
            pinterestPinId: null,
            candidate: { title: "Failed translator" },
          },
        ],
  );
  db.sources.mockImplementation(async ({ take }: { take: number }) =>
    take === 10
      ? []
      : [
          {
            id: "source",
            accountId: "ideas",
            status: "OUTCOME_UNKNOWN",
            scheduledAt: new Date("2026-11-18T09:00:00Z"),
            publishedAt: null,
            pinterestPinId: null,
            title: "Source experiment",
          },
        ],
  );
  db.nativeCount.mockResolvedValue(3);
  db.sourceCount.mockResolvedValue(1);
  db.groups.mockResolvedValue([]);
  db.pins.mockResolvedValue([]);
});
afterEach(cleanup);

it("uses UTC boundaries even when the local calendar day differs", () => {
  expect(
    overviewWindow(new Date("2026-11-19T00:30:00+01:00")).today.toISOString(),
  ).toBe("2026-11-18T00:00:00.000Z");
  expect(overviewWindow(now).start.toISOString()).toBe(
    "2026-11-04T00:00:00.000Z",
  );
});

it("keeps missing and processing metrics unknown and suppresses incomplete comparisons", () => {
  const trend = accountTrend(
    [
      {
        metricDate: new Date("2026-11-17"),
        dataStatus: "READY",
        impressions: 0n,
        outboundClicks: 0n,
      },
      {
        metricDate: new Date("2026-11-16"),
        dataStatus: "PROCESSING",
        impressions: 200n,
        outboundClicks: 20n,
      },
    ],
    overviewWindow(now).today,
  );
  expect(trend.points.at(-1)?.clicks).toBe(0);
  expect(trend.points.at(-2)?.clicks).toBeNull();
  expect(trend.points[0].clicks).toBeNull();
  expect(trend).toMatchObject({ readyDays: 1, clicks: 0, clickChange: null });
  expect(accountTrend([], overviewWindow(now).today).clicks).toBeNull();
});

it("calculates an absolute gain only across two complete weeks, including a zero baseline", () => {
  const points = Array.from({ length: 14 }, (_, i) => ({
    metricDate: new Date(Date.UTC(2026, 10, 4 + i)),
    dataStatus: "READY",
    impressions: BigInt(i < 7 ? 0 : 100),
    outboundClicks: BigInt(i < 7 ? 0 : 2),
  }));
  expect(accountTrend(points, overviewWindow(now).today)).toMatchObject({
    clicks: 14,
    clickChange: 14,
    impressionChange: 700,
  });
});

it("never labels an uncertain outcome as posted or silently schedules failed retries", () => {
  expect(publicationState("RECONCILING", "123")).toBe("Checking outcome");
  expect(publicationState("PUBLISHED", null)).toBe("Checking outcome");
  expect(publicationState("OUTCOME_UNKNOWN", null)).toBe("Checking outcome");
  expect(publicationState("RECONCILED", "123")).toBe("Posted");
  expect(publicationState("FAILED_RETRYABLE", null)).toBe("Retry pending");
  expect(publicationState("CLAIMED", null)).toBe("Posting");
});

it("includes past scheduled times and confirmed outcomes, with exact upcoming counts", async () => {
  const data = await getGrowthPublishingOverview(now);
  expect(data.schedule.map((p) => p.state)).toEqual([
    "Posted",
    "Failed",
    "Checking outcome",
    "Scheduled",
  ]);
  expect(data.scheduledCount).toBe(4);
  expect(data.upcoming).toHaveLength(0);
  expect(db.native.mock.calls[0][0].where.OR[0].scheduledAt).toEqual({
    gte: new Date("2026-11-18"),
    lt: new Date("2026-11-19"),
  });
  expect(db.groups.mock.calls[0][0].where.pin).toEqual({
    isActive: true,
    account: { apiEnvironment: "PRODUCTION" },
  });
  expect(JSON.stringify(data)).not.toContain("encryptedCredentials");
});

it("includes source-linked Pins across accounts and qualifies ranking changes by coverage", async () => {
  db.groups
    .mockResolvedValueOnce([
      {
        pinId: "source-pin",
        _sum: { outboundClicks: 15n, impressions: 500n, saves: 3n },
        _count: { _all: 3 },
      },
    ])
    .mockResolvedValueOnce([
      {
        pinId: "source-pin",
        _sum: { outboundClicks: 5n },
        _count: { _all: 7 },
      },
    ]);
  db.pins.mockResolvedValue([
    {
      id: "source-pin",
      title: "Anything Translate",
      accountId: "ideas",
      pinterestPinId: "333",
      lastAnalyticsSyncAt: now,
    },
  ]);
  const data = await getGrowthPublishingOverview(now);
  expect(data.trending[0]).toMatchObject({
    account: "saytwistideas",
    clicks: 15,
    readyDays: 3,
    clickChange: null,
    pinUrl: "https://www.pinterest.com/pin/333/",
  });
  expect(() => JSON.stringify(data)).not.toThrow();
});

it("filters the ledger by account and state and switches display timezone", async () => {
  render(
    <GrowthOverviewPanels data={await getGrowthPublishingOverview(now)} />,
  );
  expect(
    screen.getByText("The SayTwist allocation is full.", { exact: false }),
  ).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("Filter account"), {
    target: { value: "ideas" },
  });
  expect(screen.queryByText("Posted translator")).not.toBeInTheDocument();
  expect(screen.getByText("Failed translator")).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("Filter status"), {
    target: { value: "Failed" },
  });
  expect(screen.queryByText("Source experiment")).not.toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("Display timezone"), {
    target: { value: "UTC" },
  });
  expect(screen.getByText("18 Nov 2026, 07:00")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Impressions" }));
  expect(screen.getByRole("button", { name: "Impressions" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
});

it("breaks chart lines across gaps and exposes missing dates in the chart", () => {
  const points = [
    { day: "2026-11-15", clicks: 2, impressions: 100 },
    { day: "2026-11-16", clicks: null, impressions: null },
    { day: "2026-11-17", clicks: 3, impressions: 200 },
  ];
  const { container } = render(
    <MetricChart points={points} metric="clicks" account="saytwist" />,
  );
  expect(container.querySelectorAll("circle")).toHaveLength(2);
  // Only the three grid lines; no connecting line spans the missing date.
  expect(container.querySelectorAll("line")).toHaveLength(3);
  expect(
    within(screen.getByRole("img")).getByText("2026-11-16: unavailable"),
  ).toBeInTheDocument();
});

it("shows an audited schedule repair without claiming the Pin has been published", async () => {
  db.activityOne.mockImplementation(async ({ where }) =>
    where.action === "SOURCE_SCHEDULE_RECOVERY_POLICY_UPDATED"
      ? { summary: { enabled: true } }
      : { createdAt: now, summary: { status: "HEALTHY" } },
  );
  db.activity.mockImplementation(async ({ where }) =>
    where.action === "SOURCE_SCHEDULE_REPAIRED"
      ? [
          {
            entityId: "source-fixed",
            createdAt: now,
            summary: {
              originalId: "source-old",
              previousScheduledAt: "2026-11-18T02:00:00.000Z",
              scheduledAt: "2026-11-18T16:17:00.000Z",
              automatic: true,
            },
          },
        ]
      : [],
  );
  db.sources.mockImplementation(async ({ take }) =>
    take === 10
      ? []
      : [
          {
            id: "source-fixed",
            title: "Corrected source Pin",
            accountId: "main",
            status: "APPROVED",
            scheduledAt: new Date("2026-11-18T16:17:00Z"),
            publishedAt: null,
            pinterestPinId: null,
          },
        ],
  );
  const data = await getGrowthPublishingOverview(now);
  expect(data.schedule.find((row) => row.id === "source-fixed")).toMatchObject({
    state: "Scheduled",
    overdue: false,
    recovery: { automatic: true, replaced: false },
  });
  render(<GrowthOverviewPanels data={data} />);
  expect(
    screen.getByText("Automatic schedule recovery is on"),
  ).toBeInTheDocument();
  expect(screen.getByText(/Schedule fixed automatically/)).toHaveTextContent(
    "Awaiting publication",
  );
  expect(
    screen.getByText(/1 source Pin schedule fixed today/),
  ).toBeInTheDocument();
});
