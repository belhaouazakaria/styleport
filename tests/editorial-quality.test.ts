import { describe, expect, it } from "vitest";

import { assessEditorialQuality } from "@/lib/editorial-quality";
import type { TranslatorEditorialDraft } from "@/lib/types";

const usefulDraft: TranslatorEditorialDraft = {
  about:
    "The Clear and Warm translator reshapes abrupt drafts into considerate messages without hiding the request. It is useful when a note needs a calmer opening, a direct next step, and language that respects the reader's time.",
  whatItDoes:
    "It preserves the request and factual details while softening abrupt phrasing and making the expected next step explicit.",
  differenceDescription:
    "Unlike a generic politeness pass, it keeps deadlines and ownership visible. It is not appropriate for legal notices, emergency instructions, or any message where softened language could obscure risk.",
  bestUses: [
    "Turn a terse project update into a clear request for a teammate.",
    "Make a customer follow-up considerate without weakening the deadline.",
    "Rewrite a scheduling correction so the new time and required action stay obvious.",
  ],
  howToUse: [
    "Paste the complete draft, including dates, names, and the action you need.",
    "Choose the mode that matches how direct the final message should feel.",
    "Compare the result with the source and restore any detail the rewrite softened.",
  ],
  tips: [
    "State the desired action in the source instead of asking the translator to infer it.",
    "Keep factual constraints in plain language so they survive the tone change.",
    "Read the result aloud and shorten any courtesy phrase that delays the main point.",
  ],
  examples: [
    {
      contextTitle: "Project handoff",
      originalText: "Send the files today.",
      transformedText:
        "Could you send the project files today so I can complete the handoff?",
    },
    {
      contextTitle: "Meeting correction",
      originalText: "Wrong time. It is 3 PM.",
      transformedText:
        "A quick correction: the meeting starts at 3 PM. Please update your calendar.",
    },
    {
      contextTitle: "Customer follow-up",
      originalText: "You did not answer.",
      transformedText:
        "I'm following up because I have not received a reply yet. Could you let me know by Friday?",
    },
  ],
  faq: [
    {
      question: "Will it remove a firm deadline?",
      answer:
        "It should preserve explicit dates and deadlines, but you should compare the result with the source before sending it.",
    },
    {
      question: "Is this suitable for legal notices?",
      answer:
        "No. Legal, safety, and emergency wording should be reviewed by an appropriately qualified person.",
    },
    {
      question: "Can it make a message less direct?",
      answer:
        "Yes. Choose a more direct mode or edit courtesy phrases when the required action is no longer immediately clear.",
    },
  ],
};

describe("editorial quality assessment", () => {
  it("keeps structurally complete content out of indexing until human review", () => {
    const result = assessEditorialQuality(usefulDraft, {
      humanReviewed: false,
    });
    expect(result.technicallyComplete).toBe(true);
    expect(result.eligibleForIndexing).toBe(false);
    expect(result.issues).toContain("Human editorial review is required");
  });

  it("accepts useful, reviewed, translator-specific content", () => {
    const result = assessEditorialQuality(usefulDraft, { humanReviewed: true });
    expect(result).toMatchObject({
      status: "REVIEWED",
      eligibleForIndexing: true,
    });
    expect(result.issues).toEqual([]);
  });

  it("rejects generic filler even after a review flag", () => {
    const result = assessEditorialQuality(
      {
        ...usefulDraft,
        about: `${usefulDraft.about} Unlock the power of better communication.`,
      },
      { humanReviewed: true },
    );
    expect(result.eligibleForIndexing).toBe(false);
    expect(result.issues).toContain(
      "Generic AI-style filler requires rewriting",
    );
  });
});
