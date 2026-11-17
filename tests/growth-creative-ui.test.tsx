import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GrowthExperimentDimension } from "@prisma/client";

const router = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));

import { CreativeGenerationForm, CreativeRegenerateButton, PinApprovalPanel, experimentVariantOptions } from "@/components/admin/creative-lab-actions";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("Creative Lab target picker", () => {
  it("exposes only experiment values emitted by current V5 candidates", () => {
    expect(experimentVariantOptions[GrowthExperimentDimension.HEADLINE_PATTERN].map(({ value }) => value)).toEqual(["single-statement-v2", "transformation-proof-v3"]);
    expect(experimentVariantOptions[GrowthExperimentDimension.TEMPLATE].map(({ value }) => value)).toEqual([
      "minimal-poster-v2-layout-1",
      "minimal-poster-v2-layout-2",
      "minimal-poster-v2-layout-3",
      "before-after-full-ai-v1-editorial-split",
      "before-after-full-ai-v1-chat-focus",
      "before-after-full-ai-v1-bold-poster",
      "before-after-full-ai-v1-collage",
      "before-after-full-ai-v1-magazine-frame",
    ]);
    expect(experimentVariantOptions[GrowthExperimentDimension.CTA_PATTERN].map(({ value }) => value)).toEqual(["see-full-destination", "style-aware-transformation-cta"]);
    expect(experimentVariantOptions[GrowthExperimentDimension.VISUAL_TREATMENT].map(({ value }) => value)).toEqual([
      "minimal-brand-poster",
      "full-ai-editorial-split",
      "full-ai-chat-focus",
      "full-ai-bold-poster",
      "full-ai-collage",
      "full-ai-magazine-frame",
    ]);
    expect(JSON.stringify(experimentVariantOptions)).not.toContain("before-after-ai-v1-");
  });
  it("discovers and selects an active Translator beyond the initial options", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.startsWith("/api/admin/translators?")) return { ok: true, json: async () => ({ ok: true, translators: [{ id: "hidden", name: "Hidden Voice Translator", slug: "hidden-voice-translator" }] }) } as Response;
      if (url === "/api/admin/growth/creative/generate") return { ok: true, json: async () => ({ ok: true }) } as Response;
      throw new Error(`Unexpected request: ${url} ${init?.method || "GET"}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(<CreativeGenerationForm translators={[{ id: "first", name: "First Translator", slug: "first-translator" }]} ideas={[]} accounts={[]} experiments={[]} aiImageEnabled />);

    expect(screen.getByRole("radio", { name: /minimal poster/i })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /before → after/i })).toBeInTheDocument();
    expect(screen.queryByRole("radio", { name: /^typography/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("radio", { name: /^editorial/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("radio", { name: /^conversation/i })).not.toBeInTheDocument();

    const picker = screen.getByRole("combobox", { name: /find an active translator/i });
    await user.clear(picker);
    await user.type(picker, "Hidden Voice");
    const match = await screen.findByRole("option", { name: /Hidden Voice Translator/i });
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes("/api/admin/translators?status=active&q=Hidden%20Voice"))).toBe(true);
    await user.click(match);

    expect(screen.getByText("Selected Translator")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Generate one candidate" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/admin/growth/creative/generate", expect.objectContaining({ method: "POST" })));
    const generationCall = fetchMock.mock.calls.find(([url]) => String(url) === "/api/admin/growth/creative/generate");
    expect(JSON.parse(String(generationCall?.[1]?.body))).toMatchObject({ targetKind: "TRANSLATOR", targetId: "hidden" });
  });

  it("requests one bounded AI example only for the before-and-after concept", async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({ ok: true }) }) as Response);
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(<CreativeGenerationForm translators={[{ id: "first", name: "First Translator", slug: "first-translator" }]} ideas={[]} accounts={[]} experiments={[]} aiImageEnabled />);

    await user.click(screen.getByRole("radio", { name: /before → after/i }));
    expect(screen.getByRole("checkbox", { name: /generate a real transformation/i })).toBeChecked();
    await user.click(screen.getByRole("button", { name: "Generate one candidate" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    expect(body).toMatchObject({ archetype: "BEFORE_AFTER", useAiExample: true });
  });

  it("submits only candidateId and reports regeneration state", async () => {
    let resolveRequest!: () => void;
    const fetchMock = vi.fn(() => new Promise<Response>((resolve) => { resolveRequest = () => resolve({ ok: true, json: async () => ({ ok: true }) } as Response); }));
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(<CreativeRegenerateButton candidateId="candidate-1" />);
    await user.click(screen.getByRole("button", { name: "Regenerate" }));
    expect(screen.getByRole("button", { name: "Regenerating…" })).toBeDisabled();
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({ candidateId: "candidate-1" });
    resolveRequest();
    expect(await screen.findByRole("button", { name: "Regeneration queued" })).toBeDisabled();
    expect(router.refresh).toHaveBeenCalled();
  });

  it("shows terminal publication evidence and requires an explicit fresh reapproval", async () => {
    const recommendedAt = new Date(Date.now() + 86_400_000).toISOString();
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.startsWith("/api/admin/growth/creative/timing?")) return { ok: true, json: async () => ({ data: { scheduledAt: recommendedAt, mode: "COLD_START" } }) } as Response;
      if (url === "/api/admin/growth/creative/approve") return { ok: true, json: async () => ({ ok: true }) } as Response;
      throw new Error(`Unexpected request: ${url} ${init?.method || "GET"}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(<PinApprovalPanel candidateId="candidate-1" accounts={[{ id: "account-1", label: "@saytwist", boards: [{ id: "board-1", name: "SayTwist" }] }]} existing={{ approvalStatus: "APPROVED", publicationId: "publication-old", publicationStatus: "FAILED_TERMINAL", scheduledAt: "2026-10-10T12:00:00.000Z", accountId: "account-1", boardId: "board-1", account: "@saytwist", board: "SayTwist", lastErrorCode: "PINTEREST_CREATE_REJECTED", lastErrorSummary: "Pinterest rejected the stored credential with HTTP 401." }} />);

    expect(screen.queryByRole("button", { name: /send this pin to telegram/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/telegram review includes/i)).not.toBeInTheDocument();
    expect(screen.getByText(/failed terminal/i)).toBeInTheDocument();
    expect(screen.getByText(/HTTP 401/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Confirm new approval" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Approve again" }));

    expect(await screen.findByText(/Recommended:/)).toBeInTheDocument();
    const submit = screen.getByRole("button", { name: "Confirm new approval" });
    expect(submit).toBeDisabled();
    await user.click(screen.getByRole("checkbox", { name: /approve this exact Pin/i }));
    expect(submit).toBeEnabled();
    await user.click(submit);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/admin/growth/creative/approve", expect.objectContaining({ method: "POST" })));
    const approvalCall = fetchMock.mock.calls.find(([url]) => String(url) === "/api/admin/growth/creative/approve");
    expect(JSON.parse(String(approvalCall?.[1]?.body))).toMatchObject({ candidateId: "candidate-1", accountId: "account-1", boardId: "board-1", confirmation: true });
    expect(await screen.findByText("Pin reapproved with a new publication.")).toBeInTheDocument();
  });
});


