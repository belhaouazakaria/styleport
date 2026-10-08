import { createHash, randomBytes } from "node:crypto";
import { link, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
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
  const tempPath = path.join(storageDirectory, `.creative-${randomBytes(8).toString("hex")}.tmp`);
  const leasePath = path.join(storageDirectory, `.creative-${checksum}-${randomBytes(8).toString("hex")}.lease`);
  let created = false;
  try {
    await writeFile(tempPath, bytes, { flag: "wx" });
    try {
      await link(tempPath, finalPath);
      created = true;
    } catch (error) {
      if (!(error instanceof Error && "code" in error && error.code === "EEXIST")) throw error;
      const existing = await readFile(finalPath);
      validateCreativePng(existing);
      if (creativeAssetChecksum(existing) !== checksum) throw new Error("Existing Creative asset does not match its content-addressed path.");
    }
    await link(finalPath, leasePath);
    return { checksum, filePath: finalPath, publicPath, byteSize: bytes.length, created, leasePath };
  } catch (error) {
    await rm(leasePath, { force: true });
    if (created) {
      const fileStats = await stat(finalPath).catch(() => null);
      if (fileStats?.nlink === 1) await rm(finalPath, { force: true });
    }
    throw error;
  } finally {
    await rm(tempPath, { force: true });
  }
}

export async function cleanupCreativeAssetAfterFailure(
  stored: { filePath: string; leasePath: string; created: boolean },
  verifyReferenceCount: () => Promise<number>,
) {
  if (!stored.created) return false;
  let referenceCount: number;
  try {
    referenceCount = await verifyReferenceCount();
  } catch {
    return false;
  }
  if (referenceCount !== 0) return false;
  const fileStats = await stat(stored.filePath).catch(() => null);
  if (!fileStats || fileStats.nlink > 2) return false;
  const resolved = path.resolve(stored.filePath);
  const root = path.resolve(storageDirectory);
  if (!resolved.startsWith(`${root}${path.sep}`)) return false;
  await rm(resolved, { force: true });
  return true;
}

export async function releaseCreativeAssetLease(leasePath: string) {
  const resolved = path.resolve(leasePath);
  const root = path.resolve(storageDirectory);
  if (!resolved.startsWith(`${root}${path.sep}`)) return;
  await rm(resolved, { force: true });
}

export function resolveCreativeAssetFile(filename: string) {
  if (!filename || filename.length > 191 || !/^creative-[a-f0-9]{64}\.png$/.test(filename)) return null;
  return path.join(storageDirectory, filename);
}
