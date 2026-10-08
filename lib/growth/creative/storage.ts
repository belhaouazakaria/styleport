import { createHash, randomBytes } from "node:crypto";
import { access, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import { CREATIVE_HEIGHT, CREATIVE_WIDTH, MAX_CREATIVE_BYTES } from "@/lib/growth/creative/constants";

const storageDirectory = process.env.GROWTH_CREATIVE_STORAGE_DIR || path.join(process.cwd(), "storage", "generated", "growth-creatives");
const publicPathPrefix = "/generated/growth-creatives";

export function creativeAssetChecksum(bytes: Buffer) {
  return createHash("sha256").update(bytes).digest("hex");
}

export function readPngDimensions(bytes: Buffer) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  if (bytes.length < 24 || !bytes.subarray(0, 8).equals(signature) || bytes.toString("ascii", 12, 16) !== "IHDR") {
    throw new Error("Creative asset must be a valid PNG.");
  }
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

export function validateCreativePng(bytes: Buffer) {
  if (!bytes.length || bytes.length > MAX_CREATIVE_BYTES) throw new Error("Creative PNG exceeds the bounded asset size.");
  const dimensions = readPngDimensions(bytes);
  if (dimensions.width !== CREATIVE_WIDTH || dimensions.height !== CREATIVE_HEIGHT) throw new Error("Creative PNG must be 1000x1500.");
  return dimensions;
}

export async function readControlAsset(filePath: string) {
  const resolved = path.resolve(filePath);
  const allowedRoot = path.resolve(process.env.SHARE_IMAGE_STORAGE_DIR || path.join(process.cwd(), "storage", "generated", "pins"));
  if (!resolved.startsWith(`${allowedRoot}${path.sep}`)) throw new Error("Control asset path is outside managed share-image storage.");
  const bytes = await readFile(resolved);
  validateCreativePng(bytes);
  return bytes;
}

export async function persistCreativeAssetFile(bytes: Buffer) {
  validateCreativePng(bytes);
  const checksum = creativeAssetChecksum(bytes);
  const fileName = `creative-${checksum}.png`;
  const finalPath = path.join(storageDirectory, fileName);
  const publicPath = `${publicPathPrefix}/${fileName}`;
  await mkdir(storageDirectory, { recursive: true });
  try {
    await access(finalPath);
    return { checksum, filePath: finalPath, publicPath, byteSize: bytes.length, created: false };
  } catch {
    // Continue with a bounded atomic write.
  }
  const tempPath = path.join(storageDirectory, `.creative-${randomBytes(8).toString("hex")}.tmp`);
  try {
    await writeFile(tempPath, bytes, { flag: "wx" });
    await rename(tempPath, finalPath);
    return { checksum, filePath: finalPath, publicPath, byteSize: bytes.length, created: true };
  } catch (error) {
    await rm(tempPath, { force: true });
    try {
      await access(finalPath);
      return { checksum, filePath: finalPath, publicPath, byteSize: bytes.length, created: false };
    } catch {
      throw error;
    }
  }
}

export async function removeUnreferencedCreativeAssetFile(filePath: string, referenced: boolean) {
  if (referenced) return;
  const resolved = path.resolve(filePath);
  const root = path.resolve(storageDirectory);
  if (!resolved.startsWith(`${root}${path.sep}`)) return;
  await rm(resolved, { force: true });
}

export function resolveCreativeAssetFile(filename: string) {
  if (!filename || filename.length > 191 || !/^creative-[a-f0-9]{64}\.png$/.test(filename)) return null;
  return path.join(storageDirectory, filename);
}

