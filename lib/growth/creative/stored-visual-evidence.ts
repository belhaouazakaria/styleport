import { createHash } from "node:crypto";
import { resolveCreativeAssetFile } from "@/lib/growth/creative/storage";
import { inspectCreativeVisualEvidence } from "@/lib/growth/creative/visual-evidence";
import { MAX_CREATIVE_BYTES } from "@/lib/growth/creative/constants";

/** A read-only, bounded check of one existing managed Creative Lab asset.
 * The caller must authenticate and resolve the asset via the database first.
 * No image URL, absolute path or arbitrary filename may be accepted from HTTP.
 */
export async function inspectStoredCreativeAsset(
  publicPath: string,
  expectedChecksum: string,
) {
  if (!/^[a-f0-9]{64}$/.test(expectedChecksum)) throw new Error("INVALID_ASSET_REFERENCE");
  const match = /^\/generated\/growth-creatives\/(creative-[a-f0-9]{64}\.png)$/.exec(publicPath);
  if (!match || match[1] !== `creative-${expectedChecksum}.png`)
    throw new Error("INVALID_ASSET_REFERENCE");
  const resolved = resolveCreativeAssetFile(match[1]);
  if (!resolved) throw new Error("INVALID_ASSET_REFERENCE");
  // Read at most the permitted size plus one byte; fail closed on truncated
  // or mutated assets without allocating an unbounded attacker-controlled file.
  const handle = await import("node:fs/promises").then(fs => fs.open(resolved, "r"));
  let bytes: Buffer;
  try {
    const stats = await handle.stat();
    if (!stats.isFile() || stats.size <= 0 || stats.size > MAX_CREATIVE_BYTES)
      throw new Error("INVALID_ASSET");
    bytes = Buffer.alloc(stats.size);
    let offset = 0;
    while (offset < bytes.length) {
      const { bytesRead } = await handle.read(bytes, offset, bytes.length - offset, offset);
      if (bytesRead <= 0) throw new Error("INVALID_ASSET");
      offset += bytesRead;
    }
    const after = await handle.stat();
    if (after.size !== stats.size || after.mtimeMs !== stats.mtimeMs)
      throw new Error("INVALID_ASSET");
  } finally {
    await handle.close();
  }
  if (createHash("sha256").update(bytes).digest("hex") !== expectedChecksum)
    throw new Error("CHECKSUM_MISMATCH");
  return inspectCreativeVisualEvidence(bytes);
}
