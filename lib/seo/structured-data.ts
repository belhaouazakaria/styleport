export type JsonLd = Record<string, unknown>;

export function serializeJsonLd(data: JsonLd | JsonLd[]) {
  // Escape characters that could terminate the script element or break parsing.
  return JSON.stringify(data)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(new RegExp("\\u2028", "g"), "\\u2028")
    .replace(new RegExp("\\u2029", "g"), "\\u2029");
}

export function buildTranslatorJsonLd(input: {
  baseUrl: string;
  platformName: string;
  name: string;
  slug: string;
  description: string;
  categoryName?: string | null;
}): JsonLd[] {
  const base = input.baseUrl.replace(/\/$/, "");
  const url = `${base}/translators/${input.slug}`;
  return [
    {
      "@context": "https://schema.org",
      "@type": "WebApplication",
      name: input.name,
      url,
      description: input.description,
      applicationCategory: "UtilitiesApplication",
      operatingSystem: "Any (web browser)",
      browserRequirements: "Requires JavaScript",
      inLanguage: "en",
      isAccessibleForFree: true,
      offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
      publisher: { "@type": "Organization", name: input.platformName, url: `${base}/` },
    },
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Home", item: `${base}/` },
        { "@type": "ListItem", position: 2, name: "Translators", item: `${base}/translators` },
        { "@type": "ListItem", position: 3, name: input.name, item: url },
      ],
    },
  ];
}

export function buildWebsiteJsonLd(input: { baseUrl: string; platformName: string }): JsonLd[] {
  const base = input.baseUrl.replace(/\/$/, "");
  return [
    { "@context": "https://schema.org", "@type": "WebSite", name: input.platformName, url: `${base}/` },
    { "@context": "https://schema.org", "@type": "Organization", name: input.platformName, url: `${base}/` },
  ];
}
