import { PinterestOneGetBudget } from "@/lib/growth/pinterest/one-get-budget";

/**
 * A single exact GET /v5/boards?page_size=100 for one owner-authorized,
 * already-queued board-sync job. No OAuth refresh, pagination, Pin writes,
 * other accounts, redirects or second network requests.
 * The normal global 4/hour and 16/day Pinterest budget remains independent.
 */
export function oneBoardSyncFetch(jobId: string, fetchImpl: typeof fetch = fetch): typeof fetch {
  if (!/^[A-Za-z0-9_-]{1,191}$/.test(jobId) ||
      process.env.GROWTH_PINTEREST_BOARD_SYNC_ENTRYPOINT !== "true" ||
      process.env.GROWTH_PINTEREST_BOARD_SYNC_JOB_ID !== jobId) {
    throw new Error("PINTEREST_BOARD_SYNC_SCOPE_INVALID");
  }
  const budget = new PinterestOneGetBudget();
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : "";
    if (url !== "https://api.pinterest.com/v5/boards?page_size=100" ||
        (init?.method !== undefined && init.method !== "GET")) {
      throw new Error("PINTEREST_BOARD_SYNC_ENDPOINT_FORBIDDEN");
    }
    budget.claim();
    // Never reuse caller signals, redirects, POST data or custom targets.
    const response = await fetchImpl(url, {
      ...init, method: "GET", redirect: "error", signal: AbortSignal.timeout(10_000),
    });
    budget.observe(response.status);
    return response;
  }) as typeof fetch;
}
