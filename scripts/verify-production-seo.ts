const baseUrl = new URL(process.env.SEO_VERIFY_BASE_URL || "https://saytwist.com");
const expectedOrigin = baseUrl.origin;
const environment = process.env.SEO_VERIFY_ENVIRONMENT?.trim()
  || (baseUrl.hostname === "saytwist.com" ? "production" : "custom");
const deployedVersion = process.env.SEO_VERIFY_DEPLOYED_VERSION?.trim();

interface VerificationFailure {
  kind: "DNS_RESOLUTION_FAILURE" | "HTTP_FAILURE" | "NETWORK_FAILURE" | "SEO_SIGNAL_FAILURE";
  check: string;
  hostname: string;
  url: string;
  message: string;
  status?: number;
  code?: string;
}

function match(html: string, pattern: RegExp) {
  return html.match(pattern)?.[1]?.trim() || null;
}

function errorCode(error: unknown) {
  let current = error;
  while (current && typeof current === "object") {
    if ("code" in current && typeof current.code === "string") return current.code;
    current = "cause" in current ? current.cause : null;
  }
  return undefined;
}

function requestFailure(error: unknown, url: URL, check: string): VerificationFailure {
  const code = errorCode(error);
  const isDns = code === "ENOTFOUND" || code === "EAI_AGAIN";
  return {
    kind: isDns ? "DNS_RESOLUTION_FAILURE" : "NETWORK_FAILURE",
    check,
    hostname: url.hostname,
    url: url.toString(),
    message: isDns
      ? `DNS resolution failed for ${url.hostname}`
      : error instanceof Error ? error.message : "Network request failed",
    ...(code ? { code } : {}),
  };
}

async function fetchText(pathOrUrl: string) {
  const url = new URL(pathOrUrl, baseUrl);
  const response = await fetch(url, {
    redirect: "follow",
    headers: { "User-Agent": "SayTwist-SEO-ReadOnly-Check/2.0" },
  });
  return { response, text: await response.text(), url };
}

function httpFailure(url: URL, status: number, check: string): VerificationFailure {
  return {
    kind: "HTTP_FAILURE",
    check,
    hostname: url.hostname,
    url: url.toString(),
    status,
    message: `${check} returned HTTP ${status}`,
  };
}

function signalFailure(url: URL, check: string, message: string): VerificationFailure {
  return {
    kind: "SEO_SIGNAL_FAILURE",
    check,
    hostname: url.hostname,
    url: url.toString(),
    message,
  };
}

