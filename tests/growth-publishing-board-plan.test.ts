import { describe, expect, it } from "vitest";
import { choosePinApprovalBoard } from "@/lib/growth/publishing/board-plan";

describe("Pinterest approval board planning", () => {
  it("routes a translator candidate to the sole canonical Translator board", () => {
    const boards = [
      { id: "ideas", name: "SayTwist Ideas" },
      { id: "translator", name: "Translator" },
    ];
    expect(choosePinApprovalBoard({ boards, originalBoardId: null, destinationKind: "TRANSLATOR", candidateText: "A fun new translator pin" }))
      .toEqual(boards[1]);
  });

  it("routes source-translator Pins to the unique Translator board on the rotating account", () => {
    const boards = [
      { id: "products", name: "Products" },
      { id: "translator", name: "Translator" },
    ];
    expect(choosePinApprovalBoard({ boards, originalBoardId: null, destinationKind: "TRANSLATOR", candidateText: "Explore Romantcy Slang Wording https://anythingtranslate.com/translators/romantcy-slang-translator/" }))
      .toEqual(boards[1]);
  });

  it("keeps ambiguous boards blocked when there is no unique translator board", () => {
    const boards = [{ id: "one", name: "SayTwist" }, { id: "two", name: "Ideas" }];
    expect(choosePinApprovalBoard({ boards, originalBoardId: null, destinationKind: "TRANSLATOR", candidateText: "Translator" })).toBeNull();
  });
});
