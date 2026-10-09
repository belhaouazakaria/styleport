import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("Creative Lab gallery ordering", () => {
  it("keeps database and visual reading order newest-first", async () => {
    const [service, page] = await Promise.all([
      readFile(path.join(process.cwd(), "lib/growth/creative/candidates.ts"), "utf8"),
      readFile(path.join(process.cwd(), "app/(admin)/admin/growth/creative/page.tsx"), "utf8"),
    ]);
    expect(service).toContain('orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 50');
    expect(page).toContain("grid items-start gap-5 md:grid-cols-2 xl:grid-cols-3");
    expect(page).not.toContain("columns-1");
    expect(page).toContain('id={`candidate-${candidate.id}`}');
    expect(page).toContain("candidate.createdAt.toISOString()");
  });
});
