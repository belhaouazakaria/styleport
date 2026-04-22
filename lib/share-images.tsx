import { createHash, randomBytes } from "node:crypto";
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
const SHARE_IMAGE_HEADLINE_FONT_NAME = "SharePosterAnton";
const SHARE_IMAGE_SUPPORT_FONT_NAME = "SharePosterMontserrat";
const SHARE_IMAGE_HEADLINE_FONT_FAMILY = `"${SHARE_IMAGE_HEADLINE_FONT_NAME}", "${SHARE_IMAGE_SUPPORT_FONT_NAME}", "Arial Black", "Segoe UI Black", Impact, Haettenschweiler, "Franklin Gothic Heavy", sans-serif`;
const SHARE_IMAGE_SUPPORT_FONT_FAMILY = `"${SHARE_IMAGE_SUPPORT_FONT_NAME}", "${SHARE_IMAGE_HEADLINE_FONT_NAME}", "Arial Black", "Segoe UI Black", Impact, Haettenschweiler, "Franklin Gothic Heavy", sans-serif`;

const ANTON_FONT_URLS = [
  "https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/anton/Anton-Regular.ttf",
  "https://raw.githubusercontent.com/google/fonts/main/ofl/anton/Anton-Regular.ttf",
];

const MONTSERRAT_EXTRABOLD_FONT_URLS = [
  "https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/montserrat/Montserrat-ExtraBold.ttf",
  "https://raw.githubusercontent.com/google/fonts/main/ofl/montserrat/Montserrat-ExtraBold.ttf",
];

const MONTSERRAT_BLACK_FONT_URLS = [
  "https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/montserrat/Montserrat-Black.ttf",
  "https://raw.githubusercontent.com/google/fonts/main/ofl/montserrat/Montserrat-Black.ttf",
];

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
  throwOnError?: boolean;
}

interface EnsureTranslatorShareImageResult {
  translatorId: string;
  shareImagePath: string | null;
  shareImageHash: string | null;
  shareImageUpdatedAt: Date | null;
}

interface ShareImageTheme {
  background: string;
  textFill: string;
  accent: string;
  border: string;
}

const inFlightShareImageGeneration = new Map<
  string,
  Promise<EnsureTranslatorShareImageResult | null>
>();
type ShareImageFontWeight = 100 | 200 | 300 | 400 | 500 | 600 | 700 | 800 | 900;
interface ShareImageFont {
  name: string;
  data: ArrayBuffer;
  weight: ShareImageFontWeight;
  style: "normal";
}
let shareImageFontsPromise:
  | Promise<ShareImageFont[]>
  | null = null;

const MIN_TEXT_BG_CONTRAST = 2.2;
const MIN_ACCENT_BG_CONTRAST = 7;

const SAFE_SHARE_IMAGE_THEME: ShareImageTheme = {
  background: "#EADAF2",
  textFill: "#2E9B5F",
  accent: "#171717",
  border: "#101214",
};

const SHARE_IMAGE_THEMES: ShareImageTheme[] = [
  { background: "#EADAF2", textFill: "#2E9B5F", accent: "#171717", border: "#101214" },
  { background: "#FDE7D9", textFill: "#2D6AE3", accent: "#171717", border: "#101214" },
  { background: "#DDF3EC", textFill: "#CC5A2E", accent: "#171717", border: "#101214" },
  { background: "#E2E8FF", textFill: "#C35C00", accent: "#171717", border: "#101214" },
  { background: "#FFE3EE", textFill: "#0D8A7E", accent: "#171717", border: "#101214" },
  { background: "#EAF7D8", textFill: "#7A4FE0", accent: "#171717", border: "#101214" },
  { background: "#DFF4FF", textFill: "#C63F71", accent: "#171717", border: "#101214" },
  { background: "#FFEFD5", textFill: "#066BA1", accent: "#171717", border: "#101214" },
  { background: "#FCE6F8", textFill: "#198754", accent: "#171717", border: "#101214" },
  { background: "#E7F1FF", textFill: "#8E4CCF", accent: "#171717", border: "#101214" },
];

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

function buildPublicPath(slug: string, hash: string, version?: string) {
  const suffix = version ? `-${version}` : "";
  return `${publicPathPrefix}/${slug}-${hash}${suffix}.png`;
}

function createForcedRegenerationVersion() {
  return `${Date.now().toString(36)}-${randomBytes(3).toString("hex")}`;
}

function hashToIndex(value: string, modulo: number) {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
  }
  return hash % modulo;
}

