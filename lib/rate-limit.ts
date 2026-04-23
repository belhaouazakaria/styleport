import { RATE_LIMIT_MAX_REQUESTS, RATE_LIMIT_WINDOW_MS } from "@/lib/constants";

interface RateRecord {
  count: number;
  resetAt: number;
}

interface RateLimitOptions {
  maxRequests?: number;
  windowMs?: number;
}

const globalStore = globalThis as typeof globalThis & {
  __regalRateLimitStore?: Map<string, RateRecord>;
  __regalRateLimitLastPruneAt?: number;
};

const store = globalStore.__regalRateLimitStore ?? new Map<string, RateRecord>();
let lastPruneAt = globalStore.__regalRateLimitLastPruneAt ?? 0;
const RATE_LIMIT_STORE_PRUNE_INTERVAL_MS = RATE_LIMIT_WINDOW_MS;
const RATE_LIMIT_STORE_MAX_ENTRIES = 10_000;

globalStore.__regalRateLimitStore = store;

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
}

function pruneRateLimitStore(now: number) {
  if (now - lastPruneAt < RATE_LIMIT_STORE_PRUNE_INTERVAL_MS && store.size < RATE_LIMIT_STORE_MAX_ENTRIES) {
    return;
  }

  for (const [key, record] of store.entries()) {
    if (record.resetAt <= now) {
      store.delete(key);
    }
  }

  if (store.size > RATE_LIMIT_STORE_MAX_ENTRIES) {
    const overflow = store.size - RATE_LIMIT_STORE_MAX_ENTRIES;
    const oldestEntries = Array.from(store.entries())
      .sort((a, b) => a[1].resetAt - b[1].resetAt)
      .slice(0, overflow);

    for (const [key] of oldestEntries) {
      store.delete(key);
    }
  }

  lastPruneAt = now;
  globalStore.__regalRateLimitLastPruneAt = lastPruneAt;
}

export function checkRateLimit(identifier: string, options?: RateLimitOptions): RateLimitResult {
  const now = Date.now();
  pruneRateLimitStore(now);

  const maxRequests = Math.max(1, options?.maxRequests ?? RATE_LIMIT_MAX_REQUESTS);
  const windowMs = Math.max(1_000, options?.windowMs ?? RATE_LIMIT_WINDOW_MS);
  const key = `${identifier || "anonymous"}:${maxRequests}:${windowMs}`;
  const current = store.get(key);

  if (!current || current.resetAt < now) {
    const resetAt = now + windowMs;
    store.set(key, { count: 1, resetAt });

    return {
      allowed: true,
      remaining: Math.max(0, maxRequests - 1),
      resetAt,
    };
  }

  if (current.count >= maxRequests) {
    return {
      allowed: false,
      remaining: 0,
      resetAt: current.resetAt,
    };
  }

  current.count += 1;
  store.set(key, current);

  return {
    allowed: true,
    remaining: Math.max(0, maxRequests - current.count),
    resetAt: current.resetAt,
  };
}
