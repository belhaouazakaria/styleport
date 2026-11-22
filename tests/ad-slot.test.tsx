import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AdSlot } from "@/components/shared/ad-slot";

const placement = {
  id: "translator-ad",
  name: "Translator placement",
  providerType: "ADSENSE" as const,
  adSenseSlot: "8746514744",
  codeSnippet: null,
};

function mockSlotWidth(width: number) {
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
    () => ({ width, height: 0, top: 0, left: 0, right: width, bottom: 0, x: 0, y: 0, toJSON() {} }) as DOMRect,
  );
}

afterEach(() => vi.restoreAllMocks());

describe("AdSlot", () => {
  it("renders and initializes the responsive AdSense unit without exposing the slot ID as text", () => {
    mockSlotWidth(320);
    window.adsbygoogle = [];
    const { container } = render(<AdSlot placement={placement} adSenseClientId="ca-pub-1234567890123456" />);

    expect(screen.getByText("Ad")).toBeInTheDocument();
    expect(screen.queryByText(/AdSense slot:/)).not.toBeInTheDocument();
    expect(screen.queryByText(placement.adSenseSlot)).not.toBeInTheDocument();
    expect(container.querySelector(".min-h-20")).toBeInTheDocument();
    expect(container.querySelector("ins.adsbygoogle")).toHaveAttribute("data-ad-client", "ca-pub-1234567890123456");
    expect(container.querySelector("ins.adsbygoogle")).toHaveAttribute("data-ad-slot", placement.adSenseSlot);
    expect(container.querySelector("ins.adsbygoogle")).toHaveAttribute("data-ad-format", "auto");
    expect(container.querySelector("ins.adsbygoogle")).toHaveAttribute("data-full-width-responsive", "true");
    expect(window.adsbygoogle).toHaveLength(1);
  });

  it("leaves the placement container empty when the publisher client ID is not configured", () => {
    window.adsbygoogle = [];
    const { container } = render(<AdSlot placement={placement} adSenseClientId="" />);

    expect(screen.getByText("Ad")).toBeInTheDocument();
    expect(container.querySelector("ins.adsbygoogle")).not.toBeInTheDocument();
    expect(window.adsbygoogle).toHaveLength(0);
  });
});
