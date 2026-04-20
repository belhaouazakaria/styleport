import { describe, expect, it } from "vitest";

import { slugify } from "@/lib/slugify";

describe("slugify", () => {
  it("normalizes labels to URL-safe slugs", () => {
    expect(slugify("Regal Rewrite 2026!")).toBe("regal-rewrite-2026");
  });

  it("trims extra separators", () => {
    expect(slugify("  --Hello   World-- ")).toBe("hello-world");
  });
});
