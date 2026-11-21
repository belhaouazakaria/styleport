// @vitest-environment node
import { beforeEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({
  transaction: vi.fn(),
  policy: vi.fn(),
  settings: vi.fn(),
  program: vi.fn(),
  owner: vi.fn(),
  native: vi.fn(),
  source: vi.fn(),
  pending: vi.fn(),
  boards: vi.fn(),
  cancel: vi.fn(),
  create: vi.fn(),
  activity: vi.fn(),
  rotation: vi.fn(),
  busy: vi.fn(),
  lock: vi.fn(),
}));
vi.mock("@/lib/prisma", () => ({ prisma: { $transaction: m.transaction } }));
vi.mock("@/lib/growth/portfolio/daily-rotation-store", () => ({
  readDailyRotation: m.rotation,
}));
vi.mock("@/lib/growth/operations/approved-publication-queue", () => ({
  countBlockingGrowthJobs: m.busy,
}));
import {
  recoverApprovedSourceSchedules,
  SOURCE_RECOVERY_POLICY,
} from "@/lib/growth/viral/source-schedule-recovery";
const now = new Date("2026-11-21T12:00:00Z");
const tx = {
  $executeRaw: m.lock,
  $queryRaw: m.lock,
  growthActivity: { findFirst: m.policy, create: m.activity },
  growthSettings: { findUnique: m.settings },
  growthViralProgramSettings: { findUnique: m.program },
  user: { findUnique: m.owner },
  growthPinPublication: { findMany: m.native },
  growthViralPinTest: {
    findMany: m.source,
    updateMany: m.cancel,
    create: m.create,
  },
  growthApprovalRequest: { findMany: m.pending },
  growthPinterestBoard: { findMany: m.boards },
};
function pin(
  id: string,
  scheduledAt = "2026-11-21T02:00:00Z",
  title = "Patrick Jane Meme Translator",
) {
  const sourceUrl = "https://anythingtranslate.com/translators/" + id + "/";
  return {
    id,
    conceptId: "concept-" + id,
    channel: "SOURCE",
    status: "APPROVED",
    scheduledAt: new Date(scheduledAt),
    publishedAt: null,
    publishClaimAt: null,
    lastErrorCode: null,
    pinterestPinId: null,
    publicationAttemptKey: "original-" + id,
    approvedAt: new Date("2026-11-18T07:00:00Z"),
    approvedById: "owner",
    accountId: "main",
    boardId: "board",
    createdAt: new Date("2026-11-18T06:00:00Z"),
    rightsVerified: true,
    designGenerationKind: "AI",
    assetChecksum: "checksum",
    assetPublicPath: "/image.png",
    title,
    description: "Original description",
    destinationUrl: sourceUrl,
    concept: { title, sourceUrl, status: "DISCOVERED" },
  };
}
let pins = [pin("patrick")];
let todaySources: ReturnType<typeof pin>[] = [];
beforeEach(() => {
  vi.clearAllMocks();
  pins = [pin("patrick")];
  todaySources = [pins[0]];
  m.transaction.mockImplementation((fn) => fn(tx));
  m.policy.mockImplementation(({ where }) =>
    where.action === SOURCE_RECOVERY_POLICY
      ? {
          id: "consent",
          actorUserId: "owner",
          summary: { enabled: true, version: 1 },
        }
      : null,
  );
  m.settings.mockResolvedValue({
    enabled: false,
    attributionEnabled: false,
    workerActivationExpiresAt: null,
  });
  m.program.mockResolvedValue({ mode: "ACTIVE", maxPinsPerDay: 5 });
  m.owner.mockResolvedValue({ role: "ADMIN" });
  m.busy.mockResolvedValue(0);
  m.rotation.mockResolvedValue({
    accountId: "main",
    original: 3,
    source: 2,
    targetPins: 5,
  });
  m.native.mockResolvedValue(
    [14, 18, 23].map((hour) => ({
      scheduledAt: new Date(`2026-11-21T${hour}:00:00Z`),
      publishedAt: null,
    })),
  );
  m.source.mockImplementation(({ include }) =>
    Promise.resolve(include ? pins : [...todaySources]),
  );
  m.pending.mockResolvedValue([]);
  m.boards.mockResolvedValue([{ id: "board" }]);
  m.cancel.mockResolvedValue({ count: 1 });
  m.create.mockImplementation(({ data }) =>
    Promise.resolve({ ...data, id: "replacement-" + data.conceptId }),
  );
});
it("preserves immutable originals and replaces missed and future approvals into two safe slots", async () => {
  pins.push(pin("funny", "2026-11-24T23:00:00Z", "Funny Random Translator"));
  const result = await recoverApprovedSourceSchedules(now);
  expect(result).toEqual({ status: "HEALTHY", repaired: 2 });
  expect(
    m.cancel.mock.calls.every(
      ([arg]) => JSON.stringify(arg.data) === '{"status":"CANCELLED"}',
    ),
  ).toBe(true);
  const replacements = m.create.mock.calls.map(([arg]) => arg.data);
  expect(replacements.map((row) => row.scheduledAt.toISOString())).toEqual([
    "2026-11-21T16:17:00.000Z",
    "2026-11-21T20:17:00.000Z",
  ]);
  expect(replacements[0]).toMatchObject({
    destinationUrl: pins[0].destinationUrl,
    accountId: "main",
    boardId: "board",
    assetChecksum: "checksum",
    approvedAt: pins[0].approvedAt,
    approvedById: "owner",
  });
  expect(m.activity).toHaveBeenCalledWith(
    expect.objectContaining({
      data: expect.objectContaining({
        action: "SOURCE_SCHEDULE_REPAIRED",
        summary: expect.objectContaining({
          originalId: "patrick",
          automatic: true,
          consentId: "consent",
          publicationAttempted: false,
        }),
      }),
    }),
  );
});
it("requires durable owner authorization and rechecks the owner's admin role", async () => {
  m.policy.mockResolvedValue(null);
  expect(await recoverApprovedSourceSchedules(now)).toEqual({
    status: "DISABLED",
    repaired: 0,
  });
  expect(m.cancel).not.toHaveBeenCalled();
  m.policy.mockImplementation(({ where }) =>
    where.action === SOURCE_RECOVERY_POLICY
      ? { actorUserId: "owner", summary: { enabled: true, version: 1 } }
      : null,
  );
  m.owner.mockResolvedValue({ role: "USER" });
  expect((await recoverApprovedSourceSchedules(now)).status).toBe("DISABLED");
});
it("throttles checks and does not run while an existing worker holds the lease", async () => {
  m.policy.mockImplementation(({ where }) =>
    where.action === SOURCE_RECOVERY_POLICY
      ? { actorUserId: "owner", summary: { enabled: true, version: 1 } }
      : { createdAt: now },
  );
  expect((await recoverApprovedSourceSchedules(now)).status).toBe(
    "RECENTLY_CHECKED",
  );
  m.policy.mockImplementation(({ where }) =>
    where.action === SOURCE_RECOVERY_POLICY
      ? { actorUserId: "owner", summary: { enabled: true, version: 1 } }
      : null,
  );
  m.settings.mockResolvedValue({ enabled: true });
  expect((await recoverApprovedSourceSchedules(now)).status).toBe("BUSY");
  expect(m.cancel).not.toHaveBeenCalled();
});
it("leaves valid commitments alone and becomes idempotent after repair", async () => {
  pins = [
    pin("patrick", "2026-11-21T16:17:00Z"),
    pin("funny", "2026-11-21T20:17:00Z", "Funny Random Translator"),
  ];
  todaySources = [...pins];
  expect(await recoverApprovedSourceSchedules(now)).toEqual({
    status: "HEALTHY",
    repaired: 0,
  });
  expect(m.cancel).not.toHaveBeenCalled();
});
it("respects pending reviews, exact spacing and the five-Pin daily cap", async () => {
  pins = [pin("funny", "2026-11-24T23:00:00Z", "Funny Random Translator")];
  todaySources = [];
  m.pending.mockResolvedValue(
    ["16:17", "20:17"].map((time) => ({
      kind: "SOURCE_PIN",
      snapshot: { scheduledAt: `2026-11-21T${time}:00Z` },
    })),
  );
  expect((await recoverApprovedSourceSchedules(now)).repaired).toBe(0);
  expect(m.cancel).not.toHaveBeenCalled();
});
it("never resets uncertain or claimed Pins and uses a conditional cancellation against claim races", async () => {
  await recoverApprovedSourceSchedules(now);
  expect(m.source).toHaveBeenCalledWith(
    expect.objectContaining({
      where: expect.objectContaining({
        status: "APPROVED",
        publishClaimAt: null,
        pinterestPinId: null,
        lastErrorCode: null,
        approvedById: "owner",
        accountId: "main",
      }),
    }),
  );
  expect(m.cancel).toHaveBeenCalledWith(
    expect.objectContaining({
      where: expect.objectContaining({
        status: "APPROVED",
        publishClaimAt: null,
        pinterestPinId: null,
        publicationAttemptKey: "original-patrick",
      }),
    }),
  );
  m.cancel.mockResolvedValue({ count: 0 });
  await expect(recoverApprovedSourceSchedules(now)).rejects.toThrow(
    "SOURCE_RECOVERY_CLAIM_RACE",
  );
});
it("reports a missing approval instead of inventing consent or relaxing quality", async () => {
  pins = [];
  todaySources = [];
  expect(await recoverApprovedSourceSchedules(now)).toEqual({
    status: "WAITING",
    repaired: 0,
  });
  expect(m.activity).toHaveBeenLastCalledWith(
    expect.objectContaining({
      data: expect.objectContaining({
        summary: expect.objectContaining({
          status: "WAITING_FOR_APPROVED_PIN_OR_SAFE_SLOT",
          providerWrites: 0,
        }),
      }),
    }),
  );
  pins = [pin("bad", "2026-11-24T23:00:00Z", "Unknown Translator")];
  expect((await recoverApprovedSourceSchedules(now)).repaired).toBe(0);
});
it("honors deferred approval waiting periods and leaves no-slot cases visible", async () => {
  pins = [pin("deferred", "2026-11-21T02:00:00Z", "Gentle Translator")];
  pins[0].approvedAt = new Date("2026-11-21T07:00:00Z");
  todaySources = [...pins];
  expect((await recoverApprovedSourceSchedules(now)).repaired).toBe(0);
  expect(m.create).not.toHaveBeenCalled();
  pins = [pin("patrick")];
  todaySources = [...pins];
  expect(
    (await recoverApprovedSourceSchedules(new Date("2026-11-21T23:10:00Z")))
      .status,
  ).toBe("WAITING");
});
