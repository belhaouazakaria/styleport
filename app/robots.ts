import type { MetadataRoute } from "next";

import { getAppBaseUrl } from "@/lib/env";

export default function robots(): MetadataRoute.Robots {
  const base = getAppBaseUrl().toString().replace(/\/$/, "");

  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/admin", "/admin/*", "/api", "/api/*", "/login", "/create-translator/verify"],
      },
    ],
    sitemap: [`${base}/sitemap.xml`],
  };
}
