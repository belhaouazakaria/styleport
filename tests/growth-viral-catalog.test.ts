import { describe, expect, it, vi } from "vitest";
import {
  canonicalSourceTranslatorUrl, discoverAnythingTranslateTopics,
  parseAnythingTranslateCatalog, permittedByRobots,
} from "@/lib/growth/viral/catalog";

const sample = '<h2><a href="/translators/poetic-english-translator/">Poetic English Translator</a></h2>' +
  '<h2><a href="https://anythingtranslate.com/translators/royal-english-translator/">' +
  'Royal English Translator</a></h2>' +
  '<a href="https://bad.example/translators/evil-translator/">Not trusted</a>' +
  '<a href="/translators/poetic-english-translator/">Poetic English Translator</a>' +
  '<a href="/translators/../../../admin">Bad path</a>';

describe("AnythingTranslate read-only concept discovery", () => {
  it("accepts only fixed source paths and title+URL metadata, never assets or descriptions", () => {
    expect(parseAnythingTranslateCatalog(sample)).toEqual([
      { title: "Poetic English Translator",
        sourceUrl: "https://anythingtranslate.com/translators/poetic-english-translator/",
        source: "ANYTHING_TRANSLATE" },
      { title: "Royal English Translator",
        sourceUrl: "https://anythingtranslate.com/translators/royal-english-translator/",
        source: "ANYTHING_TRANSLATE" },
    ]);
    for (const bad of [
      "https://anythingtranslate.com.evil.test/translators/great/",
      "https://evil.test/x",
      "http://anythingtranslate.com/translators/foo/",
      "https://anythingtranslate.com/translators/foo/?utm=a",
      "https://anythingtranslate.com/translators/foo/#f",
      "https://anythingtranslate.com@evil.test/translators/foo/",
      "https://anythingtranslate.com/robots.txt",
    ]) expect(canonicalSourceTranslatorUrl(bad)).toBeNull();
    expect(() => parseAnythingTranslateCatalog("A".repeat(1024 * 1024 + 1))).toThrow();
  });

  it("respects deny, specific allow, custom-agent precedence and default allow", () => {
    expect(permittedByRobots("User-agent: *\nDisallow: /translators/\n",
      "/translators/")).toBe(false);
    expect(permittedByRobots("User-agent: *\nDisallow: /translators/\nAllow: /translators/public/\n",
      "/translators/public/")).toBe(true);
    expect(permittedByRobots("User-agent: *\nDisallow: /\n\nUser-agent: SayTwistResearchBot\nAllow: /translators/\n",
      "/translators/")).toBe(true);
    expect(permittedByRobots("User-agent: *\nAllow: /\n", "/translators/")).toBe(true);
    expect(permittedByRobots("User-agent: SayTwistResearchBot\nDisallow: /\nUser-agent: *\nAllow: /\n",
      "/translators/")).toBe(false);
    expect(permittedByRobots("User-agent: *\nDisallow: /*\n",
      "/translators/")).toBe(false);
  });

  it("never makes a request before explicit owner/day authorization", async () => {
    const fetcher = vi.fn();
    await expect(discoverAnythingTranslateTopics({
      ownerEnabled: false, dueToday: true, fetchImpl: fetcher,
    })).rejects.toThrow("OWNER_OR_RATE_GATE");
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("fetches robots before the fixed catalog and never follows redirects", async () => {
    const urls: string[] = [];
    const fake = vi.fn(async (input: string | URL | Request) => {
      urls.push(String(input));
      if (String(input).endsWith("/robots.txt")) {
        return new Response("User-agent: *\nAllow: /", {
          status: 200, headers: { "content-type": "text/plain" },
        });
      }
      return new Response(sample, {
        status: 200, headers: { "content-type": "text/html" },
      });
    }) as unknown as typeof fetch;
    const result = await discoverAnythingTranslateTopics({
      ownerEnabled: true, dueToday: true, fetchImpl: fake,
    });
    expect(result).toHaveLength(2);
    expect(urls).toEqual([
      "https://anythingtranslate.com/robots.txt",
      "https://anythingtranslate.com/translators/",
    ]);
    const redirect: typeof fetch = async () => new Response(null, {
      status: 302, headers: { location: "https://other.test/" },
    });
    await expect(discoverAnythingTranslateTopics({
      ownerEnabled: true, dueToday: true, fetchImpl: redirect,
    })).rejects.toThrow("REDIRECT_REFUSED");
  });

  it("blocks the catalog when robots denies access", async () => {
    let requests = 0;
    const fake: typeof fetch = async () => {
      requests++;
      return new Response("User-agent: *\nDisallow: /translators/\n", {
        status: 200, headers: { "content-type": "text/plain" },
      });
    };
    await expect(discoverAnythingTranslateTopics({
      ownerEnabled: true, dueToday: true, fetchImpl: fake,
    })).rejects.toThrow("ROBOTS_DISALLOW");
    expect(requests).toBe(1);
  });
});
