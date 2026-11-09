import { z } from "zod";

export const ANYTHING_TRANSLATE_BASE = "https://anythingtranslate.com";
export const ANYTHING_TRANSLATE_CATALOG = ANYTHING_TRANSLATE_BASE + "/translators/";

export type CatalogTopic = {
  sourceUrl: string;
  title: string;
  source: "ANYTHING_TRANSLATE";
};

const topicSchema = z.object({
  sourceUrl: z.url().max(512), title: z.string().trim().min(5).max(100),
  source: z.literal("ANYTHING_TRANSLATE"),
}).strict();

export function canonicalSourceTranslatorUrl(raw: string): string | null {
  try {
    const url = new URL(raw, ANYTHING_TRANSLATE_CATALOG);
    if (url.protocol !== "https:" || url.hostname !== "anythingtranslate.com" ||
        url.username || url.password || url.search || url.hash || url.port ||
        !/^\/translators\/[a-z0-9]+(?:-[a-z0-9]+)*\/?$/.test(url.pathname)) {
      return null;
    }
    return url.origin + url.pathname.replace(/\/?$/, "/");
  } catch { return null; }
}

function plainText(markup: string): string {
  return markup.replace(/<[^>]*>/g, " ")
    .replace(/&amp;/gi, "&").replace(/&#39;|&apos;/gi, "'")
    .replace(/&quot;/gi, '"').replace(/&nbsp;/gi, " ")
    .replace(/\s+/g, " ").trim();
}

/** Discover URLs/titles only, never copy third-party descriptions or images. */
export function parseAnythingTranslateCatalog(html: string, max = 100): CatalogTopic[] {
  if (html.length > 1024 * 1024 || !Number.isSafeInteger(max) || max < 1 || max > 100) {
    throw Error("VIRAL_CATALOG_BOUNDS");
  }
  const results: CatalogTopic[] = [];
  const seen = new Set<string>();
  const links = /<a\b([^>]{0,1024})>([\s\S]{0,1000}?)<\/a\s*>/gi;
  let match: RegExpExecArray | null;
  while ((match = links.exec(html)) !== null) {
    const href = /\bhref\s*=\s*["']([^"']{1,512})["']/i.exec(match[1])?.[1];
    if (!href) continue;
    const canonical = canonicalSourceTranslatorUrl(href.replace(/&amp;/gi, "&"));
    if (!canonical || seen.has(canonical)) continue;
    const title = plainText(match[2]);
    const checked = topicSchema.safeParse({
      sourceUrl: canonical, title, source: "ANYTHING_TRANSLATE",
    });
    if (!checked.success) continue;
    seen.add(canonical);
    results.push(checked.data);
    if (results.length >= max) break;
  }
  return results;
}

type RobotDirective = { agent: string; allow: boolean; path: string };
export function permittedByRobots(raw: string, path: string, userAgent = "SayTwistResearchBot"): boolean {
  if (raw.length > 256000 || !path.startsWith("/") || !userAgent) return false;
  const lines = raw.split(/\r?\n/);
  const directives: RobotDirective[] = [];
  let agents: string[] = [];
  let directivesSeen = false;
  for (const original of lines) {
    const line = original.split("#")[0].trim();
    if (!line) continue;
    const match = /^([a-z-]+)\s*:\s*(.*)$/i.exec(line);
    if (!match) continue;
    const key = match[1].toLowerCase(), value = match[2].trim();
    if (key === "user-agent") {
      if (directivesSeen) { agents = []; directivesSeen = false; }
      agents.push(value.toLowerCase());
    } else if (key === "allow" || key === "disallow") {
      directivesSeen = true;
      if (value) for (const agent of agents) directives.push({
        agent, allow: key === "allow", path: value,
      });
    }
  }
  const agent = userAgent.toLowerCase();
  const selected = directives.some(d => d.agent === agent) ? agent : "*";
  let winner: RobotDirective | undefined;
  for (const directive of directives) {
    if (directive.agent !== selected) continue;
    // Fail closed on advanced wildcard/anchor syntax until an independently
    // qualified parser is available. Never silently ignore a Disallow rule.
    if (/[*$]/.test(directive.path)) return false;
    if (!path.startsWith(directive.path)) continue;
    if (!winner || directive.path.length > winner.path.length ||
        directive.path.length === winner.path.length && directive.allow) winner = directive;
  }
  return winner?.allow ?? true;
}

async function checkedResponse(
  url: string, maxBytes: number, contentType: string,
  fetchImpl: typeof fetch, signal: AbortSignal,
): Promise<{ status: number; text: string }> {
  const response = await fetchImpl(url, {
    method: "GET", redirect: "manual", signal,
    headers: { "user-agent": "SayTwistResearchBot/1.0 (+https://saytwist.com)" },
  });
  if (response.status >= 300 && response.status < 400) throw Error("VIRAL_CATALOG_REDIRECT_REFUSED");
  if (response.status !== 404 && !response.ok) throw Error("VIRAL_CATALOG_FETCH_FAILED");
  if (response.status === 404) return { status: 404, text: "" };
  if (!(response.headers.get("content-type") || "").toLowerCase().includes(contentType)) {
    throw Error("VIRAL_CATALOG_CONTENT_TYPE_INVALID");
  }
  const reader = response.body?.getReader();
  if (!reader) throw Error("VIRAL_CATALOG_EMPTY");
  let bytes = 0, output = "";
  const decoder = new TextDecoder();
  try {
    while (true) {
      const item = await reader.read();
      if (item.done) break;
      bytes += item.value.byteLength;
      if (bytes > maxBytes) throw Error("VIRAL_CATALOG_TOO_LARGE");
      output += decoder.decode(item.value, { stream: true });
    }
  } finally { reader.releaseLock(); }
  return { status: response.status, text: output + decoder.decode() };
}

/** One fixed, read-only public catalog request only after robots permission.
 * No arbitrary URLs, redirects, search-engine scraping or page crawl.
 * Must be independently owner-enabled and daily-budgeted by the caller.
 */
export async function discoverAnythingTranslateTopics(args: {
  ownerEnabled: boolean; dueToday: boolean; fetchImpl?: typeof fetch;
}): Promise<CatalogTopic[]> {
  if (!args.ownerEnabled || !args.dueToday) throw Error("VIRAL_CATALOG_OWNER_OR_RATE_GATE");
  const fetchImpl = args.fetchImpl ?? fetch;
  const abort = new AbortController();
  const deadline = setTimeout(() => abort.abort(), 12000);
  try {
    const robots = await checkedResponse(ANYTHING_TRANSLATE_BASE + "/robots.txt",
      256000, "text/plain", fetchImpl, abort.signal);
    if (robots.status !== 404 &&
        !permittedByRobots(robots.text, "/translators/")) {
      throw Error("VIRAL_CATALOG_ROBOTS_DISALLOW");
    }
    const listing = await checkedResponse(ANYTHING_TRANSLATE_CATALOG,
      1024 * 1024, "text/html", fetchImpl, abort.signal);
    if (listing.status !== 200) throw Error("VIRAL_CATALOG_NOT_FOUND");
    return parseAnythingTranslateCatalog(listing.text);
  } finally { clearTimeout(deadline); }
}
