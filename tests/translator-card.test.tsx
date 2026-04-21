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

function renderCard() {
  return render(
    <ToastProvider>
      <TranslatorCard translator={translator} />
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
  });

  it("translates text and renders output", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, result: "Good morrow to you." }),
    });

    renderCard();

    const input = screen.getByLabelText("Input text");
    await userEvent.type(input, "hello there");

    await userEvent.click(screen.getAllByRole("button", { name: /^translate$/i })[0]);

    await waitFor(() => {
      expect(screen.getByLabelText("Output text")).toHaveValue("Good morrow to you.");
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
    localStorage.setItem("styleport:regal-rewrite:last-input", JSON.stringify("hello"));
    localStorage.setItem("styleport:regal-rewrite:last-output", JSON.stringify("refined"));

    renderCard();

    expect(screen.getByLabelText("Input text")).toHaveValue("hello");
    expect(screen.getByLabelText("Output text")).toHaveValue("refined");

    await userEvent.click(screen.getByRole("button", { name: /clear/i }));

    expect(screen.getByLabelText("Input text")).toHaveValue("");
    expect(screen.getByLabelText("Output text")).toHaveValue("");
  });
});
