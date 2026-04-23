import { describe, expect, it } from "vitest";

import { aiDraftInputSchema, translatorDraftSchema, translatorRequestSchema } from "@/lib/validators";

describe("translatorRequestSchema", () => {
  it("accepts valid public request payload", () => {
    const parsed = translatorRequestSchema.safeParse({
      requestedName: "Startup Pitch Polisher",
      description: "Rewrite rough pitch text into concise investor-ready copy.",
      exampleInput: "we make AI for stores",
      requesterEmail: "founder@example.com",
      honeypot: "",
    });

    expect(parsed.success).toBe(true);
  });

  it("rejects honeypot values", () => {
    const parsed = translatorRequestSchema.safeParse({
      requestedName: "Idea",
      description: "Some long enough request description for this test case.",
      honeypot: "i am a bot",
    });

    expect(parsed.success).toBe(false);
  });
});

describe("translatorDraftSchema", () => {
  it("validates a structured AI draft", () => {
    const parsed = translatorDraftSchema.safeParse({
      name: "Pitch Polisher",
      slug: "pitch-polisher",
      title: "Sharpen Startup Pitches",
      subtitle: "Turn rough ideas into investor-ready messaging.",
      shortDescription: "Polish startup pitch text quickly.",
      sourceLabel: "Rough Pitch",
      targetLabel: "Refined Pitch",
      systemPrompt: "You are a startup storytelling expert who rewrites text with clarity and accuracy.",
      promptInstructions: "Preserve meaning and facts while improving structure and confidence.",
      seoTitle: "Pitch Polisher Translator",
      seoDescription: "Rewrite startup pitch drafts into concise investor-ready language.",
      categorySuggestion: "Professional",
      modes: [
        {
          key: "classic",
          label: "Classic",
          description: "Balanced output",
          instruction: "Use concise, polished business tone.",
          sortOrder: 1,
        },
      ],
      examples: [
        {
          label: "Pitch",
          value: "we make tools for teams",
          sortOrder: 1,
        },
      ],
    });

    expect(parsed.success).toBe(true);
  });
});

describe("aiDraftInputSchema", () => {
  it("requires key fields", () => {
    const parsed = aiDraftInputSchema.safeParse({
      brief: "short",
    });

    expect(parsed.success).toBe(false);
  });
});
