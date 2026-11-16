import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { AdSlot } from "@/components/shared/ad-slot";

const placement = {
  id: "translator-ad",
  name: "Translator placement",
  providerType: "ADSENSE" as const,
  adSenseSlot: "8746514744",
  codeSnippet: null,
};

describe("AdSlot", () => {
  it("keeps the ad disclosure and empty placement without exposing the configured slot ID", () => {
    const { container } = render(<AdSlot placement={placement} adSenseClientId="ca-pub-1234567890123456" />);

    expect(screen.getByText("Ad")).toBeInTheDocument();
    expect(screen.queryByText(/AdSense slot:/)).not.toBeInTheDocument();
    expect(screen.queryByText(placement.adSenseSlot)).not.toBeInTheDocument();
    expect(container.querySelector(".min-h-20")).toBeInTheDocument();
  });
});
