/**
 * Read-only OpenAI organization Costs API snapshot.
 *
 * Provider Costs are bucketed by project/day/line item, not Growth request IDs.
 * Never use these aggregate figures to settle an individual reservation or
 * free a hard-cap slot. No secrets, response bodies, or API URLs in errors.
 * This module is intentionally NOT called by an application request or worker.
 */
const ENDPOINT = "https://api.openai.com/v1/organization/costs";
const MAX_DAYS = 31;
const MAX_PAGES = 16;
const MAX_RESPONSE_CHARS = 200_000;
const MICRO_USD = BigInt(1_000_000);

export class GrowthProviderCostsError extends Error {
  constructor(readonly code: string) {
    super("Growth provider costs: " + code);
    this.name = "GrowthProviderCostsError";
  }
}

type RecordValue = Record<string, unknown>;
function isRecord(value: unknown): value is RecordValue {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
function invalid(code: string): never {
  throw new GrowthProviderCostsError(code);
}
function utcDay(date: string): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return invalid("INVALID_UTC_RANGE");
  const millis = Date.parse(date + "T00:00:00.000Z");
  if (!Number.isFinite(millis) || new Date(millis).toISOString().slice(0, 10) !== date)
    return invalid("INVALID_UTC_RANGE");
  return millis / 1000;
}
function exactMicroUsd(value: unknown): bigint {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 1_000_000)
    return invalid("UNSUPPORTED_AMOUNT");
  // Never silently round or use floating-point sums for a financial snapshot.
  // Sub-micro-USD or exponential API values require a revised price precision policy.
  const decimal = String(value);
  if (!/^\d+(?:\.\d{1,6})?$/.test(decimal)) return invalid("UNSUPPORTED_PRECISION");
  const [whole, fraction = ""] = decimal.split(".");
  return BigInt(whole) * MICRO_USD + BigInt(fraction.padEnd(6, "0"));
}

export type GrowthProjectCostsDay = {
  dateUtc: string;
  totalMicroUsd: string;
  lineItems: { lineItem: string | null; microUsd: string }[];
};

export type GrowthProjectCostsSnapshot = {
  source: "OPENAI_ORGANIZATION_COSTS";
  attribution: "PROJECT_AGGREGATE_ONLY";
  projectId: string;
  startDateUtc: string;
  endDateUtcExclusive: string;
  currency: "USD";
  totalMicroUsd: string;
  days: GrowthProjectCostsDay[];
  pagesRead: number;
  // Not an invoice, not per-request attribution, not a budget release.
  perRequestActualsVerified: false;
};

