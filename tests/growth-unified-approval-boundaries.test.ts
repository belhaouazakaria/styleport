// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  guard: vi.fn(),
  session: vi.fn(),
  sameOrigin: vi.fn(),
  native: vi.fn(),
  source: vi.fn(),
  automaticSource: vi.fn(),
  decide: vi.fn(),
}));
vi.mock("@/lib/permissions", () => ({
  adminRouteGuard: mocks.guard,
  getSessionOrNull: mocks.session,
}));
vi.mock("@/lib/growth/request-security", () => ({
  isSameOriginMutation: mocks.sameOrigin,
}));
vi.mock("@/lib/growth/approvals/service", () => ({
  createNativePinReview: mocks.native,
  createSourcePinReview: mocks.source,
  decideGrowthReview: mocks.decide,
}));
vi.mock("@/lib/growth/approvals/source-plan", () => ({
  prepareSourceReviewAutomatically: mocks.automaticSource,
}));
import { PATCH, POST } from "@/app/api/admin/growth/approvals/route";
const request = (body: unknown) =>
  new Request("https://saytwist.com/api/admin/growth/approvals", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: "https://saytwist.com",
    },
    body: JSON.stringify(body),
  });
beforeEach(() => {
  vi.clearAllMocks();
  mocks.guard.mockResolvedValue(null);
  mocks.session.mockResolvedValue({ user: { id: "verified-session-owner" } });
  mocks.sameOrigin.mockReturnValue(true);
  mocks.native.mockResolvedValue({ id: "review", status: "PENDING" });
  mocks.decide.mockResolvedValue({ status: "APPROVED", reused: false });
});
describe("Approval Center authorization", () => {
  it("denies unauthenticated requests before reading a session or preparing evidence", async () => {
    mocks.guard.mockResolvedValue(new Response(null, { status: 403 }));
    expect(
      (await POST(request({ kind: "NATIVE_PIN", candidateId: "candidate" })))
        .status,
    ).toBe(403);
    expect(mocks.session).not.toHaveBeenCalled();
    expect(mocks.native).not.toHaveBeenCalled();
  });
  it("denies cross-origin mutations before any operation", async () => {
    mocks.sameOrigin.mockReturnValue(false);
    expect(
      (
        await PATCH(
          request({
            requestId: "request",
            action: "APPROVE",
            snapshotChecksum: "a".repeat(64),
          }),
        )
      ).status,
    ).toBe(403);
    expect(mocks.decide).not.toHaveBeenCalled();
  });
  it("refuses mass-assigned owner identity and requires an exact checksum", async () => {
    expect(
      (
        await POST(
          request({
            kind: "NATIVE_PIN",
            candidateId: "candidate",
            ownerUserId: "attacker",
          }),
        )
      ).status,
    ).toBe(400);
    expect(
      (await PATCH(request({ requestId: "request", action: "APPROVE" })))
        .status,
    ).toBe(400);
    expect(mocks.native).not.toHaveBeenCalled();
    expect(mocks.decide).not.toHaveBeenCalled();
  });
  it("takes the decision actor only from the authenticated session", async () => {
    const input = {
      requestId: "request",
      action: "APPROVE",
      snapshotChecksum: "a".repeat(64),
    };
    expect((await PATCH(request(input))).status).toBe(200);
    expect(mocks.decide).toHaveBeenCalledWith(
      input,
      "verified-session-owner",
      "ADMIN",
    );
  });
});
