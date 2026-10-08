import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ guard: vi.fn(), admin: vi.fn(), sameOrigin: vi.fn(), enqueue: vi.fn(), archive: vi.fn(), rollback: vi.fn() }));
vi.mock("@/lib/permissions", () => ({ adminRouteGuard: mocks.guard, requireAdmin: mocks.admin }));
vi.mock("@/lib/growth/request-security", () => ({ isSameOriginMutation: mocks.sameOrigin }));
vi.mock("@/lib/growth/ideas/service", () => ({ enqueueIdeaAutopilotDecision: mocks.enqueue, archiveIdea: mocks.archive, rollbackIdeaVersion: mocks.rollback, IdeaRollbackValidationError: class extends Error {} }));

import { POST as queuePost } from "@/app/api/admin/growth/ideas/decisions/route";
import { POST as archivePost } from "@/app/api/admin/growth/ideas/[ideaId]/archive/route";
import { POST as rollbackPost } from "@/app/api/admin/growth/ideas/[ideaId]/rollback/route";

describe("Phase 9 admin mutation boundaries", () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.guard.mockResolvedValue(null); mocks.admin.mockResolvedValue({ user: { id: "admin" } }); mocks.sameOrigin.mockReturnValue(true); mocks.enqueue.mockResolvedValue({ job: { id: "job" }, created: true }); mocks.archive.mockResolvedValue({ id: "idea", status: "ARCHIVED" }); mocks.rollback.mockResolvedValue({ changed: true }); });
  it("requires ADMIN and same-origin for Idea decisions", async () => {
    const denied = new Response("denied", { status: 403 }); mocks.guard.mockResolvedValueOnce(denied);
    expect(await queuePost(new Request("https://saytwist.com/api/admin/growth/ideas/decisions", { method: "POST", body: JSON.stringify({ opportunityId: "opportunity" }) }))).toBe(denied);
    mocks.guard.mockResolvedValue(null); mocks.sameOrigin.mockReturnValue(false);
    expect((await queuePost(new Request("https://saytwist.com/api/admin/growth/ideas/decisions", { method: "POST", body: JSON.stringify({ opportunityId: "opportunity" }) }))).status).toBe(403);
  });
  it("uses strict payloads for queue, archive, and rollback", async () => {
    const queue = await queuePost(new Request("https://saytwist.com/api/admin/growth/ideas/decisions", { method: "POST", body: JSON.stringify({ opportunityId: "opportunity" }) })); expect(queue.status).toBe(202);
    const context = { params: Promise.resolve({ ideaId: "idea" }) }; const checksum = "a".repeat(64);
    expect((await archivePost(new Request("https://saytwist.com/api/admin/growth/ideas/idea/archive", { method: "POST", body: JSON.stringify({ expectedCurrentChecksum: checksum, blocks: [] }) }), context)).status).toBe(400);
    expect((await rollbackPost(new Request("https://saytwist.com/api/admin/growth/ideas/idea/rollback", { method: "POST", body: JSON.stringify({ targetVersionId: "version", expectedCurrentChecksum: checksum, snapshot: {} }) }), context)).status).toBe(400);
    expect((await rollbackPost(new Request("https://saytwist.com/api/admin/growth/ideas/idea/rollback", { method: "POST", body: JSON.stringify({ targetVersionId: "version", expectedCurrentChecksum: checksum }) }), context)).status).toBe(200);
  });
});

