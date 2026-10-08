import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

const router = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));

import { CreativeGenerationForm } from "@/components/admin/creative-lab-actions";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("Creative Lab target picker", () => {
  it("discovers and selects an active Translator beyond the initial options", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.startsWith("/api/admin/translators?")) return { ok: true, json: async () => ({ ok: true, translators: [{ id: "hidden", name: "Hidden Voice Translator", slug: "hidden-voice-translator" }] }) } as Response;
      if (url === "/api/admin/growth/creative/generate") return { ok: true, json: async () => ({ ok: true }) } as Response;
      throw new Error(`Unexpected request: ${url} ${init?.method || "GET"}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(<CreativeGenerationForm translators={[{ id: "first", name: "First Translator", slug: "first-translator" }]} ideas={[]} accounts={[]} experiments={[]} />);

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
});
