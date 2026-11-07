import { apiError, apiOk } from "@/lib/api-response";
import { adminRouteGuard } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { inspectStoredCreativeAsset } from "@/lib/growth/creative/stored-visual-evidence";

export const dynamic = "force-dynamic";

/** ADMIN-only, read-only, on-demand visual preflight for one stored candidate.
 * This never approves, rejects, mutates or schedules any Pin.
 */
export async function GET(request: Request) {
  const guard = await adminRouteGuard();
  if (guard) return guard;
  const url = new URL(request.url);
  const id = url.searchParams.get("candidateId") ?? "";
  if (!/^[a-z0-9]{15,40}$/.test(id))
    return apiError(400, "VALIDATION_ERROR", "Invalid candidate ID.");
  const candidate = await prisma.growthPinCandidate.findUnique({
    where: { id },
    select: { asset: { select: { publicPath: true, checksum: true } } },
  });
  if (!candidate) return apiError(404, "NOT_FOUND", "Candidate not found.");
  try {
    const evidence = await inspectStoredCreativeAsset(
      candidate.asset.publicPath,
      candidate.asset.checksum,
    );
    return apiOk({ candidateId: id, evidence });
  } catch {
    // Never return local storage paths, filesystem exceptions or image bytes.
    return apiError(409, "ASSET_UNAVAILABLE", "Stored creative image cannot be verified.");
  }
}
