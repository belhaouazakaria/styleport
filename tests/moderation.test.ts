import { describe, expect, it } from "vitest";
import { CommentModerationStatus } from "@prisma/client";

import { assessTranslatorCommentModeration, assessTranslatorRequestForAutoApproval } from "@/lib/moderation";

describe("assessTranslatorRequestForAutoApproval", () => {
  it("marks clear requests as good", () => {
    const result = assessTranslatorRequestForAutoApproval({
      requestedName: "Friendly Sales Translator",
      description: "Rewrite sales outreach text into a warm, trustworthy tone while keeping meaning.",
      desiredStyle: "Friendly and professional",
      audience: "Startup founders",
    });

    expect(result.verdict).toBe("good");
  });

  it("sends suspicious requests to manual review", () => {
    const result = assessTranslatorRequestForAutoApproval({
      requestedName: "Best crypto hack",
      description:
        "Visit https://spam.test and https://another-spam.test NOW!!!!!! BUY FOLLOWERS BUY FOLLOWERS BUY FOLLOWERS",
      notes: "casino promo",
    });

    expect(result.verdict).toBe("manual_review");
    expect(result.reason).toBeTruthy();
  });
});

describe("assessTranslatorCommentModeration", () => {
  it("keeps clean comments visible", () => {
    const result = assessTranslatorCommentModeration({
      name: "Maya",
      email: "maya@example.com",
      comment: "This translator is super useful for writing LinkedIn updates. Nice work!",
    });

    expect(result.status).toBe(CommentModerationStatus.VISIBLE);
  });

  it("sends suspicious comments to pending review", () => {
    const result = assessTranslatorCommentModeration({
      name: "Promo",
      email: "promo@example.com",
      comment: "Buy followers now at https://spam.test",
    });

    expect(result.status).toBe(CommentModerationStatus.PENDING_REVIEW);
    expect(result.reason).toBeTruthy();
  });
});