export async function readOpenAiGrowthProjectCosts(input: {
  adminApiKey: string;
  projectId: string;
  startDateUtc: string;
  endDateUtcExclusive: string;
  fetcher?: typeof fetch;
}): Promise<GrowthProjectCostsSnapshot> {
  if (!/^sk-[A-Za-z0-9_-]{10,}$/.test(input.adminApiKey) ||
      !/^proj_[A-Za-z0-9_-]{3,128}$/.test(input.projectId))
    return invalid("INVALID_PRIVATE_CONFIGURATION");
  const start = utcDay(input.startDateUtc);
  const end = utcDay(input.endDateUtcExclusive);
  const days = (end - start) / 86_400;
  if (!Number.isSafeInteger(days) || days < 1 || days > MAX_DAYS)
    return invalid("INVALID_UTC_RANGE");

  const fetchedDays = new Map<number, GrowthProjectCostsDay>();
  const cursors = new Set<string>();
  let cursor: string | null = null;
  let pagesRead = 0;
  const fetcher = input.fetcher ?? fetch;

  while (pagesRead < MAX_PAGES) {
    const query = new URLSearchParams();
    query.set("start_time", String(start));
    query.set("end_time", String(end));
    query.set("bucket_width", "1d");
    query.set("limit", String(days));
    query.append("project_ids[]", input.projectId);
    query.append("group_by[]", "project_id");
    query.append("group_by[]", "line_item");
    if (cursor) query.set("page", cursor);

    let response: Response;
    try {
      response = await fetcher(ENDPOINT + "?" + query.toString(), {
        method: "GET",
        headers: { Authorization: "Bearer " + input.adminApiKey },
        redirect: "error",
        cache: "no-store",
        signal: AbortSignal.timeout(12_000),
      });
    } catch {
      return invalid("READ_ONLY_FETCH_FAILED");
    }
    if (!response.ok) return invalid("READ_ONLY_FETCH_FAILED");
    let page: unknown;
    try {
      const body = await response.text();
      if (body.length > MAX_RESPONSE_CHARS) return invalid("RESPONSE_TOO_LARGE");
      page = JSON.parse(body);
    } catch {
      return invalid("INVALID_PROVIDER_RESPONSE");
    }
    if (!isRecord(page) || page.object !== "page" || !Array.isArray(page.data) ||
        typeof page.has_more !== "boolean" || page.data.length > MAX_DAYS)
      return invalid("INVALID_PROVIDER_RESPONSE");

    for (const bucket of page.data) {
      if (!isRecord(bucket) || bucket.object !== "bucket" ||
          !Number.isSafeInteger(bucket.start_time) || !Number.isSafeInteger(bucket.end_time) ||
          typeof bucket.start_time !== "number" || typeof bucket.end_time !== "number" ||
          bucket.start_time < start || bucket.end_time > end ||
          bucket.end_time - bucket.start_time !== 86_400 ||
          (bucket.start_time - start) % 86_400 !== 0 ||
          !Array.isArray(bucket.results) || bucket.results.length > 200)
        return invalid("INVALID_COST_BUCKET");
      if (fetchedDays.has(bucket.start_time)) return invalid("DUPLICATE_COST_BUCKET");

      const lineItems: GrowthProjectCostsDay["lineItems"] = [];
      const seen = new Set<string>();
      let dayTotal = BigInt(0);
      for (const item of bucket.results) {
        if (!isRecord(item) || item.object !== "organization.costs.result" ||
            item.project_id !== input.projectId ||
            (item.line_item !== null &&
             (typeof item.line_item !== "string" || !item.line_item.trim() ||
              item.line_item.length > 160)) ||
            !isRecord(item.amount) || item.amount.currency !== "usd")
          return invalid("COST_SCOPE_OR_CURRENCY_MISMATCH");
        const itemName = item.line_item as string | null;
        const itemKey = itemName ?? "";
        if (seen.has(itemKey)) return invalid("DUPLICATE_COST_LINE_ITEM");
        seen.add(itemKey);
        const cost = exactMicroUsd(item.amount.value);
        dayTotal += cost;
        lineItems.push({ lineItem: itemName, microUsd: cost.toString() });
      }
      fetchedDays.set(bucket.start_time, {
        dateUtc: new Date(bucket.start_time * 1000).toISOString().slice(0, 10),
        totalMicroUsd: dayTotal.toString(),
        lineItems: lineItems.sort((a, b) => (a.lineItem ?? "").localeCompare(b.lineItem ?? "")),
      });
    }
    pagesRead++;
    if (page.has_more === false) {
      if (page.next_page != null) return invalid("INCONSISTENT_PAGINATION");
      break;
    }
    if (typeof page.next_page !== "string" ||
        !/^[A-Za-z0-9_.=-]{1,256}$/.test(page.next_page) ||
        cursors.has(page.next_page))
      return invalid("INVALID_PAGINATION");
    cursors.add(page.next_page);
    cursor = page.next_page;
  }
  if (pagesRead >= MAX_PAGES && cursor) return invalid("PAGINATION_LIMIT");
  // An absent day is NOT a confirmed $0 day. Require explicit empty results.
  if (fetchedDays.size !== days) return invalid("INCOMPLETE_COST_WINDOW");
  const ordered: GrowthProjectCostsDay[] = [];
  let total = BigInt(0);
  for (let timestamp = start; timestamp < end; timestamp += 86_400) {
    const day = fetchedDays.get(timestamp);
    if (!day) return invalid("INCOMPLETE_COST_WINDOW");
    ordered.push(day);
    total += BigInt(day.totalMicroUsd);
  }
  return {
    source: "OPENAI_ORGANIZATION_COSTS",
    attribution: "PROJECT_AGGREGATE_ONLY",
    projectId: input.projectId,
    startDateUtc: input.startDateUtc,
    endDateUtcExclusive: input.endDateUtcExclusive,
    currency: "USD",
    totalMicroUsd: total.toString(),
    days: ordered,
    pagesRead,
    perRequestActualsVerified: false,
  };
}