describe("Main-account Gen-Z Editorial controls", () => {
  const accounts = [{ id: "main", label: "@saytwist", publicationRole: "SAYTWIST" }, { id: "ideas", label: "@saytwistideas", publicationRole: "SAYTWIST_IDEAS" }, { id: "play", label: "@saytwistplayground", publicationRole: "SAYTWIST_PLAYGROUND" }];
  it("defaults only Main to Gen-Z and preserves explicit legacy selections", async () => {
    const user = userEvent.setup();
    render(<CreativeGenerationForm translators={[{ id: "cat", name: "Cat Translator", slug: "cat" }]} ideas={[]} accounts={accounts} experiments={[]} aiImageEnabled uprightReady uprightMessage="Upright Regular verified." />);
    const photo = screen.getByRole("radio", { name: /Gen-Z Editorial/ });
    expect(photo).toBeChecked();
    expect(screen.getByRole("slider", { name: "Stroke width percentage" })).toHaveValue("250");
    await user.selectOptions(screen.getByRole("combobox", { name: "Pinterest account" }), "ideas");
    expect(photo).toBeDisabled(); expect(photo).not.toBeChecked();
    expect(screen.queryByRole("slider", { name: "Stroke width percentage" })).not.toBeInTheDocument();
    await user.selectOptions(screen.getByRole("combobox", { name: "Pinterest account" }), "main");
    expect(photo).toBeChecked();
    await user.click(screen.getByRole("radio", { name: /Minimal poster/ }));
    expect(photo).not.toBeChecked();
  });
  it("queues the selected outline and export quality without approving or publishing", async () => {
    const fetcher = vi.fn(async () => ({ ok: true, json: async () => ({ ok: true }) }) as Response); vi.stubGlobal("fetch", fetcher);
    render(<CreativeGenerationForm translators={[{ id: "cat", name: "Cat Translator", slug: "cat" }]} ideas={[]} accounts={accounts} experiments={[]} aiImageEnabled uprightReady />);
    fireEvent.change(screen.getByRole("slider", { name: "Stroke width percentage" }), { target: { value: "300" } });
    fireEvent.change(screen.getByRole("spinbutton", { name: /WebP export quality/ }), { target: { value: "95" } });
    fireEvent.click(screen.getByRole("button", { name: "Generate one candidate" }));
    await waitFor(() => expect(fetcher).toHaveBeenCalledOnce());
    expect(JSON.parse(String(fetcher.mock.calls[0][1]?.body))).toMatchObject({ accountId: "main", designStyle: "genz_editorial", strokeWidthPercent: 300, webpQuality: 95 });
    expect(String(fetcher.mock.calls[0][0])).toBe("/api/admin/growth/creative/generate");
  });
  it("does not pretend the exact font is ready when it is unavailable", () => {
    render(<CreativeGenerationForm translators={[{ id: "cat", name: "Cat Translator", slug: "cat" }]} ideas={[]} accounts={accounts} experiments={[]} aiImageEnabled uprightReady={false} uprightMessage="Upright permission is unverified." />);
    expect(screen.getByRole("alert")).toHaveTextContent("Upright permission is unverified");
    expect(screen.getByRole("button", { name: "Generate one candidate" })).toBeDisabled();
  });
});
