import type { MetadataRoute } from "next";

import { getIndexableIdeaSlugsForSitemap } from "@/lib/data/ideas";
import { getIndexableTranslatorSlugsForSitemap } from "@/lib/data/translators";
import { getAppBaseUrl } from "@/lib/env";

const STATIC_INDEXABLE_ROUTES = [
  "/",
  "/about",
  "/contact",
  "/privacy",
  "/terms",
  "/disclaimer",
  "/cookies",
  "/ideas",
] as const;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = getAppBaseUrl().toString().replace(/\/$/, "");
  const now = new Date();

  let translators: Awaited<ReturnType<typeof getIndexableTranslatorSlugsForSitemap>> = [];
  let ideas: Awaited<ReturnType<typeof getIndexableIdeaSlugsForSitemap>> = [];

  const [translatorResult, ideaResult] = await Promise.allSettled([
    getIndexableTranslatorSlugsForSitemap(),
    getIndexableIdeaSlugsForSitemap(),
  ]);

  if (translatorResult.status === "fulfilled") {
    translators = translatorResult.value;
  } else {
    console.error(
      "[sitemap] Failed to load translator entries. Continuing without translator entries.",
      translatorResult.reason,
    );
  }

  if (ideaResult.status === "fulfilled") {
    ideas = ideaResult.value;
  } else {
    console.error(
      "[sitemap] Failed to load Idea entries. Continuing without Idea entries.",
      ideaResult.reason,
    );
  }

  const staticEntries: MetadataRoute.Sitemap = STATIC_INDEXABLE_ROUTES.map((path) => ({
    url: `${base}${path}`,
    changeFrequency: path === "/" ? "daily" : "monthly",
    priority: path === "/" ? 1 : 0.6,
    lastModified: now,
  }));

  const translatorEntries: MetadataRoute.Sitemap = translators.map((translator) => ({
    url: `${base}/translators/${translator.slug}`,
    changeFrequency: "weekly",
    priority: 0.8,
    lastModified: translator.updatedAt,
  }));

  const ideaEntries: MetadataRoute.Sitemap = ideas.map((idea) => ({
    url: `${base}/ideas/${idea.slug}`,
    changeFrequency: "monthly",
    priority: 0.7,
    lastModified: idea.updatedAt,
  }));

  return [...staticEntries, ...translatorEntries, ...ideaEntries];
}
