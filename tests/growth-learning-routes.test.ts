import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  guard: vi.fn(),
  sameOrigin: vi.fn(),
  enqueue: vi.fn(),
  session: vi.fn(),
  prepare: vi.fn(),
  transitionExperiment: vi.fn(),
}));
vi.mock("@/lib/permissions", () => ({
  adminRouteGuard: mocks.guard,
  getSessionOrNull: mocks.session,
}));
vi.mock("@/lib/growth/request-security", () => ({
  isSameOriginMutation: mocks.sameOrigin,
}));
vi.mock("@/lib/growth/learning/service", () => ({
  enqueueLearningAnalysis: mocks.enqueue,
  prepareEvergreenRecommendation: mocks.prepare,
  transitionLearningExperiment: mocks.transitionExperiment,
}));

import { POST as analyze } from "@/app/api/admin/growth/learning/analyze/route";
import { POST as experimentAction } from "@/app/api/admin/growth/learning/experiments/route";
import { POST as prepare } from "@/app/api/admin/growth/learning/prepare/route";

describe("Phase 12 admin routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.guard.mockResolvedValue(null);
    mocks.sameOrigin.mockReturnValue(true);
    mocks.session.mockResolvedValue({ user: { id: "admin" } });
    mocks.enqueue.mockResolvedValue({ job: { id: "job" }, created: true });
    mocks.prepare.mockResolvedValue({
      job: { id: "creative-job" },
      created: true,
    });
    mocks.transitionExperiment.mockResolvedValue({
      id: "experiment-1",
      status: "RUNNING",
    });
  });
  it("requires ADMIN and same-origin evaluation", async () => {
    mocks.guard.mockResolvedValueOnce(
      new Response("unauthorized", { status: 401 }),
    );
    expect(
      (
        await analyze(
          new Request(
            "https://saytwist.com/api/admin/growth/learning/analyze",
            { method: "POST" },
          ),
        )
      ).status,
    ).toBe(401);
    mocks.sameOrigin.mockReturnValueOnce(false);
    expect(
      (
        await analyze(
          new Request(
            "https://saytwist.com/api/admin/growth/learning/analyze",
            { method: "POST" },
          ),
        )
      ).status,
    ).toBe(403);
  });
  it("rejects preparation without literal confirmation and accepts only server-resolved fields", async () => {
    const invalid = await prepare(
      new Request("https://saytwist.com/api/admin/growth/learning/prepare", {
        method: "POST",
        body: JSON.stringify({ recommendationId: "r1", confirmation: false }),
      }),
    );
    expect(invalid.status).toBe(400);
    const response = await prepare(
      new Request("https://saytwist.com/api/admin/growth/learning/prepare", {
        method: "POST",
        body: JSON.stringify({ recommendationId: "r1", confirmation: true }),
      }),
    );
    expect(response.status).toBe(202);
    expect(mocks.prepare).toHaveBeenCalledWith(
      { recommendationId: "r1", confirmation: true },
      "admin",
    );
  });

  it("protects controlled experiment transitions with ADMIN, same-origin, and strict confirmation", async () => {
    mocks.sameOrigin.mockReturnValueOnce(false);
    expect(
      (
        await experimentAction(
          new Request(
            "https://saytwist.com/api/admin/growth/learning/experiments",
            {
              method: "POST",
              body: JSON.stringify({
                experimentId: "experiment-1",
                action: "START",
                confirmation: true,
              }),
            },
          ),
        )
      ).status,
    ).toBe(403);

    const invalid = await experimentAction(
      new Request(
        "https://saytwist.com/api/admin/growth/learning/experiments",
        {
          method: "POST",
          body: JSON.stringify({
            experimentId: "experiment-1",
            action: "START",
            confirmation: true,
            status: "COMPLETED",
          }),
        },
      ),
    );
    expect(invalid.status).toBe(400);

    const response = await experimentAction(
      new Request(
        "https://saytwist.com/api/admin/growth/learning/experiments",
        {
          method: "POST",
          body: JSON.stringify({
            experimentId: "experiment-1",
            action: "START",
            confirmation: true,
          }),
        },
      ),
    );
    expect(response.status).toBe(200);
    expect(mocks.transitionExperiment).toHaveBeenCalledWith(
      {
        experimentId: "experiment-1",
        action: "START",
        confirmation: true,
      },
      "admin",
    );
  });
});
