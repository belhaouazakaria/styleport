import { describe, expect, it } from "vitest";

import {
  diversifyTargets,
  isNearDuplicateTopic,
  themeKey,
  topicTokens,
} from "@/lib/growth/viral/target-diversity";

describe("Pin idea diversity", () => {
  it("compares topics by meaningful words", () => {
    expect(topicTokens("Anime Style Speech Translator")).toEqual(["anime"]);
    expect(themeKey("animalistic-translator")).toBe("animalistic");
  });

  it("flags the same idea under a different name", () => {
    const existing = [topicTokens("Anime Language Translator"), topicTokens("Angel Translator")];
    expect(isNearDuplicateTopic("Anime Style Speech Translator", existing)).toBe(true);
    expect(isNearDuplicateTopic("Angel Speak", existing)).toBe(true);
    expect(isNearDuplicateTopic("Pirate Translator", existing)).toBe(false);
  });

  it("does not treat different two-word ideas as duplicates", () => {
    expect(isNearDuplicateTopic("Dark Knight Translator", [topicTokens("Dark Angel Translator")])).toBe(false);
  });

  it("does not repeat a theme back to back", () => {
    const ordered = diversifyTargets(
      [
        { slug: "anime-language-translator" },
        { slug: "anime-speaking-style-translator" },
        { slug: "angel-translator" },
        { slug: "angry-language-translator" },
      ],
      [],
    ).map((t) => t.slug);
    expect(ordered.slice(0, 3)).toEqual([
      "anime-language-translator",
      "angel-translator",
      "angry-language-translator",
    ]);
    expect(ordered[3]).toBe("anime-speaking-style-translator");
  });

  it("puts unique-content pages first and waits on recently used themes", () => {
    const ordered = diversifyTargets(
      [
        { slug: "animal-translator" },
        { slug: "pirate-translator" },
        { slug: "knight-translator", hasUniquePage: true },
      ],
      ["animal-equivalent-translator"],
    ).map((t) => t.slug);
    expect(ordered).toEqual(["knight-translator", "pirate-translator", "animal-translator"]);
  });
});
