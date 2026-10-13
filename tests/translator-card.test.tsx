import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ToastProvider } from "@/components/providers/toast-provider";
import { TranslatorCard } from "@/components/translator/translator-card";
import type { PublicTranslator } from "@/lib/types";

const fetchMock = vi.fn();

const translator: PublicTranslator = {
  id: "tr_1",
  name: "Regal Rewrite",
  slug: "regal-rewrite",
  title: "Make Everyday English Sound Refined",
  subtitle: "Subtitle",
  shortDescription: "Description",
  sourceLabel: "Plain English",
  targetLabel: "Fancy English",
  seoTitle: null,
  seoDescription: null,
  isFeatured: true,
  iconName: "",
  showModeSelector: false,
  showSwap: true,
  showExamples: false,
  shareImagePath: null,
  shareImageUpdatedAt: null,
  primaryCategory: null,
  categories: [],
  modes: [
    {
      id: "m1",
      key: "classic-fancy",
      label: "Classic Fancy",
      description: "desc",
      sortOrder: 1,
    },
  ],
  examples: [],
  editorial: {
    about: null,
    whatItDoes: null,
    differenceDescription: null,
    bestUses: [],
    howToUse: [],
    tips: [],
    examples: [],
    faq: [],
  },
  editorialStatus: "INCOMPLETE",
  indexingEligibility: {
    deployedBaselineIndexable: true,
    deployedBaselineRobotsIndexable: false,
    newVersionIndexable: false,
    strictReviewIndexable: false,
    technicallyReady: false,
    currentVersionReviewed: false,
    reviewEnforcementEnabled: false,
    newVersionExclusionReasonCodes: ["TECHNICAL_EDITORIAL_INCOMPLETE"],
    strictReviewExclusionReasonCodes: ["TECHNICAL_EDITORIAL_INCOMPLETE", "CURRENT_EDITORIAL_NOT_REVIEWED"],
    reasons: [],
  },
};

function renderCard(attributionEnabled = false) {
  return render(
    <ToastProvider>
      <TranslatorCard
        translator={translator}
        attributionEnabled={attributionEnabled}
      />
    </ToastProvider>,
  );
}

