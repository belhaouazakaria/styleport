import type { MetadataRoute } from "next";

import { getAppBaseUrl } from "@/lib/env";

export default function sitemap(): MetadataRoute.Sitemap {
  const base = getAppBaseUrl().toString().replace(/\/$/, "");
  const now = new Date();

  return [
    {
      url: `${base}/`,
      changeFrequency: "daily",
      priority: 1,
      lastModified: now,
    },
    {
      url: `${base}/translators`,
      changeFrequency: "daily",
      priority: 0.9,
      lastModified: now,
    },
  ];
}

