import { createHash } from "node:crypto";
import { access, mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import { ImageResponse } from "next/og";

import { APP_NAME } from "@/lib/constants";
import { getAppBaseUrl } from "@/lib/env";
import { logError, logInfo, logWarn } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { getAppSettings } from "@/lib/settings";

const SHARE_IMAGE_WIDTH = 1000;
const SHARE_IMAGE_HEIGHT = 1500;

const publicPathPrefix = (() => {
  const raw = (process.env.SHARE_IMAGE_PUBLIC_PATH_PREFIX || "/generated/pins").trim();
  if (!raw) {
    return "/generated/pins";
  }

  return raw.startsWith("/") ? raw.replace(/\/+$/, "") : `/${raw.replace(/\/+$/, "")}`;
})();

const storageDirectory =
  process.env.SHARE_IMAGE_STORAGE_DIR ||
  path.join(process.cwd(), "public", publicPathPrefix.replace(/^\//, ""));

interface ShareImageSnapshot {
  id: string;
  slug: string;
  name: string;
  subtitle: string;
  shortDescription: string;
  sourceLabel: string;
  targetLabel: string;
  shareImagePath: string | null;
  shareImageHash: string | null;
  shareImageUpdatedAt: Date | null;
}

interface EnsureShareImageOptions {
  force?: boolean;
}

function clampText(value: string, maxLength: number) {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, maxLength - 1).trim()}...`;
}

function buildShareImageHash(snapshot: ShareImageSnapshot, platformName: string) {
  const payload = JSON.stringify({
    platformName,
    slug: snapshot.slug,
    name: snapshot.name,
    subtitle: snapshot.subtitle,
    shortDescription: snapshot.shortDescription,
    sourceLabel: snapshot.sourceLabel,
    targetLabel: snapshot.targetLabel,
  });

  return createHash("sha256").update(payload).digest("hex").slice(0, 16);
}

function buildPublicPath(slug: string, hash: string) {
  return `${publicPathPrefix}/${slug}-${hash}.png`;
}

function toStoragePath(publicPath: string) {
  const fileName = path.basename(publicPath);
  return path.join(storageDirectory, fileName);
}

async function fileExists(filePath: string) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function renderShareImageBuffer(snapshot: ShareImageSnapshot, platformName: string) {
  const headline = clampText(snapshot.name, 84);
  const subtitle = clampText(snapshot.subtitle, 140);
  const description = clampText(snapshot.shortDescription, 180);

  const response = new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background:
            "radial-gradient(circle at 15% 0%, rgba(91,91,246,0.18), transparent 36%), radial-gradient(circle at 85% 12%, rgba(91,91,246,0.14), transparent 40%), linear-gradient(180deg, #FAFBFC 0%, #F7F8FC 100%)",
          padding: "72px 68px",
          border: "10px solid #E5E7EB",
          boxSizing: "border-box",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            color: "#6B7280",
            fontSize: 30,
            fontWeight: 600,
            letterSpacing: 1.4,
            textTransform: "uppercase",
          }}
        >
          <span>{platformName}</span>
          <span>Translator</span>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 34 }}>
          <p
            style={{
              margin: 0,
              fontSize: 36,
              lineHeight: 1.3,
              color: "#5B5BF6",
              fontWeight: 700,
              letterSpacing: 0.2,
              textTransform: "uppercase",
            }}
          >
            {snapshot.sourceLabel} to {snapshot.targetLabel}
          </p>

          <h1
            style={{
              margin: 0,
              color: "#ffffff",
              fontSize: 104,
              lineHeight: 0.95,
              fontWeight: 900,
              letterSpacing: -1.4,
              textTransform: "uppercase",
              textShadow:
                "-2px -2px 0 #111827, 2px -2px 0 #111827, -2px 2px 0 #111827, 2px 2px 0 #111827, 0 4px 0 rgba(17,24,39,0.22)",
            }}
          >
            {headline}
          </h1>
        </div>

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 16,
            borderTop: "2px solid #E5E7EB",
            paddingTop: 28,
          }}
        >
          <p style={{ margin: 0, color: "#111827", fontSize: 38, lineHeight: 1.3, fontWeight: 600 }}>
            {subtitle}
          </p>
          <p style={{ margin: 0, color: "#6B7280", fontSize: 30, lineHeight: 1.45, fontWeight: 500 }}>
            {description}
          </p>
        </div>
      </div>
    ),
    {
      width: SHARE_IMAGE_WIDTH,
      height: SHARE_IMAGE_HEIGHT,
    },
  );

  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

async function removeOldShareImageIfNeeded(oldPublicPath: string | null, nextPublicPath: string) {
  if (!oldPublicPath || oldPublicPath === nextPublicPath) {
    return;
  }

  const oldStoragePath = toStoragePath(oldPublicPath);
  try {
    await rm(oldStoragePath, { force: true });
  } catch {
    // Best-effort cleanup only.
  }
}

export async function deleteStoredShareImage(shareImagePath: string | null) {
  if (!shareImagePath) {
    return;
  }

  const storagePath = toStoragePath(shareImagePath);
  try {
    await rm(storagePath, { force: true });
  } catch {
    // Best-effort cleanup only.
  }
}

export function getShareImageAbsoluteUrl(shareImagePath: string | null) {
  if (!shareImagePath) {
    return null;
  }

  if (/^https?:\/\//i.test(shareImagePath)) {
    return shareImagePath;
  }

  return new URL(shareImagePath, getAppBaseUrl()).toString();
}

async function loadTranslatorSnapshotById(id: string): Promise<ShareImageSnapshot | null> {
  return prisma.translator.findUnique({
    where: { id },
    select: {
      id: true,
      slug: true,
      name: true,
      subtitle: true,
      shortDescription: true,
      sourceLabel: true,
      targetLabel: true,
      shareImagePath: true,
      shareImageHash: true,
      shareImageUpdatedAt: true,
    },
  });
}

export async function ensureTranslatorShareImageById(
  translatorId: string,
  options: EnsureShareImageOptions = {},
) {
  const snapshot = await loadTranslatorSnapshotById(translatorId);
  if (!snapshot) {
    return null;
  }

  const settings = await getAppSettings();
  const platformName = settings.platformName || APP_NAME;
  const hash = buildShareImageHash(snapshot, platformName);
  const nextPublicPath = buildPublicPath(snapshot.slug, hash);
  const nextStoragePath = toStoragePath(nextPublicPath);

  const hasCurrentAsset =
    snapshot.shareImagePath === nextPublicPath &&
    snapshot.shareImageHash === hash &&
    (await fileExists(nextStoragePath));

  if (!options.force && hasCurrentAsset) {
    return {
      translatorId: snapshot.id,
      shareImagePath: nextPublicPath,
      shareImageHash: hash,
      shareImageUpdatedAt: snapshot.shareImageUpdatedAt,
    };
  }

  try {
    const imageBuffer = await renderShareImageBuffer(snapshot, platformName);
    await mkdir(storageDirectory, { recursive: true });
    await writeFile(nextStoragePath, imageBuffer);
    await removeOldShareImageIfNeeded(snapshot.shareImagePath, nextPublicPath);

    const updated = await prisma.translator.update({
      where: { id: snapshot.id },
      data: {
        shareImagePath: nextPublicPath,
        shareImageHash: hash,
        shareImageUpdatedAt: new Date(),
      },
      select: {
        id: true,
        shareImagePath: true,
        shareImageHash: true,
        shareImageUpdatedAt: true,
      },
    });

    logInfo("share_image_generated", "Translator share image generated and stored.", {
      translatorId: snapshot.id,
      slug: snapshot.slug,
      shareImagePath: updated.shareImagePath,
      forced: Boolean(options.force),
    });

    return {
      translatorId: updated.id,
      shareImagePath: updated.shareImagePath,
      shareImageHash: updated.shareImageHash,
      shareImageUpdatedAt: updated.shareImageUpdatedAt,
    };
  } catch (error) {
    logError(
      "share_image_generation_failed",
      "Failed to generate translator share image.",
      {
        translatorId: snapshot.id,
        slug: snapshot.slug,
        forced: Boolean(options.force),
      },
      error,
    );
    return {
      translatorId: snapshot.id,
      shareImagePath: snapshot.shareImagePath,
      shareImageHash: snapshot.shareImageHash,
      shareImageUpdatedAt: snapshot.shareImageUpdatedAt,
    };
  }
}

export async function ensureTranslatorShareImageBySlug(
  slug: string,
  options: EnsureShareImageOptions = {},
) {
  const translator = await prisma.translator.findUnique({
    where: { slug },
    select: { id: true },
  });

  if (!translator) {
    return null;
  }

  return ensureTranslatorShareImageById(translator.id, options);
}

export async function backfillMissingShareImagesForFeatured() {
  const rows = await prisma.translator.findMany({
    where: {
      isActive: true,
      archivedAt: null,
      isFeatured: true,
      shareImagePath: null,
    },
    select: { id: true, slug: true },
    take: 20,
    orderBy: [{ featuredRank: "asc" }, { sortOrder: "asc" }, { updatedAt: "desc" }],
  });

  if (!rows.length) {
    return;
  }

  for (const row of rows) {
    try {
      await ensureTranslatorShareImageById(row.id);
    } catch (error) {
      logWarn("share_image_backfill_failed", "Backfill failed for featured translator share image.", {
        translatorId: row.id,
        slug: row.slug,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}