describe("TranslatorCard", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockReset();

    Object.assign(navigator, {
      clipboard: {
        writeText: vi.fn().mockResolvedValue(undefined),
      },
    });

    localStorage.clear();

    const canvasContext = {
      createLinearGradient: () => ({ addColorStop: vi.fn() }),
      fillRect: vi.fn(),
      beginPath: vi.fn(),
      roundRect: vi.fn(),
      fill: vi.fn(),
      stroke: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      quadraticCurveTo: vi.fn(),
      closePath: vi.fn(),
      measureText: (value: string) => ({ width: value.length * 10 }),
      fillText: vi.fn(),
      set fillStyle(_value: string | CanvasGradient) {},
      set strokeStyle(_value: string | CanvasGradient) {},
      set lineWidth(_value: number) {},
      set font(_value: string) {},
      set textAlign(_value: CanvasTextAlign) {},
      set textBaseline(_value: CanvasTextBaseline) {},
    };
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
      canvasContext as unknown as CanvasRenderingContext2D,
    );
    vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation(
      (callback) => callback(new Blob(["pin"], { type: "image/png" })),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    window.history.replaceState({}, "", "/");
  });

  it("translates text and renders output", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, result: "Good morrow to you." }),
    });

    renderCard();

    const input = screen.getByLabelText("Input text");
    await userEvent.type(input, "hello there");

    await userEvent.click(
      screen.getAllByRole("button", { name: /^translate$/i })[0],
    );

    await waitFor(() => {
      expect(screen.getByLabelText("Output text")).toHaveValue(
        "Good morrow to you.",
      );
    });
    expect(fetchMock.mock.calls.map(([path]) => path)).not.toContain(
      "/api/pinterest/result-image",
    );
  });

  it("orders the mobile flow as input, primary action, then result", () => {
    renderCard();

    const input = screen.getByLabelText("Input text");
    const primaryAction = screen.getByRole("button", {
      name: /twist my words/i,
    });
    const result = screen.getByLabelText("Output text").closest("[aria-live]");

    expect(input.compareDocumentPosition(primaryAction)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
    expect(primaryAction.compareDocumentPosition(result!)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
    expect(result).toHaveClass("hidden");
  });

  it("prioritizes try again and edit input after a result", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, result: "Good morrow to you." }),
    });
    Element.prototype.scrollIntoView = vi.fn();

    renderCard();
    await userEvent.type(screen.getByLabelText("Input text"), "hello there");
    await userEvent.click(
      screen.getByRole("button", { name: /twist my words/i }),
    );

    expect(
      await screen.findByRole("button", { name: /try again/i }),
    ).toBeVisible();
    expect(screen.getByRole("button", { name: /edit input/i })).toBeVisible();
  });

  it("supports keyboard shortcut ctrl/cmd + enter", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, result: "A refined line." }),
    });

    renderCard();

    const input = screen.getByLabelText("Input text");
    await userEvent.type(input, "quick line");
    fireEvent.keyDown(input, { key: "Enter", ctrlKey: true });

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
  });

  it("clears persisted input and output", async () => {
    localStorage.setItem(
      "saytwist:regal-rewrite:last-input",
      JSON.stringify("hello"),
    );
    localStorage.setItem(
      "saytwist:regal-rewrite:last-output",
      JSON.stringify("refined"),
    );

    renderCard();

    expect(screen.getByLabelText("Input text")).toHaveValue("hello");
    expect(screen.getByLabelText("Output text")).toHaveValue("refined");

    await userEvent.click(screen.getByRole("button", { name: /clear/i }));

    expect(screen.getByLabelText("Input text")).toHaveValue("");
    expect(screen.getByLabelText("Output text")).toHaveValue("");
  });

  it("records view/input once and establishes a valid landing before translation", async () => {
    window.history.replaceState(
      {},
      "",
      `/?utm_source=pinterest&utm_medium=organic&utm_campaign=saytwist&utm_content=content&pin_ref=pa_${"a".repeat(32)}`,
    );
    const paths: string[] = [];
    fetchMock.mockImplementation(async (input: string | URL | Request) => {
      const path =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.pathname
            : new URL(input.url).pathname;
      paths.push(path);
      if (path === "/api/translate")
        return {
          ok: true,
          json: async () => ({ ok: true, result: "Tracked output" }),
        };
      return { ok: true, json: async () => ({ ok: true, collected: true }) };
    });

    renderCard(true);
    const input = screen.getByLabelText("Input text");
    await userEvent.type(input, "hello");
    await userEvent.type(input, " again");
    await userEvent.click(
      screen.getAllByRole("button", { name: /^translate$/i })[0],
    );
    await waitFor(() =>
      expect(screen.getByLabelText("Output text")).toHaveValue(
        "Tracked output",
      ),
    );

    expect(
      paths.indexOf("/api/growth/attribution/landing"),
    ).toBeGreaterThanOrEqual(0);
    expect(paths.indexOf("/api/growth/attribution/landing")).toBeLessThan(
      paths.indexOf("/api/translate"),
    );
    const eventCalls = fetchMock.mock.calls.filter(
      ([path]) => path === "/api/growth/attribution/event",
    );
    const bodies = eventCalls.map(
      ([, init]) => JSON.parse(String(init?.body)) as { type: string },
    );
    expect(
      bodies.filter(({ type }) => type === "TRANSLATOR_VIEW"),
    ).toHaveLength(1);
    expect(bodies.filter(({ type }) => type === "INPUT_STARTED")).toHaveLength(
      1,
    );
  });

  it("does not enter the bounded attribution wait path for ordinary traffic without pin_ref", async () => {
    const timeoutSpy = vi.spyOn(window, "setTimeout");
    fetchMock.mockImplementation(async (input: string | URL | Request) => {
      const path =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.pathname
            : new URL(input.url).pathname;
      if (path === "/api/translate")
        return {
          ok: true,
          json: async () => ({ ok: true, result: "No attribution delay" }),
        };
      return { ok: true, json: async () => ({ ok: true, collected: false }) };
    });

    renderCard(true);
    await userEvent.type(
      screen.getByLabelText("Input text"),
      "ordinary traffic",
    );
    await userEvent.click(
      screen.getAllByRole("button", { name: /^translate$/i })[0],
    );
    await waitFor(() =>
      expect(screen.getByLabelText("Output text")).toHaveValue(
        "No attribution delay",
      ),
    );

    expect(timeoutSpy.mock.calls.some(([, delay]) => delay === 1_200)).toBe(
      false,
    );
  });

  it("prepares on the first result-share click and opens Pinterest only on the second", async () => {
    fetchMock
      .mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true, result: "Refined output" }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true, mediaUrl: "https://saytwist.com/generated/result.png" }) });
    const openSpy = vi.spyOn(window, "open").mockImplementation(() => null);

    renderCard();
    await userEvent.type(screen.getByLabelText("Input text"), "Original source");
    await userEvent.click(screen.getAllByRole("button", { name: /^translate$/i })[0]);
    await userEvent.click((await screen.findAllByRole("button", { name: /share result/i }))[0]);

    const continueButtons = await screen.findAllByRole("button", { name: /continue to pinterest/i });
    expect(continueButtons).toHaveLength(2);
    expect(continueButtons[0]).toBeVisible();
    expect(openSpy).not.toHaveBeenCalled();

    await userEvent.click(screen.getAllByRole("button", { name: /continue to pinterest/i })[0]);
    expect(openSpy).toHaveBeenCalledTimes(1);
  });

  it("keeps the translated source snapshot when the input is edited later", async () => {
    fetchMock
      .mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true, result: "Older result" }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true, mediaUrl: "https://saytwist.com/generated/result.png" }) });

    renderCard();
    const input = screen.getByLabelText("Input text");
    await userEvent.type(input, "Exact original");
    await userEvent.click(screen.getAllByRole("button", { name: /^translate$/i })[0]);
    await userEvent.clear(input);
    await userEvent.type(input, "Edited later");
    await userEvent.click((await screen.findAllByRole("button", { name: /share result/i }))[0]);

    await screen.findAllByRole("button", { name: /continue to pinterest/i });
    expect(localStorage.getItem("saytwist:regal-rewrite:last-source-used")).toBe(
      JSON.stringify("Exact original"),
    );
  });

  it("shows a retry state when result image preparation fails", async () => {
    fetchMock
      .mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true, result: "Refined output" }) })
      .mockResolvedValueOnce({ ok: false, status: 503, json: async () => ({ ok: false }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true, mediaUrl: "https://saytwist.com/generated/retried.png" }) });

    renderCard();
    await userEvent.type(screen.getByLabelText("Input text"), "Original source");
    await userEvent.click(screen.getAllByRole("button", { name: /^translate$/i })[0]);
    await userEvent.click((await screen.findAllByRole("button", { name: /share result/i }))[0]);

    expect((await screen.findAllByRole("button", { name: /retry result image/i }))[0]).toBeVisible();
    expect(screen.getAllByText(/unable to prepare pinterest image/i).length).toBeGreaterThan(0);

    await userEvent.click(screen.getAllByRole("button", { name: /retry result image/i })[0]);
    expect((await screen.findAllByRole("button", { name: /continue to pinterest/i }))[0]).toBeVisible();
  });

  it("invalidates a prepared image when a newer translation replaces the result", async () => {
    fetchMock
      .mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true, result: "First result" }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true, mediaUrl: "https://saytwist.com/generated/first.png" }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true, result: "Second result" }) });

    renderCard();
    const input = screen.getByLabelText("Input text");
    await userEvent.type(input, "First source");
    await userEvent.click(screen.getAllByRole("button", { name: /^translate$/i })[0]);
    await userEvent.click((await screen.findAllByRole("button", { name: /share result/i }))[0]);
    await screen.findAllByRole("button", { name: /continue to pinterest/i });

    await userEvent.clear(input);
    await userEvent.type(input, "Second source");
    await userEvent.click(screen.getAllByRole("button", { name: /try again/i })[0]);

    expect((await screen.findAllByRole("button", { name: /share result/i }))[0]).toBeVisible();
    expect(screen.queryByRole("button", { name: /continue to pinterest/i })).not.toBeInTheDocument();
  });
});
