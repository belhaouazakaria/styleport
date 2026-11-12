import { isValidElement } from "react";
import Script from "next/script";
import { describe, expect, it } from "vitest";

import { renderCustomHeadCode } from "@/lib/head-code";

const ADSENSE_URL =
  "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-7927856375186557";

describe("custom head AdSense bootstrap", () => {
  it("renders AdSense as a native async head script without Next.js data-nscript", () => {
    const nodes = renderCustomHeadCode(
      `<script async src="${ADSENSE_URL}" crossorigin="anonymous"></script>`,
    );

    expect(nodes).toHaveLength(1);
    const adScript = nodes[0];
    expect(isValidElement<Record<string, unknown>>(adScript)).toBe(true);
    if (!isValidElement<Record<string, unknown>>(adScript)) return;

    expect(adScript.type).toBe("script");
    expect(adScript.props.src).toBe(ADSENSE_URL);
    expect(adScript.props.async).toBe(true);
    expect(adScript.props.crossOrigin).toBe("anonymous");
    expect(adScript.props["data-nscript"]).toBeUndefined();
  });

  it("preserves the existing Next Script loading behavior for analytics", () => {
    const nodes = renderCustomHeadCode(
      '<script async src="https://www.googletagmanager.com/gtag/js?id=G-TEST"></script>',
    );
    expect(isValidElement(nodes[0])).toBe(true);
    if (!isValidElement(nodes[0])) return;
    expect(nodes[0].type).toBe(Script);
  });

  it("does not mistake other Google or non-Google scripts for the AdSense loader", () => {
    for (const src of [
      "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=wrong",
      "https://pagead2.googlesyndication.com.evil.test/pagead/js/adsbygoogle.js?client=ca-pub-7927856375186557",
      "https://example.com/adsbygoogle.js?client=ca-pub-7927856375186557",
    ]) {
      const nodes = renderCustomHeadCode(`<script src="${src}"></script>`);
      expect(isValidElement(nodes[0])).toBe(true);
      if (!isValidElement(nodes[0])) continue;
      expect(nodes[0].type).toBe(Script);
    }
  });
});
