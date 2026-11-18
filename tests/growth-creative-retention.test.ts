import { GrowthPinCandidateStatus } from "@prisma/client";
import { mkdtemp, link, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";

import {
  CREATIVE_DESIGN_RETENTION_LIMIT,
  selectCreativeCandidatesToRetire,
} from "@/lib/growth/creative/retention";

function candidate(id: string, status = GrowthPinCandidateStatus.READY, protectedBy: "approval" | "telegram" | "publication" | "preparation" | null = null) {
  return {
    id,
    status,
    approvals: protectedBy === "approval" ? [{ id: `${id}-approval` }] : [],
    telegramReview: protectedBy === "telegram" ? { id: `${id}-review` } : null,
    publications: protectedBy === "publication" ? [{ id: `${id}-publication` }] : [],
    preparedFromRecommendation: protectedBy === "preparation" ? { id: `${id}-preparation` } : null,
  };
}

describe("Studio creative retention", () => {
  it("retires eligible designs older than the newest 20", () => {
    const rows = Array.from({ length: 23 }, (_, index) => candidate(`design-${index}`));
    expect(CREATIVE_DESIGN_RETENTION_LIMIT).toBe(20);
    expect(selectCreativeCandidatesToRetire(rows).map(({ id }) => id)).toEqual(["design-20", "design-21", "design-22"]);
  });

  it.each(["approval", "telegram", "publication", "preparation"] as const)(
    "keeps an older design linked to %s history",
    (reference) => {
      const rows = Array.from({ length: 23 }, (_, index) => candidate(`design-${index}`, GrowthPinCandidateStatus.READY, index === 22 ? reference : null));
      expect(selectCreativeCandidatesToRetire(rows).map(({ id }) => id)).toEqual(["design-20", "design-21"]);
    },
  );

  it("keeps active render and retry states even when they are old", () => {
    const rows = [
      ...Array.from({ length: 20 }, (_, index) => candidate(`new-${index}`)),
      candidate("rendering", GrowthPinCandidateStatus.RENDERING),
      candidate("retry", GrowthPinCandidateStatus.FAILED_RETRYABLE),
      candidate("terminal", GrowthPinCandidateStatus.FAILED_TERMINAL),
    ];
    expect(selectCreativeCandidatesToRetire(rows).map(({ id }) => id)).toEqual(["terminal"]);
  });

  it("removes a managed image only when no generation lease still links it", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "studio-retention-"));
    const previous = process.env.GROWTH_CREATIVE_STORAGE_DIR;
    process.env.GROWTH_CREATIVE_STORAGE_DIR = directory;
    vi.resetModules();
    try {
      const storage = await import("@/lib/growth/creative/storage");
      const publicPath = `/generated/growth-creatives/creative-${"a".repeat(64)}.png`;
      const file = storage.resolveCreativeAssetPublicPath(publicPath)!;
      await writeFile(file, "image");
      const lease = `${file}.lease`;
      await link(file, lease);
      expect(await storage.removeCreativeAssetFileIfUnlinked(publicPath)).toBe(false);
      await rm(lease);
      expect(await storage.removeCreativeAssetFileIfUnlinked(publicPath)).toBe(true);
      await expect(readFile(file)).rejects.toMatchObject({ code: "ENOENT" });
      expect(await storage.removeCreativeAssetFileIfUnlinked("/etc/passwd")).toBe(false);

      const webpPath = `/generated/growth-creatives/creative-${"b".repeat(64)}.webp`;
      const webpFile = path.join(directory, path.basename(webpPath));
      await writeFile(webpFile, "webp");
      const webpLease = `${webpFile}.lease`;
      await link(webpFile, webpLease);
      expect(await storage.removeRetiredCreativeFileIfUnlinked(webpPath)).toBe("linked");
      await rm(webpLease);
      expect(await storage.removeRetiredCreativeFileIfUnlinked(webpPath)).toBe("removed");
    } finally {
      if (previous === undefined) delete process.env.GROWTH_CREATIVE_STORAGE_DIR;
      else process.env.GROWTH_CREATIVE_STORAGE_DIR = previous;
      vi.resetModules();
      await rm(directory, { recursive: true, force: true });
    }
  });
});
