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
    {
      url: `${base}/contact`,
      changeFrequency: "monthly",
      priority: 0.7,
      lastModified: now,
    },
    {
      url: `${base}/privacy`,
      changeFrequency: "yearly",
      priority: 0.4,
      lastModified: now,
    },
    {
      url: `${base}/terms`,
      changeFrequency: "yearly",
      priority: 0.4,
      lastModified: now,
    },
    {
      url: `${base}/disclaimer`,
      changeFrequency: "yearly",
      priority: 0.3,
      lastModified: now,
    },
    {
      url: `${base}/cookies`,
      changeFrequency: "yearly",
      priority: 0.3,
      lastModified: now,
    },
  ];
}
