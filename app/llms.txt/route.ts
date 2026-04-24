import { getAppBaseUrl } from "@/lib/env";

export async function GET() {
  const base = getAppBaseUrl().toString().replace(/\/$/, "");
  const content = [
    "What Type Of | Translator",
    "",
    "What Type Of | Translator is an AI-powered text translator directory where people transform writing into different tones and styles.",
    "",
    "Public sections:",
    `- Home: ${base}/`,
    `- Translator discovery: ${base}/translators`,
    `- Contact: ${base}/contact`,
    `- Privacy: ${base}/privacy`,
    `- Terms: ${base}/terms`,
    `- Disclaimer: ${base}/disclaimer`,
    `- Cookies: ${base}/cookies`,
    "",
    "Crawler/index references:",
    `- Sitemap: ${base}/sitemap.xml`,
    `- Robots: ${base}/robots.txt`,
    "",
    "Do not crawl private/admin or API routes.",
  ].join("\n");

  return new Response(content, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
    },
  });
}
