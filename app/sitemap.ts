import type { MetadataRoute } from "next";

import { getIndexableTranslatorSlugsForSitemap } from "@/lib/data/translators";
import { getAppBaseUrl } from "@/lib/env";

const STATIC_INDEXABLE_ROUTES = [
  "/",
  "/translators",
  "/contact",
  "/privacy",
  "/terms",
  "/disclaimer",
  "/cookies",
] as const;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = getAppBaseUrl().toString().replace(/\/$/, "");
  const now = new Date();
  const translators = await getIndexableTranslatorSlugsForSitemap();

  const staticEntries: MetadataRoute.Sitemap = STATIC_INDEXABLE_ROUTES.map((path) => ({
    url: `${base}${path}`,
    changeFrequency: path === "/" || path === "/translators" ? "daily" : "monthly",
    priority: path === "/" ? 1 : path === "/translators" ? 0.9 : 0.6,
    lastModified: now,
  }));

  const translatorEntries: MetadataRoute.Sitemap = translators.map((translator) => ({
    url: `${base}/translators/${translator.slug}`,
    changeFrequency: "weekly",
    priority: 0.8,
    lastModified: translator.updatedAt,
  }));

  return [...staticEntries, ...translatorEntries];
}
