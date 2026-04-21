import type { MetadataRoute } from "next";

import { getAppBaseUrl } from "@/lib/env";

export default function robots(): MetadataRoute.Robots {
  const baseUrl = getAppBaseUrl();

  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/translators", "/translators/*"],
        disallow: ["/admin", "/admin/*", "/login", "/api/admin/*"],
      },
    ],
    sitemap: [`${baseUrl.toString().replace(/\/$/, "")}/sitemap.xml`],
  };
}

