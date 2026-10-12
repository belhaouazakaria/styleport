const baseUrl = new URL(process.env.SEO_VERIFY_BASE_URL || "https://saytwist.com");
const expectedOrigin = baseUrl.origin;

function match(html: string, pattern: RegExp) {
  return html.match(pattern)?.[1]?.trim() || null;
}

async function fetchText(pathOrUrl: string) {
  const url = new URL(pathOrUrl, baseUrl);
  const response = await fetch(url, { redirect: "follow", headers: { "User-Agent": "SayTwist-SEO-ReadOnly-Check/1.0" } });
  return { response, text: await response.text(), url };
}

async function main() {
  const [robotsResult, sitemapResult] = await Promise.all([
    fetchText("/robots.txt"),
    fetchText("/sitemap.xml"),
  ]);
  const errors: string[] = [];
  if (robotsResult.response.status !== 200) errors.push(`robots.txt returned ${robotsResult.response.status}`);
  if (!robotsResult.text.includes(`${expectedOrigin}/sitemap.xml`)) errors.push("robots.txt does not reference the canonical sitemap");
  if (robotsResult.text.split(/\r?\n/).some((line) => line.trim() === "Disallow: /")) errors.push("robots.txt blocks the entire public site");
  if (sitemapResult.response.status !== 200) errors.push(`sitemap.xml returned ${sitemapResult.response.status}`);
  if (!/<urlset[\s>]/i.test(sitemapResult.text)) errors.push("sitemap.xml is not a URL set");

  const urls = [...sitemapResult.text.matchAll(/<loc>([^<]+)<\/loc>/gi)].map((entry) => entry[1].trim());
  const uniqueUrls = [...new Set(urls)];
  if (urls.length !== uniqueUrls.length) errors.push(`sitemap contains ${urls.length - uniqueUrls.length} duplicate URL(s)`);

  const checks = [];
  for (const url of uniqueUrls) {
    const parsed = new URL(url);
    if (parsed.origin !== expectedOrigin) errors.push(`${url}: unexpected origin`);
    if (parsed.search) errors.push(`${url}: query parameters are not allowed in the sitemap`);
    const { response, text } = await fetchText(url);
    const canonical = match(text, /<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i)
      || match(text, /<link[^>]+href=["']([^"']+)["'][^>]+rel=["']canonical["']/i);
    const robots = match(text, /<meta[^>]+name=["']robots["'][^>]+content=["']([^"']+)["']/i)?.toLowerCase() || "";
    const item = { url, status: response.status, finalUrl: response.url, canonical, noindex: robots.includes("noindex") };
    checks.push(item);
    if (response.status !== 200) errors.push(`${url}: returned ${response.status}`);
    if (item.noindex) errors.push(`${url}: sitemap URL emits noindex`);
    if (!canonical || new URL(canonical, baseUrl).toString() !== url) errors.push(`${url}: canonical mismatch (${canonical || "missing"})`);
  }

  const missing = await fetchText("/translators/__saytwist-seo-missing__");
  if (missing.response.status !== 404) errors.push(`missing translator returned ${missing.response.status} instead of 404`);

  const redirects: Array<{ source: string; status: number | null; location: string | null; error?: string }> = [];
  if (baseUrl.hostname === "saytwist.com") {
    for (const source of ["https://www.saytwist.com/", "https://translator.whattypeof.com/seo-redirect-check", "https://translators.whattypeof.com/seo-redirect-check"]) {
      try {
        const response = await fetch(source, { redirect: "manual" });
        const location = response.headers.get("location");
        redirects.push({ source, status: response.status, location });
        if (![301, 308].includes(response.status)) errors.push(`${source}: expected a permanent redirect, received ${response.status}`);
        if (!location || new URL(location, source).origin !== expectedOrigin) errors.push(`${source}: does not redirect to ${expectedOrigin}`);
      } catch (error) {
        const message = error instanceof Error ? error.message : "request failed";
        redirects.push({ source, status: null, location: null, error: message });
        errors.push(`${source}: ${message}`);
      }
    }
  }

  const report = {
    generatedAt: new Date().toISOString(),
    readOnly: true,
    baseUrl: expectedOrigin,
    robotsStatus: robotsResult.response.status,
    sitemapStatus: sitemapResult.response.status,
    sitemapUrlCount: uniqueUrls.length,
    missingUrlStatus: missing.response.status,
    redirects,
    ...(process.env.SEO_VERIFY_VERBOSE === "true" ? { checks } : {}),
    errors,
  };
  console.log(JSON.stringify(report, null, 2));
  if (errors.length) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