function normalizeHex(hex: string) {
  const compact = hex.replace("#", "").trim();
  if (compact.length === 3) {
    return compact
      .split("")
      .map((char) => char + char)
      .join("")
      .toLowerCase();
  }

  return compact.toLowerCase();
}

function hexToRgb(hex: string) {
  const normalized = normalizeHex(hex);
  if (!/^[0-9a-f]{6}$/i.test(normalized)) {
    return null;
  }

  return {
    r: parseInt(normalized.slice(0, 2), 16),
    g: parseInt(normalized.slice(2, 4), 16),
    b: parseInt(normalized.slice(4, 6), 16),
  };
}

function srgbToLinear(channel: number) {
  const normalized = channel / 255;
  if (normalized <= 0.04045) {
    return normalized / 12.92;
  }
  return ((normalized + 0.055) / 1.055) ** 2.4;
}

function relativeLuminance(hex: string) {
  const rgb = hexToRgb(hex);
  if (!rgb) {
    return 0;
  }

  return 0.2126 * srgbToLinear(rgb.r) + 0.7152 * srgbToLinear(rgb.g) + 0.0722 * srgbToLinear(rgb.b);
}

function contrastRatio(hexA: string, hexB: string) {
  const a = relativeLuminance(hexA);
  const b = relativeLuminance(hexB);
  const lighter = Math.max(a, b);
  const darker = Math.min(a, b);
  return (lighter + 0.05) / (darker + 0.05);
}

function isThemeReadable(theme: ShareImageTheme) {
  return (
    contrastRatio(theme.textFill, theme.background) >= MIN_TEXT_BG_CONTRAST &&
    contrastRatio(theme.accent, theme.background) >= MIN_ACCENT_BG_CONTRAST
  );
}

function pickTheme(snapshot: ShareImageSnapshot) {
  const key = `${snapshot.slug}:${snapshot.name}:${snapshot.targetLabel}`;
  const start = hashToIndex(key, SHARE_IMAGE_THEMES.length);

  for (let offset = 0; offset < SHARE_IMAGE_THEMES.length; offset += 1) {
    const candidate = SHARE_IMAGE_THEMES[(start + offset) % SHARE_IMAGE_THEMES.length];
    if (isThemeReadable(candidate)) {
      return candidate;
    }
  }

  return SAFE_SHARE_IMAGE_THEME;
}

function toTitleCase(value: string) {
  return value
    .split(/\s+/)
    .map((word) => {
      if (!word) {
        return word;
      }
      return word[0].toUpperCase() + word.slice(1).toLowerCase();
    })
    .join(" ");
}

function normalizeStylePhrase(rawValue: string) {
  const cleaned = rawValue
    .replace(/[_/\-]+/g, " ")
    .replace(/\s+/g, " ")
    .replace(/\btranslator\b/gi, "")
    .replace(/\btool\b/gi, "")
    .replace(/\bgenerator\b/gi, "")
    .replace(/[!?.]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();

  const withoutStyleSuffix = cleaned.replace(/\bstyle\b$/i, "").trim();
  return withoutStyleSuffix || cleaned;
}

function pickStylePhrase(snapshot: ShareImageSnapshot) {
  const candidates = [snapshot.name, snapshot.targetLabel, snapshot.subtitle, snapshot.shortDescription];
  for (const candidate of candidates) {
    const normalized = normalizeStylePhrase(candidate || "");
    if (normalized.length >= 3) {
      return toTitleCase(normalized);
    }
  }

  return "Creative";
}

function wrapWords(text: string, maxCharsPerLine: number, maxLines: number) {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (!words.length) {
    return [];
  }

  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length <= maxCharsPerLine || !current) {
      current = next;
      continue;
    }

    lines.push(current);
    current = word;
  }

  if (current) {
    lines.push(current);
  }

  if (lines.length <= maxLines) {
    return lines;
  }

  const trimmed = lines.slice(0, maxLines);
  const overflow = lines.slice(maxLines - 1).join(" ");
  trimmed[maxLines - 1] = clampText(overflow, maxCharsPerLine + 2);
  return trimmed;
}

function composePosterLines(snapshot: ShareImageSnapshot) {
  const stylePhrase = pickStylePhrase(snapshot);
  const styleLines = wrapWords(stylePhrase, 16, 3);
  return ["Click Here To", "Translate", "Your Text to", ...styleLines, "Style!"];
}

