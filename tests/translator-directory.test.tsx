import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { RequestTranslatorProvider } from "@/components/providers/request-translator-provider";
import { ToastProvider } from "@/components/providers/toast-provider";
import { TranslatorDirectory } from "@/components/public/translator-directory";
import type { PublicTranslator } from "@/lib/types";

const translators: PublicTranslator[] = [
  {
    id: "1",
    name: "Regal Rewrite",
    slug: "regal-rewrite",
    title: "Regal",
    subtitle: "Sub",
    shortDescription: "Desc",
    sourceLabel: "Plain",
    targetLabel: "Fancy",
    seoTitle: null,
    seoDescription: null,
    isFeatured: true,
    iconName: null,
    showModeSelector: false,
    showSwap: false,
    showExamples: false,
    primaryCategory: null,
    categories: [
      {
        id: "c1",
        name: "Fancy",
        slug: "fancy",
      },
    ],
    modes: [],
    examples: [],
  },
];

describe("TranslatorDirectory", () => {
  it("uses title links and no open button", () => {
    render(
      <ToastProvider>
        <RequestTranslatorProvider>
          <TranslatorDirectory translators={translators} />
        </RequestTranslatorProvider>
      </ToastProvider>,
    );

    const titleLink = screen.getByRole("link", { name: "Regal Rewrite" });
    expect(titleLink).toHaveAttribute("href", "/translators/regal-rewrite");

    expect(screen.queryByRole("link", { name: /open translator/i })).toBeNull();
  });
});
