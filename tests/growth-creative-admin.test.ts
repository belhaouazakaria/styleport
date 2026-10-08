import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ guard: vi.fn(), sameOrigin: vi.fn(), enqueue: vi.fn(), createExperiment: vi.fn() }));
vi.mock("@/lib/permissions", () => ({ adminRouteGuard: mocks.guard }));
vi.mock("@/lib/growth/request-security", () => ({ isSameOriginMutation: mocks.sameOrigin }));
vi.mock("@/lib/growth/creative/candidates", () => ({ enqueueCreativeGeneration: mocks.enqueue }));
vi.mock("@/lib/growth/creative/experiments", () => ({ createDraftCreativeExperiment: mocks.createExperiment }));

import { POST as generatePost } from "@/app/api/admin/growth/creative/generate/route";
import { POST as experimentPost } from "@/app/api/admin/growth/creative/experiments/route";

const generation = { targetKind: "TRANSLATOR", targetId: "translator", archetype: "TYPOGRAPHY_LED", creativeModelVersion: "creative_lab_v1" };

describe("Phase 10 Creative Lab admin boundaries", () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.guard.mockResolvedValue(null); mocks.sameOrigin.mockReturnValue(true); mocks.enqueue.mockResolvedValue({ job: { id: "job" }, created: true }); mocks.createExperiment.mockResolvedValue({ id: "experiment", status: "DRAFT" }); });
  it("requires ADMIN and exact same-origin generation", async () => {
    const denied = new Response("denied", { status: 403 }); mocks.guard.mockResolvedValueOnce(denied);
    expect(await generatePost(new Request("https://saytwist.com/api/admin/growth/creative/generate", { method: "POST", body: JSON.stringify(generation) }))).toBe(denied);
    mocks.guard.mockResolvedValue(null); mocks.sameOrigin.mockReturnValue(false);
    expect((await generatePost(new Request("https://saytwist.com/api/admin/growth/creative/generate", { method: "POST", body: JSON.stringify(generation) }))).status).toBe(403);
  });
  it("rejects untrusted generation and experiment fields", async () => {
    expect((await generatePost(new Request("https://saytwist.com/api/admin/growth/creative/generate", { method: "POST", body: JSON.stringify({ ...generation, destinationUrl: "https://evil.test", approved: true }) }))).status).toBe(400);
    expect((await experimentPost(new Request("https://saytwist.com/api/admin/growth/creative/experiments", { method: "POST", body: JSON.stringify({ hypothesis: "A controlled archetype test.", dimension: "ARCHETYPE", variants: [{ key: "a", label: "A", value: "TYPOGRAPHY_LED" }, { key: "b", label: "B", value: "EDITORIAL_LIST" }], primaryKpi: "OUTBOUND_CLICKS", guardrails: { minimumImpressions: 1000, minimumOutboundClicks: 20, maximumDays: 30 }, status: "RUNNING" }) }))).status).toBe(400);
    expect(mocks.enqueue).not.toHaveBeenCalled(); expect(mocks.createExperiment).not.toHaveBeenCalled();
  });
});

