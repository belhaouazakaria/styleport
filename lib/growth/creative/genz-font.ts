import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { create, type Font } from "fontkit";

export const UPRIGHT_REFERENCE_SHA256 = "b4a4e229e398cee333082204aedcfc5a2f7cff1537420381983fd7c439c95824";
export interface UprightFont { font: Font; checksum: string }
export async function loadUprightFont(options: { forPreview?: boolean; filePath?: string; permissionPath?: string } = {}): Promise<UprightFont> {
  const filePath = options.filePath ?? process.env.GROWTH_UPRIGHT_FONT_PATH ?? path.join(process.cwd(), "storage/fonts/upright/Upright.otf");
  const bytes = await readFile(filePath).catch(() => { throw Error("Upright Regular font is missing. Install the checksum-verified original Upright.otf in private font storage."); });
  if (bytes.length < 1000 || bytes.length > 5_000_000) throw Error("UPRIGHT_FONT_INVALID");
  const checksum = createHash("sha256").update(bytes).digest("hex");
  const expected = process.env.GROWTH_UPRIGHT_FONT_SHA256 ?? UPRIGHT_REFERENCE_SHA256;
  if (checksum !== expected) throw Error("UPRIGHT_FONT_CHECKSUM_MISMATCH");
  const loaded = create(bytes);
  if (!("layout" in loaded) || loaded.familyName !== "Upright" || loaded.subfamilyName !== "Regular") throw Error("UPRIGHT_REGULAR_REQUIRED_NO_SUBSTITUTE");
  // The owner confirmed that the exact original Whisper asset is usable
  // without a separate commercial license. Keep the checksum pin so this
  // exception cannot silently extend to another font named "Upright".
  if (!options.forPreview && checksum !== UPRIGHT_REFERENCE_SHA256) {
    const permissionPath = options.permissionPath ?? process.env.GROWTH_UPRIGHT_FONT_PERMISSION_PATH ?? path.join(path.dirname(filePath), "permission.json");
    const permission = await readFile(permissionPath, "utf8").then(text => JSON.parse(text)).catch(() => null);
    if (permission?.fontSha256 !== checksum || permission?.commercialRenderingAuthorized !== true || typeof permission?.licenseReference !== "string" || !permission.licenseReference.trim()) {
      throw Error("Upright commercial-use permission is unverified. Supply the font's license or owner permission record before generation.");
    }
  }
  return { font: loaded, checksum };
}
export async function readUprightFontStatus() {
  try { const result = await loadUprightFont(); return { ready: true, checksum: result.checksum, message: "Upright Regular verified." }; }
  catch (error) { return { ready: false, checksum: null, message: error instanceof Error ? error.message : "Upright font is unavailable." }; }
}
