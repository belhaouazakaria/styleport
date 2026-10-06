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
});
