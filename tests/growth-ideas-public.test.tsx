import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/link", () => ({ default: ({ href, children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => <a href={href} {...props}>{children}</a> }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

import { IdeaVersionActions } from "@/components/admin/idea-autopilot-actions";
import { IdeaBlocks } from "@/components/public/idea-blocks";

describe("SayTwist Ideas public structured rendering", () => {
  it("renders a realistic 15-item page and resolves contextual Translator UI", () => {
    const blocks = [
      { type: "INTRO" as const, text: "Choose a birthday line that matches your relationship and keeps the joke kind." },
      { type: "HEADING" as const, level: 2 as const, text: "Funny birthday messages" },
      { type: "IDEA_LIST" as const, items: Array.from({ length: 15 }, (_, index) => ({ text: `Funny birthday line ${index + 1}`, context: `Context ${index + 1}` })) },
      { type: "TRANSLATOR_CTA" as const, translatorId: "translator", heading: "Make your draft funnier", body: "Try a playful rewrite when you already know what you want to say.", buttonLabel: "Try the Funny Translator" },
    ];
    render(<IdeaBlocks blocks={blocks} translators={[{ id: "translator", slug: "funny-translator", name: "Funny Translator", shortDescription: "Playful rewrites" }]} />);
    expect(screen.getAllByRole("listitem")).toHaveLength(15);
    expect(screen.getByRole("link", { name: "Try the Funny Translator" })).toHaveAttribute("href", "/translators/funny-translator");
    expect(document.body).not.toHaveTextContent("translatorId");
  });
  it("does not render a broken CTA when a referenced Translator is unavailable", () => {
    render(<IdeaBlocks blocks={[{ type: "TRANSLATOR_CTA", translatorId: "missing", heading: "Try it", body: "Context", buttonLabel: "Open" }]} translators={[]} />);
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });
});

describe("SayTwist Ideas archived admin actions", () => {
  it("does not offer rollback controls for archived Ideas", () => {
    render(<IdeaVersionActions ideaId="idea" checksum={"a".repeat(64)} archived versions={[{ id: "v1", version: 1 }]} />);
    expect(screen.queryByRole("button", { name: "Restore v1" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Archive" })).not.toBeInTheDocument();
  });
});
