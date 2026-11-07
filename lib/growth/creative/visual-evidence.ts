import sharp from "sharp";
import { createHash } from "node:crypto";

import { CREATIVE_HEIGHT, CREATIVE_WIDTH, MAX_CREATIVE_BYTES } from "@/lib/growth/creative/constants";

/**
 * Offline, bounded visual preflight. This is not OCR, semantic evaluation, or
 * Pinterest approval. Every candidate still needs owner visual/copy review.
 */
export interface CreativeVisualEvidence {
  version: "creative_visual_preflight_v1";
  status: "REVIEW_REQUIRED" | "REJECTED";
  checksum: string | null;
  width: number | null;
  height: number | null;
  bytes: number;
  opaque: boolean | null;
  grayscale: boolean | null;
  entropy: number | null;
  flags: Array<
    "INVALID_ASSET" | "UNEXPECTED_DIMENSIONS" | "TRANSPARENCY" |
    "LOW_DETAIL" | "NEAR_UNIFORM" | "OVERSIZE"
  >;
  mandatoryHumanChecks: readonly [
    "EXACT_COPY_AND_SPELLING",
    "MOBILE_READABILITY",
    "DESTINATION_AND_BRAND",
    "VISUAL_ORIGINALITY",
    "BOARD_AND_ACCOUNT",
    "PER_PIN_APPROVAL",
  ];
}

const checks = [
  "EXACT_COPY_AND_SPELLING",
  "MOBILE_READABILITY",
  "DESTINATION_AND_BRAND",
  "VISUAL_ORIGINALITY",
  "BOARD_AND_ACCOUNT",
  "PER_PIN_APPROVAL",
] as const;

export async function inspectCreativeVisualEvidence(
  input: Buffer,
): Promise<CreativeVisualEvidence> {
  const flags: CreativeVisualEvidence["flags"] = [];
  const evidence: CreativeVisualEvidence = {
    version: "creative_visual_preflight_v1",
    status: "REJECTED",
    checksum: null,
    width: null,
    height: null,
    bytes: input.length,
    opaque: null,
    grayscale: null,
    entropy: null,
    flags,
    mandatoryHumanChecks: checks,
  };
  // Reject before decoding, including zero-length and untrusted giant files.
  if (!input.length || input.length > MAX_CREATIVE_BYTES) {
    flags.push(input.length > MAX_CREATIVE_BYTES ? "OVERSIZE" : "INVALID_ASSET");
    return evidence;
  }
  try {
    const image = sharp(input, { failOn: "error", limitInputPixels: 2_000_000 });
    const metadata = await image.metadata();
    evidence.width = metadata.width ?? null;
    evidence.height = metadata.height ?? null;
    if (metadata.format !== "png") {
      flags.push("INVALID_ASSET");
      return evidence;
    }
    evidence.checksum = createHash("sha256").update(input).digest("hex");
    if (metadata.width !== CREATIVE_WIDTH || metadata.height !== CREATIVE_HEIGHT)
      flags.push("UNEXPECTED_DIMENSIONS");
    // A PNG may contain an alpha channel whose every pixel is fully opaque.
    // Channel presence alone does not prove transparency.
    if (metadata.hasAlpha) {
      const stats = await image.clone().stats();
      const alpha = stats.channels[3];
      evidence.opaque = Boolean(alpha && alpha.min === 255);
    } else {
      evidence.opaque = true;
    }
    if (!evidence.opaque) flags.push("TRANSPARENCY");
    // A bounded 64x64 downsample measures composition variety, not text legibility.
    const { data, info } = await image.clone().flatten({ background: "#ffffff" })
      .resize(64, 64, { fit: "fill" }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    if (info.channels < 3 || data.length !== 64 * 64 * info.channels)
      throw new Error("Unexpected pixel layout");
    const histogram = new Uint32Array(32);
    let min = 255, max = 0, chroma = 0;
    for (let i = 0; i < data.length; i += info.channels) {
      const r = data[i], g = data[i + 1], b = data[i + 2];
      const y = Math.round(0.2126 * r + 0.7152 * g + 0.0722 * b);
      histogram[Math.min(31, y >>> 3)]++;
      min = Math.min(min, y);
      max = Math.max(max, y);
      chroma += Math.max(r, g, b) - Math.min(r, g, b);
    }
    let entropy = 0;
    for (const count of histogram) {
      if (!count) continue;
      const probability = count / 4096;
      entropy -= probability * Math.log2(probability);
    }
    evidence.entropy = Number(entropy.toFixed(3));
    evidence.grayscale = chroma / 4096 < 3;
    if (max - min < 18) flags.push("NEAR_UNIFORM");
    if (entropy < 1.1) flags.push("LOW_DETAIL");
    // Only hard asset defects block. A minimalist design may be intentional.
    evidence.status = flags.some(flag =>
      flag === "INVALID_ASSET" || flag === "UNEXPECTED_DIMENSIONS" ||
      flag === "TRANSPARENCY" || flag === "OVERSIZE",
    ) ? "REJECTED" : "REVIEW_REQUIRED";
  } catch {
    if (!flags.includes("INVALID_ASSET")) flags.push("INVALID_ASSET");
    evidence.status = "REJECTED";
  }
  return evidence;
}