async function fetchFont(url: string) {
  const response = await fetch(url, {
    cache: "force-cache",
    next: { revalidate: 60 * 60 * 24 * 30 },
  });
  if (!response.ok) {
    throw new Error(`Font download failed (${response.status}) for ${url}`);
  }

  return response.arrayBuffer();
}

async function fetchFirstAvailableFont(urls: string[], fontLabel: string) {
  const errors: string[] = [];

  for (const url of urls) {
    try {
      return await fetchFont(url);
    } catch (error) {
      errors.push(`${url}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  throw new Error(`${fontLabel} could not be loaded. Attempts: ${errors.join(" | ")}`);
}

async function getShareImageFonts() {
  if (shareImageFontsPromise) {
    return shareImageFontsPromise;
  }

  shareImageFontsPromise = (async () => {
    try {
      const [antonResult, extraBoldResult, blackResult] = await Promise.allSettled([
        fetchFirstAvailableFont(ANTON_FONT_URLS, "Anton"),
        fetchFirstAvailableFont(MONTSERRAT_EXTRABOLD_FONT_URLS, "Montserrat ExtraBold"),
        fetchFirstAvailableFont(MONTSERRAT_BLACK_FONT_URLS, "Montserrat Black"),
      ]);

      const fonts: ShareImageFont[] = [];

      if (antonResult.status === "fulfilled") {
        fonts.push({
          name: SHARE_IMAGE_HEADLINE_FONT_NAME,
          data: antonResult.value,
          weight: 900,
          style: "normal",
        });
      }

      if (extraBoldResult.status === "fulfilled") {
        fonts.push({
          name: SHARE_IMAGE_SUPPORT_FONT_NAME,
          data: extraBoldResult.value,
          weight: 800,
          style: "normal",
        });
      }

      if (blackResult.status === "fulfilled") {
        fonts.push({
          name: SHARE_IMAGE_SUPPORT_FONT_NAME,
          data: blackResult.value,
          weight: 900,
          style: "normal",
        });
      }

      if (fonts.length === 0) {
        const reasons = [antonResult, extraBoldResult, blackResult]
          .filter((result): result is PromiseRejectedResult => result.status === "rejected")
          .map((result) => (result.reason instanceof Error ? result.reason.message : String(result.reason)))
          .join("; ");
        logWarn("share_image_font_load_failed", "Falling back to default OG font for share image rendering.", {
          error: reasons || "Unknown font download error",
        });
        return [];
      }

      if (fonts.length < 2) {
        logWarn("share_image_font_partial_load", "Loaded partial custom fonts for share image rendering.", {
          loadedWeights: fonts.map((font) => font.weight),
        });
      }

      return fonts;
    } catch (error) {
      logWarn("share_image_font_load_failed", "Falling back to default OG font for share image rendering.", {
        error: error instanceof Error ? error.message : String(error),
      });
      return [];
    }
  })();

  return shareImageFontsPromise;
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
  const posterLines = composePosterLines(snapshot);
  const maxLineLength = Math.max(...posterLines.map((line) => line.length), 0);
  const embeddedFonts = await getShareImageFonts();

  let headlineSize = 138;
  if (posterLines.length >= 7) {
    headlineSize -= 18;
  } else if (posterLines.length === 6) {
    headlineSize -= 10;
  }
  if (maxLineLength > 20) {
    headlineSize -= 16;
  } else if (maxLineLength > 16) {
    headlineSize -= 8;
  }
  headlineSize = Math.max(96, Math.min(144, headlineSize));

  const lineGap = headlineSize >= 126 ? 16 : 14;
  const footerLabel = clampText(`${platformName} • ${snapshot.sourceLabel} to ${snapshot.targetLabel}`, 72);
  const headlineStroke = `-8px 0 0 ${theme.border}, 8px 0 0 ${theme.border}, 0 -8px 0 ${theme.border}, 0 8px 0 ${theme.border}, -8px -8px 0 ${theme.border}, 8px -8px 0 ${theme.border}, -8px 8px 0 ${theme.border}, 8px 8px 0 ${theme.border}, 0 12px 0 rgba(16,18,20,0.24)`;
  const fallbackWeightBoost = `0 0 0 ${theme.textFill}, 1px 0 0 ${theme.textFill}, -1px 0 0 ${theme.textFill}`;

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
          padding: "56px 52px 42px",
          border: `10px solid ${theme.border}`,
          boxSizing: "border-box",
        }}
      >
        <div
          style={{
            flex: "1 1 auto",
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            width: "100%",
            alignItems: "center",
            gap: lineGap,
            textAlign: "center",
            paddingTop: "14px",
            paddingBottom: "28px",
          }}
        >
          {posterLines.map((line, index) => (
            <p
              key={`${index}-${line}`}
              style={{
                margin: 0,
                color: theme.textFill,
                fontSize: headlineSize,
                lineHeight: 1.01,
                fontWeight: index >= 2 ? 900 : 800,
                fontFamily: SHARE_IMAGE_HEADLINE_FONT_FAMILY,
                letterSpacing: -0.9,
                textAlign: "center",
                textShadow: `${headlineStroke}, ${fallbackWeightBoost}`,
              }}
            >
              {line}
            </p>
          ))}
        </div>

        <p
          style={{
            margin: 0,
            color: theme.accent,
            fontSize: 24,
            fontWeight: 800,
            fontFamily: SHARE_IMAGE_SUPPORT_FONT_FAMILY,
            lineHeight: 1.2,
            letterSpacing: 0.4,
            textAlign: "center",
            textTransform: "uppercase",
            opacity: 0.88,
            width: "100%",
          }}
        >
          {footerLabel}
        </p>
      </div>
    ),
    embeddedFonts.length > 0
      ? {
          width: SHARE_IMAGE_WIDTH,
          height: SHARE_IMAGE_HEIGHT,
          fonts: embeddedFonts,
        }
      : {
          width: SHARE_IMAGE_WIDTH,
          height: SHARE_IMAGE_HEIGHT,
        },
  );

  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

async function removeOldShareImageIfNeeded(oldPublicPath: string | null, nextPublicPath: string | null) {
  if (!oldPublicPath || !nextPublicPath || oldPublicPath === nextPublicPath) {
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

export async function getStoredTranslatorShareImageBySlug(slug: string) {
  return prisma.translator.findUnique({
    where: { slug },
    select: {
      id: true,
      shareImagePath: true,
    },
  });
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

async function ensureTranslatorShareImageByIdOnce(
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
  const currentPublicPath = snapshot.shareImagePath;
  const currentStoragePath = currentPublicPath ? toStoragePath(currentPublicPath) : null;

  const hasCurrentAsset =
    snapshot.shareImageHash === hash &&
    Boolean(currentPublicPath) &&
    Boolean(currentStoragePath) &&
    (currentStoragePath ? await fileExists(currentStoragePath) : false);

  if (!options.force && hasCurrentAsset) {
    return {
      translatorId: snapshot.id,
      shareImagePath: currentPublicPath,
      shareImageHash: hash,
      shareImageUpdatedAt: snapshot.shareImageUpdatedAt,
    };
  }

  const nextPublicPath =
    options.force
      ? buildPublicPath(snapshot.slug, hash, createForcedRegenerationVersion())
      : buildPublicPath(snapshot.slug, hash);
  const nextStoragePath = toStoragePath(nextPublicPath);
  const shouldCleanupNewFileOnFailure = Boolean(currentPublicPath && currentPublicPath !== nextPublicPath);
  let wroteNewFile = false;

  try {
    const imageBuffer = await renderShareImageBuffer(snapshot, platformName);
    await mkdir(storageDirectory, { recursive: true });
    await writeFile(nextStoragePath, imageBuffer);
    wroteNewFile = true;

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
    await removeOldShareImageIfNeeded(snapshot.shareImagePath, updated.shareImagePath);

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

    if (wroteNewFile && shouldCleanupNewFileOnFailure) {
      try {
        await rm(nextStoragePath, { force: true });
      } catch {
        // Best-effort rollback only.
      }
    }

    if (options.throwOnError) {
      throw error instanceof Error ? error : new Error(String(error));
    }

    return {
      translatorId: snapshot.id,
      shareImagePath: snapshot.shareImagePath,
      shareImageHash: snapshot.shareImageHash,
      shareImageUpdatedAt: snapshot.shareImageUpdatedAt,
    };
  }
}

export async function ensureTranslatorShareImageById(
  translatorId: string,
  options: EnsureShareImageOptions = {},
) {
  if (options.force) {
    const inFlight = inFlightShareImageGeneration.get(translatorId);
    if (inFlight) {
      await inFlight;
    }
    return ensureTranslatorShareImageByIdOnce(translatorId, options);
  }

  const existing = inFlightShareImageGeneration.get(translatorId);
  if (existing) {
    return existing;
  }

  const task = ensureTranslatorShareImageByIdOnce(translatorId, options).finally(() => {
    inFlightShareImageGeneration.delete(translatorId);
  });
  inFlightShareImageGeneration.set(translatorId, task);

  return task;
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
