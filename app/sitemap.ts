import type { MetadataRoute } from "next";

import { getIndexableTranslatorSlugsForSitemap } from "@/lib/data/translators";
import { getIndexableIdeaSlugsForSitemap } from "@/lib/data/ideas";
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
  const [translators, ideas] = await Promise.all([
    getIndexableTranslatorSlugsForSitemap(),
    getIndexableIdeaSlugsForSitemap(),
  ]);

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
