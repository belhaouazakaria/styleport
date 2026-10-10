import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ guard: vi.fn(), session: vi.fn(), sameOrigin: vi.fn(), enqueue: vi.fn(), regenerate: vi.fn(), createExperiment: vi.fn(), approve: vi.fn(), reject: vi.fn() }));
vi.mock("@/lib/permissions", () => ({ adminRouteGuard: mocks.guard, getSessionOrNull: mocks.session }));
vi.mock("@/lib/growth/request-security", () => ({ isSameOriginMutation: mocks.sameOrigin }));
vi.mock("@/lib/growth/creative/candidates", () => ({ enqueueCreativeGeneration: mocks.enqueue, enqueueCreativeRegeneration: mocks.regenerate }));
vi.mock("@/lib/growth/creative/experiments", () => ({ createDraftCreativeExperiment: mocks.createExperiment }));
vi.mock("@/lib/growth/publishing/service", () => ({ approvePinCandidate: mocks.approve, rejectPinCandidate: mocks.reject }));

import { POST as generatePost } from "@/app/api/admin/growth/creative/generate/route";
import { POST as regeneratePost } from "@/app/api/admin/growth/creative/regenerate/route";
import { POST as experimentPost } from "@/app/api/admin/growth/creative/experiments/route";
import { POST as approvePost } from "@/app/api/admin/growth/creative/approve/route";
import { POST as rejectPost } from "@/app/api/admin/growth/creative/reject/route";

const generation = { targetKind: "TRANSLATOR", targetId: "translator", archetype: "MINIMAL_STATEMENT", creativeModelVersion: "creative_lab_v1" };

describe("Phase 10 Creative Lab admin boundaries", () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.guard.mockResolvedValue(null); mocks.session.mockResolvedValue({ user: { id: "admin" } }); mocks.sameOrigin.mockReturnValue(true); mocks.enqueue.mockResolvedValue({ job: { id: "job" }, created: true }); mocks.regenerate.mockResolvedValue({ job: { id: "retry-job" }, created: true }); mocks.createExperiment.mockResolvedValue({ id: "experiment", status: "DRAFT" }); mocks.approve.mockResolvedValue({ approval: { id: "approval" }, publication: { id: "publication" }, created: true }); mocks.reject.mockResolvedValue({ id: "rejection" }); });
  it("requires ADMIN and exact same-origin generation", async () => {
    const denied = new Response("denied", { status: 403 }); mocks.guard.mockResolvedValueOnce(denied);
    expect(await generatePost(new Request("https://saytwist.com/api/admin/growth/creative/generate", { method: "POST", body: JSON.stringify(generation) }))).toBe(denied);
    mocks.guard.mockResolvedValue(null); mocks.sameOrigin.mockReturnValue(false);
    expect((await generatePost(new Request("https://saytwist.com/api/admin/growth/creative/generate", { method: "POST", body: JSON.stringify(generation) }))).status).toBe(403);
  });
  it("requires explicit individual approval and rejects browser-supplied authorization evidence", async () => {
    const url = "https://saytwist.com/api/admin/growth/creative/approve";
    const valid = { candidateId: "candidate", accountId: "account", boardId: "board", scheduledAt: "2026-10-11T13:00:00.000Z", confirmation: true };
    mocks.sameOrigin.mockReturnValueOnce(false);
    expect((await approvePost(new Request(url, { method: "POST", body: JSON.stringify(valid) }))).status).toBe(403);
    mocks.sameOrigin.mockReturnValue(true);
    expect((await approvePost(new Request(url, { method: "POST", body: JSON.stringify({ ...valid, confirmation: false }) }))).status).toBe(400);
    expect((await approvePost(new Request(url, { method: "POST", body: JSON.stringify({ ...valid, snapshotChecksum: "a".repeat(64), title: "Injected", status: "APPROVED" }) }))).status).toBe(400);
    expect(mocks.approve).not.toHaveBeenCalled();
    expect((await approvePost(new Request(url, { method: "POST", body: JSON.stringify(valid) }))).status).toBe(201);
    expect(mocks.approve).toHaveBeenCalledWith(valid, "admin");
    expect((await rejectPost(new Request("https://saytwist.com/api/admin/growth/creative/reject", { method: "POST", body: JSON.stringify({ candidateId: "candidate", reason: "Reviewed individually" }) }))).status).toBe(201);
  });
  it("rejects untrusted generation and experiment fields", async () => {
    expect((await generatePost(new Request("https://saytwist.com/api/admin/growth/creative/generate", { method: "POST", body: JSON.stringify({ ...generation, destinationUrl: "https://evil.test", approved: true }) }))).status).toBe(400);
    expect((await experimentPost(new Request("https://saytwist.com/api/admin/growth/creative/experiments", { method: "POST", body: JSON.stringify({ hypothesis: "A controlled archetype test.", dimension: "ARCHETYPE", variants: [{ key: "a", label: "A", value: "TYPOGRAPHY_LED" }, { key: "b", label: "B", value: "EDITORIAL_LIST" }], primaryKpi: "OUTBOUND_CLICKS", guardrails: { minimumImpressions: 1000, minimumOutboundClicks: 20, maximumDays: 30 }, status: "RUNNING" }) }))).status).toBe(400);
    expect(mocks.enqueue).not.toHaveBeenCalled(); expect(mocks.createExperiment).not.toHaveBeenCalled();
  });
  it("protects regeneration and accepts only candidateId", async () => {
    const url = "https://saytwist.com/api/admin/growth/creative/regenerate";
    const denied = new Response("denied", { status: 403 });
    mocks.guard.mockResolvedValueOnce(denied);
    expect(await regeneratePost(new Request(url, { method: "POST", body: JSON.stringify({ candidateId: "candidate-1" }) }))).toBe(denied);
    mocks.guard.mockResolvedValue(null); mocks.sameOrigin.mockReturnValueOnce(false);
    expect((await regeneratePost(new Request(url, { method: "POST", body: JSON.stringify({ candidateId: "candidate-1" }) }))).status).toBe(403);
    mocks.sameOrigin.mockReturnValue(true);
    expect((await regeneratePost(new Request(url, { method: "POST", body: JSON.stringify({ candidateId: "candidate-1", creativeDirection: "BOLD_POSTER" }) }))).status).toBe(400);
    expect(mocks.regenerate).not.toHaveBeenCalled();
    expect((await regeneratePost(new Request(url, { method: "POST", body: JSON.stringify({ candidateId: "candidate-1" }) }))).status).toBe(202);
    expect(mocks.regenerate).toHaveBeenCalledWith({ candidateId: "candidate-1" });
  });
});