async function main() {
  if (!deployedVersion) {
    console.error(JSON.stringify({
      readOnly: true,
      environment,
      baseUrl: expectedOrigin,
      error: "SEO_VERIFY_DEPLOYED_VERSION is required. Supply the actual deployed release SHA or immutable deployment identifier; do not use the local branch SHA unless it is deployed.",
    }, null, 2));
    process.exitCode = 2;
    return;
  }

  const failures: VerificationFailure[] = [];
  let robotsResult: Awaited<ReturnType<typeof fetchText>>;
  let sitemapResult: Awaited<ReturnType<typeof fetchText>>;
  try {
    [robotsResult, sitemapResult] = await Promise.all([
      fetchText("/robots.txt"),
      fetchText("/sitemap.xml"),
    ]);
  } catch (error) {
    failures.push(requestFailure(error, baseUrl, "robots-or-sitemap-request"));
    console.log(JSON.stringify({
      generatedAt: new Date().toISOString(),
      readOnly: true,
      environment,
      deployedVersion,
      checkedOrigin: expectedOrigin,
      evidenceScope: "Live HTTP responses only; this does not prove that the local feature branch is deployed.",
      failures,
    }, null, 2));
    process.exitCode = 1;
    return;
  }

  if (robotsResult.response.status !== 200) failures.push(httpFailure(robotsResult.url, robotsResult.response.status, "robots-status"));
  if (!robotsResult.text.includes(`${expectedOrigin}/sitemap.xml`)) failures.push(signalFailure(robotsResult.url, "robots-sitemap-reference", "robots.txt does not reference the canonical sitemap"));
  if (robotsResult.text.split(/\r?\n/).some((line) => line.trim() === "Disallow: /")) failures.push(signalFailure(robotsResult.url, "robots-global-disallow", "robots.txt blocks the entire public site"));
  if (sitemapResult.response.status !== 200) failures.push(httpFailure(sitemapResult.url, sitemapResult.response.status, "sitemap-status"));
  if (!/<urlset[\s>]/i.test(sitemapResult.text)) failures.push(signalFailure(sitemapResult.url, "sitemap-format", "sitemap.xml is not a URL set"));

  const urls = [...sitemapResult.text.matchAll(/<loc>([^<]+)<\/loc>/gi)].map((entry) => entry[1].trim());
  const uniqueUrls = [...new Set(urls)];
  if (urls.length !== uniqueUrls.length) failures.push(signalFailure(sitemapResult.url, "sitemap-duplicates", `sitemap contains ${urls.length - uniqueUrls.length} duplicate URL(s)`));

  const sitemapChecks = [];
  for (const url of uniqueUrls) {
    const parsed = new URL(url);
    if (parsed.origin !== expectedOrigin) failures.push(signalFailure(parsed, "sitemap-origin", `Expected origin ${expectedOrigin}`));
    if (parsed.search) failures.push(signalFailure(parsed, "sitemap-query", "Query parameters are not allowed in the sitemap"));
    try {
      const { response, text } = await fetchText(url);
      const canonical = match(text, /<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i)
        || match(text, /<link[^>]+href=["']([^"']+)["'][^>]+rel=["']canonical["']/i);
      const robots = match(text, /<meta[^>]+name=["']robots["'][^>]+content=["']([^"']+)["']/i)?.toLowerCase() || "";
      const check = { url, status: response.status, finalUrl: response.url, canonical, noindex: robots.includes("noindex") };
      sitemapChecks.push(check);
      if (response.status !== 200) failures.push(httpFailure(parsed, response.status, "sitemap-url-status"));
      if (check.noindex) failures.push(signalFailure(parsed, "sitemap-url-noindex", "Sitemap URL emits noindex"));
      if (!canonical || new URL(canonical, baseUrl).toString() !== url) failures.push(signalFailure(parsed, "sitemap-url-canonical", `Canonical mismatch: ${canonical || "missing"}`));
    } catch (error) {
      failures.push(requestFailure(error, parsed, "sitemap-url-request"));
    }
  }

  const missingUrl = new URL("/translators/__saytwist-seo-missing__", baseUrl);
  let missingUrlStatus: number | null = null;
  try {
    const missing = await fetchText(missingUrl.toString());
    missingUrlStatus = missing.response.status;
    if (missing.response.status !== 404) failures.push(httpFailure(missingUrl, missing.response.status, "missing-translator-404"));
  } catch (error) {
    failures.push(requestFailure(error, missingUrl, "missing-translator-request"));
  }

  const redirects: Array<{ source: string; hostname: string; status: number | null; location: string | null }> = [];
  if (baseUrl.hostname === "saytwist.com") {
    for (const source of ["https://www.saytwist.com/", "https://translator.whattypeof.com/seo-redirect-check", "https://translators.whattypeof.com/seo-redirect-check"]) {
      const sourceUrl = new URL(source);
      try {
        const response = await fetch(sourceUrl, { redirect: "manual" });
        const location = response.headers.get("location");
        redirects.push({ source, hostname: sourceUrl.hostname, status: response.status, location });
        if (![301, 308].includes(response.status)) failures.push(httpFailure(sourceUrl, response.status, "permanent-redirect"));
        if (!location || new URL(location, sourceUrl).origin !== expectedOrigin) failures.push(signalFailure(sourceUrl, "redirect-destination", `Does not redirect to ${expectedOrigin}`));
      } catch (error) {
        redirects.push({ source, hostname: sourceUrl.hostname, status: null, location: null });
        failures.push(requestFailure(error, sourceUrl, "redirect-request"));
      }
    }
  }

  console.log(JSON.stringify({
    generatedAt: new Date().toISOString(),
    readOnly: true,
    environment,
    deployedVersion,
    checkedOrigin: expectedOrigin,
    evidenceScope: "Live HTTP responses from the operator-identified deployed version; this does not prove that the local feature branch is deployed.",
    robotsStatus: robotsResult.response.status,
    sitemapStatus: sitemapResult.response.status,
    sitemapUrlCount: uniqueUrls.length,
    missingUrlStatus,
    redirects,
    sitemapChecks,
    failures,
  }, null, 2));
  if (failures.length) process.exitCode = 1;
}

main().catch((error) => {
  console.error(JSON.stringify({
    readOnly: true,
    environment,
    deployedVersion: deployedVersion || null,
    checkedOrigin: expectedOrigin,
    error: error instanceof Error ? error.message : "Unknown verification failure",
  }, null, 2));
  process.exitCode = 1;
});
