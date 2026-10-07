import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ requireAdminRoute: vi.fn(), dashboard: vi.fn(), guard: vi.fn(), requireAdmin: vi.fn(), sameOrigin: vi.fn(), enqueue: vi.fn(), rollback: vi.fn() }));
vi.mock("@/lib/auth", () => ({ requireAdminRoute: mocks.requireAdminRoute }));
vi.mock("@/lib/permissions", () => ({ adminRouteGuard: mocks.guard, requireAdmin: mocks.requireAdmin }));
vi.mock("@/lib/growth/request-security", () => ({ isSameOriginMutation: mocks.sameOrigin }));
vi.mock("@/lib/growth/translator/reporting", () => ({ getTranslatorAutopilotDashboard: mocks.dashboard }));
vi.mock("@/lib/growth/translator/service", () => ({ enqueueTranslatorAutopilotDecision: mocks.enqueue, rollbackTranslatorVersion: mocks.rollback }));
vi.mock("@/components/admin/admin-topbar", () => ({ AdminTopbar: ({ title }: { title: string }) => <h1>{title}</h1> }));
vi.mock("@/components/admin/kpi-card", () => ({ KpiCard: ({ label, value }: { label: string; value: string }) => <div>{label}: {value}</div> }));
vi.mock("@/components/admin/translator-autopilot-actions", () => ({ QueueTranslatorDecisionButton: () => <button>Queue decision</button>, RollbackTranslatorButton: () => <button>Roll back</button> }));

import Page from "@/app/(admin)/admin/growth/translators/page";
import { POST as enqueuePost } from "@/app/api/admin/growth/translators/decisions/route";
import { POST as rollbackPost } from "@/app/api/admin/growth/translators/[translatorId]/rollback/route";

describe("Phase 8 admin", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAdminRoute.mockResolvedValue({ user: { role: "ADMIN" } });
    mocks.guard.mockResolvedValue(null);
    mocks.requireAdmin.mockResolvedValue({ user: { id: "admin", role: "ADMIN" } });
    mocks.sameOrigin.mockReturnValue(true);
    mocks.enqueue.mockResolvedValue({ job: { id: "job" }, created: true });
    mocks.rollback.mockResolvedValue({ changed: true, translatorId: "translator", checksum: "a".repeat(64), version: { id: "new-version" } });
    mocks.dashboard.mockResolvedValue({ modelVersion: "translator_autopilot_v1", latestDecision: { type: "CREATE_TRANSLATOR", status: "COMPLETED" }, counts: { completed: 1, waiting: 2, rejected: 0 }, actionableOpportunities: [{ id: "opportunity", type: "FILL_INVENTORY_GAP", score: 90, confidence: 92, cluster: { name: "moonlit" } }], decisions: [{ id: "decision", type: "CREATE_TRANSLATOR", status: "COMPLETED", reasonCodes: ["ACTIONABLE_CREATE"], translator: { id: "translator", name: "Moonlit", slug: "moonlit", isActive: false, shareImagePath: "/image.png" }, opportunity: { score: 90, confidence: 92, status: "ACTIONED", cluster: { name: "moonlit" } }, contentVersions: [{ id: "version", sideEffectStatus: "SYNCHRONIZED" }], createdAt: new Date("2026-10-07T00:00:00Z"), completedAt: new Date("2026-10-07T00:01:00Z") }], versions: [{ id: "version", translatorId: "translator", version: 1, action: "CREATE", checksum: "a".repeat(64), currentChecksum: "b".repeat(64), sideEffectStatus: "SYNCHRONIZED", createdAt: new Date("2026-10-07T00:00:00Z"), translator: { id: "translator", name: "Moonlit", slug: "moonlit", isActive: false, shareImagePath: "/image.png" }, decision: { id: "decision", type: "CREATE_TRANSLATOR" } }] });
  });
  it("renders bounded decisions and rollback history", async () => {
    render(await Page());
    expect(screen.getByRole("heading", { name: "Translator Autopilot" })).toBeInTheDocument();
    expect(document.body).toHaveTextContent("translator_autopilot_v1");
    expect(screen.getByRole("button", { name: "Queue decision" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Roll back" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "View decision" })).toHaveAttribute("href", "#decision-decision");
  });
  it("requires ADMIN and same-origin for enqueue", async () => {
    const denied = new Response("denied", { status: 403 });
    mocks.guard.mockResolvedValueOnce(denied);
    expect(await enqueuePost(new Request("https://saytwist.com/api/admin/growth/translators/decisions", { method: "POST", body: JSON.stringify({ opportunityId: "opportunity" }) }))).toBe(denied);
    mocks.guard.mockResolvedValue(null); mocks.sameOrigin.mockReturnValue(false);
    expect((await enqueuePost(new Request("https://saytwist.com/api/admin/growth/translators/decisions", { method: "POST", body: JSON.stringify({ opportunityId: "opportunity" }) }))).status).toBe(403);
  });
  it("queues only a validated opportunity ID", async () => {
    const response = await enqueuePost(new Request("https://saytwist.com/api/admin/growth/translators/decisions", { method: "POST", body: JSON.stringify({ opportunityId: "opportunity" }) }));
    expect(response.status).toBe(202);
    expect(mocks.enqueue).toHaveBeenCalledWith("opportunity");
  });
  it("restores only a stored version ID and rejects arbitrary snapshots", async () => {
    const checksum = "b".repeat(64);
    const bad = await rollbackPost(new Request("https://saytwist.com/api/admin/growth/translators/translator/rollback", { method: "POST", body: JSON.stringify({ targetVersionId: "version", expectedCurrentChecksum: checksum, snapshot: { title: "attacker" } }) }), { params: Promise.resolve({ translatorId: "translator" }) });
    expect(bad.status).toBe(400);
    expect(mocks.rollback).not.toHaveBeenCalled();
    const good = await rollbackPost(new Request("https://saytwist.com/api/admin/growth/translators/translator/rollback", { method: "POST", body: JSON.stringify({ targetVersionId: "version", expectedCurrentChecksum: checksum }) }), { params: Promise.resolve({ translatorId: "translator" }) });
    expect(good.status).toBe(200);
    expect(mocks.rollback).toHaveBeenCalledWith({ translatorId: "translator", targetVersionId: "version", expectedCurrentChecksum: checksum, actorUserId: "admin" });
  });
  it("requires ADMIN, same origin, and a current checksum for rollback", async () => {
    const request = () => new Request("https://saytwist.com/api/admin/growth/translators/translator/rollback", { method: "POST", body: JSON.stringify({ targetVersionId: "version", expectedCurrentChecksum: "b".repeat(64) }) });
    const denied = new Response("denied", { status: 403 });
    mocks.guard.mockResolvedValueOnce(denied);
    expect(await rollbackPost(request(), { params: Promise.resolve({ translatorId: "translator" }) })).toBe(denied);
    mocks.guard.mockResolvedValue(null); mocks.sameOrigin.mockReturnValue(false);
    expect((await rollbackPost(request(), { params: Promise.resolve({ translatorId: "translator" }) })).status).toBe(403);
    mocks.sameOrigin.mockReturnValue(true);
    const missingChecksum = new Request("https://saytwist.com/api/admin/growth/translators/translator/rollback", { method: "POST", body: JSON.stringify({ targetVersionId: "version" }) });
    expect((await rollbackPost(missingChecksum, { params: Promise.resolve({ translatorId: "translator" }) })).status).toBe(400);
  });
});
