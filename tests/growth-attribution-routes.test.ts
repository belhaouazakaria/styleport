import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  collection: vi.fn(),
  trafficAllowed: vi.fn(),
  findRef: vi.fn(),
  landing: vi.fn(),
  clientEvent: vi.fn(),
  guard: vi.fn(),
  issueRef: vi.fn(),
  enqueueCleanup: vi.fn(),
}));

vi.mock("@/lib/growth/attribution/config", () => ({
  getAttributionCollectionStatus: mocks.collection,
}));
vi.mock("@/lib/growth/attribution/traffic", async (original) => {
  const actual =
    await original<typeof import("@/lib/growth/attribution/traffic")>();
  return { ...actual, attributionRequestAllowed: mocks.trafficAllowed };
});
vi.mock("@/lib/growth/attribution/refs", () => ({
  findActiveAttributionRef: mocks.findRef,
  issueAttributionRefForPin: mocks.issueRef,
}));
vi.mock("@/lib/growth/attribution/sessions", () => ({
  recordQualifiedPinterestLanding: mocks.landing,
  recordClientAttributionEvent: mocks.clientEvent,
  attributionCookieOptions: () => ({
    httpOnly: true,
    sameSite: "lax",
    secure: true,
    path: "/",
    maxAge: 604_800,
  }),
}));
vi.mock("@/lib/permissions", () => ({ adminRouteGuard: mocks.guard }));
vi.mock("@/lib/growth/attribution/retention", () => ({
  enqueueAttributionRetentionCleanup: mocks.enqueueCleanup,
}));

import { POST as landingPost } from "@/app/api/growth/attribution/landing/route";
import { POST as eventPost } from "@/app/api/growth/attribution/event/route";
import { POST as issuePost } from "@/app/api/admin/growth/attribution/refs/route";

const settings = { attributionWindowDays: 7 };
const ref = {
  id: "ref-id",
  publicRef: `pa_${"a".repeat(32)}`,
  destinationPath: "/translators/regal",
  campaignKey: "saytwist",
  contentKey: "content",
  modelVersion: "pinterest_organic_v1",
};

function request(path: string, body: unknown) {
  return new Request(`https://saytwist.com${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: "https://saytwist.com",
      "sec-fetch-site": "same-origin",
    },
    body: JSON.stringify(body),
  });
}

describe("Growth attribution routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("APP_BASE_URL", "https://saytwist.com");
    mocks.collection.mockResolvedValue({
      enabled: true,
      state: "ENABLED",
      settings,
    });
    mocks.trafficAllowed.mockReturnValue(true);
    mocks.guard.mockResolvedValue(null);
  });
  afterEach(() => vi.unstubAllEnvs());

  it("does no public persistence and sets no cookie when the server gate is disabled", async () => {
    mocks.collection.mockResolvedValueOnce({
      enabled: false,
      state: "DISABLED_BY_SERVER",
      settings,
    });
    const response = await landingPost(
      request("/api/growth/attribution/landing", {}),
    );
    expect(await response.json()).toMatchObject({
      ok: true,
      collected: false,
      state: "DISABLED_BY_SERVER",
    });
    expect(response.headers.get("set-cookie")).toBeNull();
    expect(mocks.findRef).not.toHaveBeenCalled();
    expect(mocks.landing).not.toHaveBeenCalled();
  });

  it("accepts only a valid issued ref and emits a secure opaque cookie", async () => {
    mocks.findRef.mockResolvedValue(ref);
    mocks.landing.mockResolvedValue({
      collected: true,
      token: "opaque-token",
      settings,
    });
    const response = await landingPost(
      request("/api/growth/attribution/landing", {
        pinRef: ref.publicRef,
        utmSource: "pinterest",
        utmMedium: "organic",
        utmCampaign: "saytwist",
        utmContent: "content",
        destinationPath: "/translators/regal",
        eventKey: "landing-event-0001",
      }),
    );
    expect(response.status).toBe(200);
    const cookie = response.headers.get("set-cookie") || "";
    expect(cookie).toContain("stw_attr=opaque-token");
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("Secure");
    expect(cookie).toContain("SameSite=lax");
  });

  it("rejects UTM-only and malformed client events", async () => {
    const landing = await landingPost(
      request("/api/growth/attribution/landing", {
        pinRef: "invalid",
        utmSource: "pinterest",
        utmMedium: "organic",
        utmCampaign: "saytwist",
        utmContent: "content",
        destinationPath: "/translators/regal",
        eventKey: "landing-event-0001",
      }),
    );
    expect(landing.status).toBe(400);
    expect(mocks.findRef).not.toHaveBeenCalled();
    const event = await eventPost(
      request("/api/growth/attribution/event", {
        type: "TRANSLATION_COMPLETED",
        translatorSlug: "regal",
        eventKey: "event-event-00001",
      }),
    );
    expect(event.status).toBe(400);
    expect(mocks.clientEvent).not.toHaveBeenCalled();
  });

  it("ignores bot or prefetch traffic before ref lookup", async () => {
    mocks.trafficAllowed.mockReturnValueOnce(false);
    const response = await landingPost(
      request("/api/growth/attribution/landing", {}),
    );
    expect(await response.json()).toMatchObject({ collected: false });
    expect(mocks.findRef).not.toHaveBeenCalled();
  });

  it("requires admin authorization and same-origin ref issuance", async () => {
    const denied = new Response("denied", { status: 401 });
    mocks.guard.mockResolvedValueOnce(denied);
    expect(
      await issuePost(
        request("/api/admin/growth/attribution/refs", { pinId: "pin-1" }),
      ),
    ).toBe(denied);
    mocks.guard.mockResolvedValueOnce(null);
    const crossOrigin = new Request(
      "https://saytwist.com/api/admin/growth/attribution/refs",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "https://evil.example",
          "sec-fetch-site": "cross-site",
        },
        body: JSON.stringify({ pinId: "pin-1" }),
      },
    );
    expect((await issuePost(crossOrigin)).status).toBe(403);
    expect(mocks.issueRef).not.toHaveBeenCalled();
  });

  it("returns the stable generated test URL without exposing internal identifiers", async () => {
    mocks.issueRef.mockResolvedValue({
      ref,
      url: `https://saytwist.com/translators/regal?pin_ref=${ref.publicRef}`,
      created: false,
    });
    const response = await issuePost(
      request("/api/admin/growth/attribution/refs", { pinId: "pin-internal" }),
    );
    const body = await response.json();
    expect(body).toMatchObject({
      ok: true,
      publicRef: ref.publicRef,
      created: false,
    });
    expect(body.url).not.toContain("pin-internal");
  });
});
