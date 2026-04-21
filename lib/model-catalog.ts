import OpenAI from "openai";

import { DEFAULT_MODEL, MODEL_LIST_FALLBACK } from "@/lib/constants";
import { getServerEnv } from "@/lib/env";

const CACHE_TTL_MS = 5 * 60_000;

let cache: {
  expiresAt: number;
  models: string[];
} | null = null;

function getClient() {
  const env = getServerEnv();
  const apiKey = env.OPENAI_API_KEY;
  if (!apiKey) {
    return null;
  }

  return new OpenAI({ apiKey });
}

function normalizeModelList(models: string[]) {
  return [...new Set(models)].sort((a, b) => a.localeCompare(b));
}

export async function getAvailableModels(forceRefresh = false): Promise<string[]> {
  const now = Date.now();

  if (!forceRefresh && cache && cache.expiresAt > now) {
    return cache.models;
  }

  const client = getClient();
  if (!client) {
    const fallback = normalizeModelList([DEFAULT_MODEL, ...MODEL_LIST_FALLBACK]);
    cache = { models: fallback, expiresAt: now + CACHE_TTL_MS };
    return fallback;
  }

  try {
    const response = await client.models.list();
    const modelIds = response.data
      .map((item) => item.id)
      .filter((id) => id.startsWith("gpt-"));

    const list = normalizeModelList([DEFAULT_MODEL, ...MODEL_LIST_FALLBACK, ...modelIds]);
    cache = { models: list, expiresAt: now + CACHE_TTL_MS };
    return list;
  } catch {
    const fallback = normalizeModelList([DEFAULT_MODEL, ...MODEL_LIST_FALLBACK]);
    cache = { models: fallback, expiresAt: now + CACHE_TTL_MS };
    return fallback;
  }
}
