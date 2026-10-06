import { randomUUID } from "node:crypto";
import {
  GrowthAttributionEventType,
  GrowthPinterestApiEnvironment,
  GrowthPinterestConnectionStatus,
  GrowthPinterestPublicationRole,
  TranslationStatus,
} from "@prisma/client";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import { cleanupAttributionDetail } from "@/lib/growth/attribution/retention";
import { issueAttributionRefForPin } from "@/lib/growth/attribution/refs";
import {
  recordClientAttributionEvent,
  recordQualifiedPinterestLanding,
  recordTrustedTranslationCompletion,
} from "@/lib/growth/attribution/sessions";
import { buildAttributionUrl } from "@/lib/growth/attribution/urls";
import { prisma } from "@/lib/prisma";

const enabled = process.env.RUN_GROWTH_ATTRIBUTION_DB_TESTS === "1";
const databaseDescribe = enabled ? describe.sequential : describe.skip;
const requiredDatabaseName = "saytwist_growth_phase5_attribution_test";

if (enabled) {
  const explicitUrl = process.env.GROWTH_ATTRIBUTION_TEST_DATABASE_URL;
  if (!explicitUrl || process.env.DATABASE_URL !== explicitUrl)
    throw new Error(
      "Growth attribution DB tests require matching explicit test database URLs.",
    );
  const parsed = new URL(explicitUrl);
  if (
    !["localhost", "127.0.0.1", "::1"].includes(parsed.hostname) ||
    decodeURIComponent(parsed.pathname.slice(1)) !== requiredDatabaseName
  ) {
    throw new Error(
      `Growth attribution DB tests refuse every target except local database ${requiredDatabaseName}.`,
    );
  }
}

async function clean() {
  await prisma.growthAttributionEvent.deleteMany();
  await prisma.growthAttributionSession.deleteMany();
  await prisma.growthAttributionDailyAggregate.deleteMany();
  await prisma.growthAttributionRef.deleteMany();
  await prisma.translationLog.deleteMany();
  await prisma.growthPinterestPinMetricDaily.deleteMany();
  await prisma.growthPinterestPin.deleteMany();
  await prisma.growthPinterestAnalyticsState.deleteMany();
  await prisma.growthPinterestBoard.deleteMany();
  await prisma.growthPinterestAccount.deleteMany();
  await prisma.growthSettings.deleteMany();
  await prisma.translator.deleteMany();
}

function browserRequest(cookie?: string) {
  return new Request("https://saytwist.com/api/growth/attribution/landing", {
    method: "POST",
    headers: {
      origin: "https://saytwist.com",
      "sec-fetch-site": "same-origin",
      "user-agent": "Mozilla/5.0",
      ...(cookie ? { cookie: `stw_attr=${cookie}` } : {}),
    },
  });
}

async function fixture() {
  await prisma.growthSettings.create({
    data: { id: "global", attributionEnabled: true },
  });
  const translator = await prisma.translator.create({
    data: {
      name: "Attribution Translator",
      slug: `attribution-${randomUUID()}`,
      title: "Attribution",
      subtitle: "Test",
      shortDescription: "Test",
      sourceLabel: "Input",
      targetLabel: "Output",
      promptSystem: "System",
      promptInstructions: "Instructions",
    },
  });
  const account = await prisma.growthPinterestAccount.create({
    data: {
      pinterestAccountId: `account-${randomUUID()}`,
      publicationRole: GrowthPinterestPublicationRole.SAYTWIST,
      username: `user-${randomUUID()}`,
      apiEnvironment: GrowthPinterestApiEnvironment.PRODUCTION,
      connectionStatus: GrowthPinterestConnectionStatus.DISCONNECTED,
      grantedScopes: ["pins:read"],
      disconnectedAt: new Date(),
    },
  });
  const pin = await prisma.growthPinterestPin.create({
    data: {
      accountId: account.id,
      pinterestPinId: `pin-${randomUUID()}`,
      destinationUrl: `https://saytwist.com/translators/${translator.slug}`,
      isActive: true,
      analyticsEligible: true,
      lastSeenAt: new Date(),
      lastSyncedAt: new Date(),
    },
  });
  const issued = await issueAttributionRefForPin(pin.id);
  return { translator, account, pin, issued };
}

