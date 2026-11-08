import { describe, expect, it } from "vitest";
import { assertAutoTranslatorPublishRuntime, strictPublicTranslatorSeo } from "@/workers/growth-auto-translator-publish";
import type { TranslatorSnapshot } from "@/lib/growth/translator/snapshot";

const sha = "a".repeat(40);
const identity = { username: "saytwist", uid: 1001,
  cwd: "/home/saytwist/htdocs/saytwist.com",
  node: "/home/saytwist/.nvm/versions/node/v24.20.0/bin/node",
};
const env = {
  NODE_ENV: "production", EXPECTED_RELEASE: sha,
  GROWTH_TRANSLATOR_PUBLISH_ENABLED: "true",
  GROWTH_TRANSLATOR_PUBLISH_APPROVAL:
    "SAYTWIST_AUTONOMOUS_TRANSLATOR_PUBLICATION:" + sha,
  GROWTH_TRANSLATOR_PUBLISH_DAY: "2026-11-08",
  APP_BASE_URL: "https://saytwist.com",
  DATABASE_URL: "postgresql://app:pass@127.0.0.1:5433/saytwist",
  GROWTH_ROLLOUT_MODE: "OFF",
  GROWTH_WORKER_RUN_ENABLED: "false",
};
const complete = {
  slug: "regal-rewrite",
  seoTitle: "Regal Rewrite Translator | Formal English Style",
  seoDescription: "Transform everyday English into regal, elegant formal phrasing with clear examples and natural sentence structure for your messages.",
  primaryCategoryId: "cat1",
  categories: [{ id: "cat1" }],
  editorial: {
    about: "Use regal wording for events and invitations, keeping meaning and detail accurate and sounding suitably elegant.",
    whatItDoes: "The tool rewrites everyday messages into appropriately formal and regal English without changing their meaning, date, or context.",
    examples: [{}, {}],
    faq: [{}, {}],
  },
} as unknown as TranslatorSnapshot;

describe("strict website-only autonomous Translator publication", () => {
  it("requires exact approved release, private DB, identity, UTC schedule and disabled other automation", () => {
    const now = new Date("2026-11-08T06:57:30Z");
    expect(assertAutoTranslatorPublishRuntime(env, sha, identity, now))
      .toEqual({ sha, day: "2026-11-08" });
    for (const patch of [
      { GROWTH_TRANSLATOR_PUBLISH_ENABLED: "false" },
      { GROWTH_TRANSLATOR_PUBLISH_APPROVAL: "BAD" },
      { GROWTH_TRANSLATOR_PUBLISH_DAY: "2026-11-07" },
      { GROWTH_WORKER_RUN_ENABLED: "true" },
      { GROWTH_AI_IMAGE_ENABLED: "true" },
      { TELEGRAM_REPORTS_ENABLED: "true" },
      { GROWTH_ATTRIBUTION_COLLECTION_ENABLED: "true" },
      { GROWTH_ROLLOUT_MODE: "PREPARE" },
      { DATABASE_URL: "postgresql://u:p@localhost:5433/saytwist" },
    ]) {
      expect(() => assertAutoTranslatorPublishRuntime(
        { ...env, ...patch }, sha, identity, now,
      )).toThrow();
    }
    expect(() => assertAutoTranslatorPublishRuntime(
      env, "b".repeat(40), identity, now,
    )).toThrow();
    expect(() => assertAutoTranslatorPublishRuntime(
      env, sha, { ...identity, uid: 0 }, now,
    )).toThrow();
    expect(() => assertAutoTranslatorPublishRuntime(
      env, sha, identity, new Date("2026-11-08T06:59:00Z"),
    )).toThrow();
  });
  it("requires useful SEO and robust editorial examples before public visibility", () => {
    expect(strictPublicTranslatorSeo(complete)).toBe(true);
    expect(strictPublicTranslatorSeo({
      ...complete, seoDescription: null,
    })).toBe(false);
    expect(strictPublicTranslatorSeo({
      ...complete, slug: "not/valid",
    })).toBe(false);
    expect(strictPublicTranslatorSeo({
      ...complete, editorial: { ...complete.editorial, faq: [] },
    })).toBe(false);
    expect(strictPublicTranslatorSeo({
      ...complete, primaryCategoryId: "unknown",
    })).toBe(false);
  });
});
