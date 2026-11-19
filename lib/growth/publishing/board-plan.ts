type Board = { id: string; name: string; description?: string | null };

function boardTerms(value: string) {
  const stop = new Set(["a","an","and","for","how","in","of","on","the","to","your","with","translators","translator","ideas","saytwist"]);
  return new Set((value.toLowerCase().match(/[a-z0-9]{3,}/g) || []).filter(word => !stop.has(word)));
}

export function choosePinApprovalBoard(input: {
  boards: Board[];
  originalBoardId: string | null;
  destinationKind: string;
  candidateText: string;
}) {
  const original = input.boards.find(board => board.id === input.originalBoardId);
  const translatorBoards = input.destinationKind === "TRANSLATOR"
    ? input.boards.filter(board => /^translators?$/i.test(board.name.trim()))
    : [];
  if (original) return original;
  if (translatorBoards.length === 1) return translatorBoards[0];

  const desired = boardTerms(input.candidateText);
  const ranked = input.boards.map(board => {
    const titleWords = boardTerms(board.name);
    const detailWords = boardTerms(board.description || "");
    return { board, score: [...desired].reduce((n, word) => n + (titleWords.has(word) ? 3 : detailWords.has(word) ? 1 : 0), 0) };
  }).sort((a,b) => b.score - a.score || a.board.name.localeCompare(b.board.name) || a.board.id.localeCompare(b.board.id));
  return ranked[0].score > 0 || input.boards.length === 1 ? ranked[0].board : null;
}
