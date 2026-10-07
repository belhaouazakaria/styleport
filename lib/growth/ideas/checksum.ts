import { createHash } from "node:crypto";

import type { ResolvedIdeaCandidate } from "@/lib/growth/ideas/contracts";

function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, stable(item)]),
    );
  }
  return value;
}

export function checksumIdeaCandidate(candidate: ResolvedIdeaCandidate) {
  return createHash("sha256").update(JSON.stringify(stable(candidate))).digest("hex");
}

