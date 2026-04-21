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
const SHARE_IMAGE_STYLE_VERSION = "v2";

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

interface ShareImageTheme {
  background: string;
  textFill: string;
  accent: string;
  border: string;
}

const SHARE_IMAGE_THEMES: ShareImageTheme[] = [
  { background: "#EADAF2", textFill: "#7EDC96", accent: "#20242A", border: "#101214" },
  { background: "#FDE7D9", textFill: "#3185FC", accent: "#20242A", border: "#101214" },
  { background: "#DDF3EC", textFill: "#FF7A59", accent: "#20242A", border: "#101214" },
  { background: "#E2E8FF", textFill: "#FFB703", accent: "#20242A", border: "#101214" },
  { background: "#FFE3EE", textFill: "#00A896", accent: "#20242A", border: "#101214" },
  { background: "#EAF7D8", textFill: "#8F5CF7", accent: "#20242A", border: "#101214" },
  { background: "#DFF4FF", textFill: "#FF5D8F", accent: "#20242A", border: "#101214" },
  { background: "#FFEFD5", textFill: "#0096C7", accent: "#20242A", border: "#101214" },
];

function clampText(value: string, maxLength: number) {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, maxLength - 1).trim()}...`;
}

function buildShareImageHash(snapshot: ShareImageSnapshot, platformName: string) {
  const payload = JSON.stringify({
    styleVersion: SHARE_IMAGE_STYLE_VERSION,
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

function hashToIndex(value: string, modulo: number) {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
  }
  return hash % modulo;
}

function pickTheme(snapshot: ShareImageSnapshot) {
  const key = `${snapshot.slug}:${snapshot.sourceLabel}:${snapshot.targetLabel}`;
  return SHARE_IMAGE_THEMES[hashToIndex(key, SHARE_IMAGE_THEMES.length)];
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
  const theme = pickTheme(snapshot);
  const routeLabel = clampText(`${snapshot.sourceLabel} to ${snapshot.targetLabel}`, 96);
  const ctaText = clampText(`Click Here To Translate Your Text To ${snapshot.targetLabel}!`, 120);
  const secondaryText = clampText(snapshot.subtitle || snapshot.name, 80);

  const response = new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          alignItems: "center",
          background: theme.background,
          padding: "56px 52px",
          border: `12px solid ${theme.border}`,
          boxSizing: "border-box",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexWrap: "wrap",
            gap: 18,
            color: theme.accent,
            fontSize: 28,
            fontWeight: 800,
            letterSpacing: 0.8,
            textTransform: "uppercase",
            textAlign: "center",
          }}
        >
          <span>{platformName}</span>
          <span>•</span>
          <span>{routeLabel}</span>
        </div>

        <div
          style={{
            display: "flex",
            flex: 1,
            width: "100%",
            alignItems: "center",
            justifyContent: "center",
            padding: "26px 10px",
          }}
        >
          <h1
            style={{
              margin: 0,
              color: theme.textFill,
              fontSize: 128,
              lineHeight: 1.04,
              fontWeight: 900,
              fontFamily: '"Arial Black", Impact, "Segoe UI Black", sans-serif',
              letterSpacing: -1.2,
              textAlign: "center",
              textTransform: "capitalize",
              textShadow: `-6px -6px 0 ${theme.border}, 6px -6px 0 ${theme.border}, -6px 6px 0 ${theme.border}, 6px 6px 0 ${theme.border}, -3px 0 0 ${theme.border}, 3px 0 0 ${theme.border}, 0 -3px 0 ${theme.border}, 0 3px 0 ${theme.border}, 0 8px 0 rgba(16,18,20,0.24)`,
            }}
          >
            {ctaText}
          </h1>
        </div>

        <p
          style={{
            margin: 0,
            color: theme.accent,
            fontSize: 34,
            fontWeight: 800,
            lineHeight: 1.25,
            textAlign: "center",
          }}
        >
          {secondaryText}
        </p>
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