async function successfulLog(translatorId: string) {
  return prisma.translationLog.create({
    data: {
      translatorId,
      inputText: "existing core log text",
      outputText: "existing core output",
      status: TranslationStatus.SUCCESS,
      inputLength: 22,
      outputLength: 20,
    },
  });
}

beforeAll(() => {
  vi.stubEnv("APP_BASE_URL", "https://saytwist.com");
  vi.stubEnv("GROWTH_ATTRIBUTION_COLLECTION_ENABLED", "true");
});
beforeEach(async () => {
  vi.stubEnv("GROWTH_ATTRIBUTION_COLLECTION_ENABLED", "true");
  await clean();
});
afterAll(async () => {
  if (enabled) await clean();
  vi.unstubAllEnvs();
  await prisma.$disconnect();
});

databaseDescribe("Growth Phase 5 attribution persistence", () => {
  it("traces a valid Pin session to trusted translations and freezes the first qualified assignment", async () => {
    const { translator, account, issued } = await fixture();
    expect(buildAttributionUrl(issued.ref)).toContain(
      `pin_ref=${issued.ref.publicRef}`,
    );
    const firstIssuedAgain = await issueAttributionRefForPin(issued.ref.pinId!);
    expect(firstIssuedAgain).toMatchObject({
      created: false,
      ref: { id: issued.ref.id },
    });

    const landing = await recordQualifiedPinterestLanding({
      request: browserRequest(),
      ref: issued.ref,
      destinationPath: issued.ref.destinationPath,
      utmCampaign: issued.ref.campaignKey,
      utmContent: issued.ref.contentKey,
      clientEventKey: "landing-event-0001",
      now: new Date("2026-10-06T10:00:00Z"),
    });
    expect(landing.collected).toBe(true);
    if (!landing.collected) throw new Error("Expected collected landing.");
    const request = browserRequest(landing.token);
    expect(
      await recordQualifiedPinterestLanding({
        request,
        ref: issued.ref,
        destinationPath: issued.ref.destinationPath,
        utmCampaign: issued.ref.campaignKey,
        utmContent: issued.ref.contentKey,
        clientEventKey: "landing-event-0001",
        now: new Date("2026-10-06T10:00:30Z"),
      }),
    ).toMatchObject({ collected: true, duplicate: true });
    expect(
      await prisma.growthAttributionEvent.count({
        where: { type: GrowthAttributionEventType.PINTEREST_LANDING },
      }),
    ).toBe(1);
    await recordClientAttributionEvent({
      request,
      type: GrowthAttributionEventType.TRANSLATOR_VIEW,
      translatorSlug: translator.slug,
      clientEventKey: "view-event-0000001",
      now: new Date("2026-10-06T10:01:00Z"),
    });
    await recordClientAttributionEvent({
      request,
      type: GrowthAttributionEventType.INPUT_STARTED,
      translatorSlug: translator.slug,
      clientEventKey: "input-event-000001",
      now: new Date("2026-10-06T10:02:00Z"),
    });
    const firstLog = await successfulLog(translator.id);
    const first = await recordTrustedTranslationCompletion({
      request,
      translationLogId: firstLog.id,
      translatorId: translator.id,
      now: new Date("2026-10-06T10:03:00Z"),
    });
    expect(first).toMatchObject({ collected: true, primary: true });
    expect(
      await recordTrustedTranslationCompletion({
        request,
        translationLogId: firstLog.id,
        translatorId: translator.id,
        now: new Date("2026-10-06T10:04:00Z"),
      }),
    ).toMatchObject({ duplicate: true });

    const secondLog = await successfulLog(translator.id);
    expect(
      await recordTrustedTranslationCompletion({
        request,
        translationLogId: secondLog.id,
        translatorId: translator.id,
        now: new Date("2026-10-06T10:05:00Z"),
      }),
    ).toMatchObject({ primary: false });
    const sessionBeforeNewTouch =
      await prisma.growthAttributionSession.findUniqueOrThrow({
        where: { tokenHash: landing.session.tokenHash },
      });
    expect(sessionBeforeNewTouch.qualifiedAttributionRefId).toBe(issued.ref.id);

    const secondPin = await prisma.growthPinterestPin.create({
      data: {
        accountId: account.id,
        pinterestPinId: `pin-${randomUUID()}`,
        destinationUrl: `https://saytwist.com/translators/${translator.slug}`,
        isActive: true,
        analyticsEligible: true,
        lastSeenAt: new Date(),
        lastSyncedAt: new Date(),
      },
    });
    const secondRef = await issueAttributionRefForPin(secondPin.id);
    await recordQualifiedPinterestLanding({
      request,
      ref: secondRef.ref,
      destinationPath: secondRef.ref.destinationPath,
      utmCampaign: secondRef.ref.campaignKey,
      utmContent: secondRef.ref.contentKey,
      clientEventKey: "landing-event-0002",
      now: new Date("2026-10-06T11:00:00Z"),
    });
    const frozen = await prisma.growthAttributionSession.findUniqueOrThrow({
      where: { id: sessionBeforeNewTouch.id },
    });
    expect(frozen.firstAttributionRefId).toBe(issued.ref.id);
    expect(frozen.lastAttributionRefId).toBe(secondRef.ref.id);
    expect(frozen.qualifiedAttributionRefId).toBe(issued.ref.id);
    expect(frozen.attributionExpiresAt).toEqual(
      new Date("2026-10-13T11:00:00Z"),
    );
    expect(
      await prisma.growthAttributionEvent.count({
        where: { type: GrowthAttributionEventType.PINTEREST_LANDING },
      }),
    ).toBe(2);
    expect(
      await prisma.growthAttributionEvent.count({
        where: { type: GrowthAttributionEventType.TRANSLATION_COMPLETED },
      }),
    ).toBe(2);
    expect(
      (
        await prisma.growthAttributionDailyAggregate.aggregate({
          _sum: {
            landingSessions: true,
            attributedTranslations: true,
            qualifiedConversions: true,
          },
        })
      )._sum,
    ).toMatchObject({
      landingSessions: 1,
      attributedTranslations: 2,
      qualifiedConversions: 1,
    });
  });

  it("starts a fresh session after the attribution window without reviving retained detail", async () => {
    const { translator, issued } = await fixture();
    const firstLanding = await recordQualifiedPinterestLanding({
      request: browserRequest(),
      ref: issued.ref,
      destinationPath: issued.ref.destinationPath,
      utmCampaign: issued.ref.campaignKey,
      utmContent: issued.ref.contentKey,
      clientEventKey: "expired-session-a1",
      now: new Date("2026-10-01T00:00:00Z"),
    });
    if (!firstLanding.collected) throw new Error("Expected collected landing.");
    const firstLog = await successfulLog(translator.id);
    await recordTrustedTranslationCompletion({
      request: browserRequest(firstLanding.token),
      translationLogId: firstLog.id,
      translatorId: translator.id,
      now: new Date("2026-10-01T00:01:00Z"),
    });

    const secondLanding = await recordQualifiedPinterestLanding({
      request: browserRequest(firstLanding.token),
      ref: issued.ref,
      destinationPath: issued.ref.destinationPath,
      utmCampaign: issued.ref.campaignKey,
      utmContent: issued.ref.contentKey,
      clientEventKey: "expired-session-b1",
      now: new Date("2026-10-10T00:00:00Z"),
    });
    if (!secondLanding.collected)
      throw new Error("Expected collected landing.");
    expect(secondLanding.session.id).not.toBe(firstLanding.session.id);
    expect(secondLanding.token).not.toBe(firstLanding.token);
    expect(secondLanding.session.firstAttributionRefId).toBe(issued.ref.id);
    expect(await prisma.growthAttributionSession.count()).toBe(2);

    const secondLog = await successfulLog(translator.id);
    expect(
      await recordTrustedTranslationCompletion({
        request: browserRequest(secondLanding.token),
        translationLogId: secondLog.id,
        translatorId: translator.id,
        now: new Date("2026-10-10T00:01:00Z"),
      }),
    ).toMatchObject({ collected: true, primary: true });
    expect(
      await prisma.growthAttributionEvent.count({
        where: { isPrimaryQualifiedConversion: true },
      }),
    ).toBe(2);
    expect(
      (
        await prisma.growthAttributionDailyAggregate.aggregate({
          _sum: { landingSessions: true, qualifiedConversions: true },
        })
      )._sum,
    ).toMatchObject({ landingSessions: 2, qualifiedConversions: 2 });
  });

  it("rejects invalid landing semantics, expiry, and either disabled collection gate", async () => {
    const { translator, issued } = await fixture();
    const before = await prisma.growthAttributionSession.count();
    expect(
      (
        await recordQualifiedPinterestLanding({
          request: browserRequest(),
          ref: issued.ref,
          destinationPath: issued.ref.destinationPath,
          utmCampaign: "wrong",
          utmContent: issued.ref.contentKey,
          clientEventKey: "invalid-landing-001",
        })
      ).collected,
    ).toBe(false);
    expect(await prisma.growthAttributionSession.count()).toBe(before);

    const landing = await recordQualifiedPinterestLanding({
      request: browserRequest(),
      ref: issued.ref,
      destinationPath: issued.ref.destinationPath,
      utmCampaign: issued.ref.campaignKey,
      utmContent: issued.ref.contentKey,
      clientEventKey: "valid-landing-0001",
      now: new Date("2026-10-01T00:00:00Z"),
    });
    if (!landing.collected) throw new Error("Expected collected landing.");
    const log = await successfulLog(translator.id);
    expect(
      (
        await recordTrustedTranslationCompletion({
          request: browserRequest(landing.token),
          translationLogId: log.id,
          translatorId: translator.id,
          now: new Date("2026-10-09T00:00:00Z"),
        })
      ).collected,
    ).toBe(false);

    await prisma.growthSettings.update({
      where: { id: "global" },
      data: { attributionEnabled: false },
    });
    const beforeDisabled = {
      sessions: await prisma.growthAttributionSession.count(),
      events: await prisma.growthAttributionEvent.count(),
      aggregates: await prisma.growthAttributionDailyAggregate.aggregate({
        _sum: {
          landingSessions: true,
          attributedTranslations: true,
          qualifiedConversions: true,
        },
      }),
    };
    expect(
      (
        await recordQualifiedPinterestLanding({
          request: browserRequest(),
          ref: issued.ref,
          destinationPath: issued.ref.destinationPath,
          utmCampaign: issued.ref.campaignKey,
          utmContent: issued.ref.contentKey,
          clientEventKey: "disabled-landing-01",
        })
      ).collected,
    ).toBe(false);
    const disabledSettingLog = await successfulLog(translator.id);
    expect(
      (
        await recordTrustedTranslationCompletion({
          request: browserRequest(landing.token),
          translationLogId: disabledSettingLog.id,
          translatorId: translator.id,
        })
      ).collected,
    ).toBe(false);
    expect(await prisma.growthAttributionSession.count()).toBe(
      beforeDisabled.sessions,
    );
    expect(await prisma.growthAttributionEvent.count()).toBe(
      beforeDisabled.events,
    );
    expect(
      await prisma.growthAttributionDailyAggregate.aggregate({
        _sum: {
          landingSessions: true,
          attributedTranslations: true,
          qualifiedConversions: true,
        },
      }),
    ).toEqual(beforeDisabled.aggregates);

    await prisma.growthSettings.update({
      where: { id: "global" },
      data: { attributionEnabled: true },
    });
    vi.stubEnv("GROWTH_ATTRIBUTION_COLLECTION_ENABLED", "false");
    const disabledServerLog = await successfulLog(translator.id);
    expect(
      (
        await recordTrustedTranslationCompletion({
          request: browserRequest(landing.token),
          translationLogId: disabledServerLog.id,
          translatorId: translator.id,
        })
      ).collected,
    ).toBe(false);
    expect(await prisma.growthAttributionEvent.count()).toBe(
      beforeDisabled.events,
    );
    expect(
      await prisma.growthAttributionDailyAggregate.aggregate({
        _sum: {
          landingSessions: true,
          attributedTranslations: true,
          qualifiedConversions: true,
        },
      }),
    ).toEqual(beforeDisabled.aggregates);
    vi.stubEnv("GROWTH_ATTRIBUTION_COLLECTION_ENABLED", "true");
  });

  it("serializes concurrent completions to one primary conversion", async () => {
    const { translator, issued } = await fixture();
    const landing = await recordQualifiedPinterestLanding({
      request: browserRequest(),
      ref: issued.ref,
      destinationPath: issued.ref.destinationPath,
      utmCampaign: issued.ref.campaignKey,
      utmContent: issued.ref.contentKey,
      clientEventKey: "concurrent-land-01",
    });
    if (!landing.collected) throw new Error("Expected collected landing.");
    const [left, right] = await Promise.all([
      successfulLog(translator.id),
      successfulLog(translator.id),
    ]);
    const results = await Promise.all([
      recordTrustedTranslationCompletion({
        request: browserRequest(landing.token),
        translationLogId: left.id,
        translatorId: translator.id,
      }),
      recordTrustedTranslationCompletion({
        request: browserRequest(landing.token),
        translationLogId: right.id,
        translatorId: translator.id,
      }),
    ]);
    expect(
      results.filter((result) => result.collected && result.primary),
    ).toHaveLength(1);
    expect(
      await prisma.growthAttributionEvent.count({
        where: { isPrimaryQualifiedConversion: true },
      }),
    ).toBe(1);
    expect(
      (
        await prisma.growthAttributionDailyAggregate.aggregate({
          _sum: { attributedTranslations: true, qualifiedConversions: true },
        })
      )._sum,
    ).toMatchObject({ attributedTranslations: 2, qualifiedConversions: 1 });
  });

  it("deletes retained session detail without losing longer-lived events or durable aggregates", async () => {
    const { issued } = await fixture();
    const landing = await recordQualifiedPinterestLanding({
      request: browserRequest(),
      ref: issued.ref,
      destinationPath: issued.ref.destinationPath,
      utmCampaign: issued.ref.campaignKey,
      utmContent: issued.ref.contentKey,
      clientEventKey: "retention-land-001",
    });
    if (!landing.collected) throw new Error("Expected collected landing.");
    await prisma.growthAttributionSession.updateMany({
      data: { deleteAfter: new Date("2020-01-01") },
    });
    expect(
      await cleanupAttributionDetail({
        now: new Date("2026-10-06T12:00:00Z"),
        limit: 100,
      }),
    ).toMatchObject({ deletedEvents: 0, deletedSessions: 1 });
    expect(
      await prisma.growthAttributionDailyAggregate.count(),
    ).toBeGreaterThan(0);
    expect(await prisma.growthAttributionSession.count()).toBe(0);
    const retainedEvent =
      await prisma.growthAttributionEvent.findFirstOrThrow();
    expect(retainedEvent.sessionId).toBeNull();

    await prisma.growthAttributionEvent.updateMany({
      data: { retentionAt: new Date("2020-01-01") },
    });
    expect(
      await cleanupAttributionDetail({
        now: new Date("2026-10-06T12:00:00Z"),
        limit: 100,
      }),
    ).toMatchObject({ deletedEvents: 1, deletedSessions: 0 });
    expect(
      await prisma.growthAttributionDailyAggregate.count(),
    ).toBeGreaterThan(0);
    expect(await prisma.growthAttributionEvent.count()).toBe(0);
  });
});
