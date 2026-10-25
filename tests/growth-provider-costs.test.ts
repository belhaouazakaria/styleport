import { describe, expect, it, vi } from "vitest";
import {
  GrowthProviderCostsError,
  readOpenAiGrowthProjectCosts,
} from "@/lib/growth/economics/provider-costs";

const projectId = "proj_growth_test";
const config = {
  adminApiKey: "sk-admin-TestTokenNotReal123456",
  projectId,
  startDateUtc: "2026-10-23",
  endDateUtcExclusive: "2026-10-25",
};

function costBucket(date: string, value: number, overrides: Record<string, unknown> = {}) {
  const start = Date.parse(date + "T00:00:00.000Z") / 1000;
  return {
    object: "bucket",
    start_time: start,
    end_time: start + 86_400,
    results: [{
      object: "organization.costs.result",
      project_id: projectId,
      line_item: "Model usage",
      amount: { currency: "usd", value },
    }],
    ...overrides,
  };
}
function page(data: unknown[], has_more = false, next_page: string | null = null) {
  return { object: "page", data, has_more, next_page };
}
function fakeFetch(...pages: unknown[]) {
  const queue = [...pages];
  return vi.fn(async () => new Response(JSON.stringify(queue.shift()), {
    status: 200, headers: { "Content-Type": "application/json" },
  })) as unknown as typeof fetch;
}
async function rejectsWith(data: unknown, code: string) {
  const fetcher = fakeFetch(data);
  await expect(readOpenAiGrowthProjectCosts({ ...config, fetcher }))
    .rejects.toMatchObject({ name: "GrowthProviderCostsError", code });
}

describe("Read-only OpenAI project cost snapshot", () => {
  it("collects complete paginated daily project totals without exposing a per-request actual", async () => {
    const fetcher = fakeFetch(
      page([costBucket("2026-10-23", 0.014)], true, "next_page_1"),
      page([costBucket("2026-10-24", 0.06)]),
    );
    const result = await readOpenAiGrowthProjectCosts({ ...config, fetcher });
    expect(result).toMatchObject({
      source: "OPENAI_ORGANIZATION_COSTS",
      attribution: "PROJECT_AGGREGATE_ONLY",
      currency: "USD",
      totalMicroUsd: "74000",
      pagesRead: 2,
      perRequestActualsVerified: false,
      days: [
        { dateUtc: "2026-10-23", totalMicroUsd: "14000" },
        { dateUtc: "2026-10-24", totalMicroUsd: "60000" },
      ],
    });
    expect(fetcher).toHaveBeenCalledTimes(2);
    const [url, init] = (fetcher as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
    const parsed = new URL(url);
    expect(parsed.origin + parsed.pathname).toBe("https://api.openai.com/v1/organization/costs");
    expect(parsed.searchParams.getAll("group_by[]")).toEqual(["project_id", "line_item"]);
    expect(parsed.searchParams.getAll("project_ids[]")).toEqual([projectId]);
    expect(parsed.searchParams.get("start_time")).toBe(String(Date.parse("2026-10-23T00:00:00Z") / 1000));
    expect(init.method).toBe("GET");
    expect(init.redirect).toBe("error");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer " + config.adminApiKey);
    expect(JSON.stringify(result)).not.toContain("TestToken");
  });

  it("treats an explicit empty day as zero without mistaking a missing day for zero", async () => {
    const fetcher = fakeFetch(page([
      costBucket("2026-10-23", 0, { results: [] }),
      costBucket("2026-10-24", 0.02),
    ]));
    const snapshot = await readOpenAiGrowthProjectCosts({ ...config, fetcher });
    expect(snapshot.days[0].totalMicroUsd).toBe("0");
    expect(snapshot.totalMicroUsd).toBe("20000");
    await rejectsWith(page([costBucket("2026-10-23", 0.02)]), "INCOMPLETE_COST_WINDOW");
  });

  it("rejects a wrong project, wrong currency and unverifiable financial precision", async () => {
    const valid = costBucket("2026-10-23", 0.01);
    const second = costBucket("2026-10-24", 0.02);
    await rejectsWith(page([{
      ...valid, results: [{ ...(valid.results as Record<string, unknown>[])[0], project_id: "proj_other" }],
    }, second]), "COST_SCOPE_OR_CURRENCY_MISMATCH");
    await rejectsWith(page([{
      ...valid, results: [{ ...(valid.results as Record<string, unknown>[])[0],
        amount: { currency: "eur", value: 0.01 } }],
    }, second]), "COST_SCOPE_OR_CURRENCY_MISMATCH");
    await rejectsWith(page([costBucket("2026-10-23", -1), second]), "UNSUPPORTED_AMOUNT");
    await rejectsWith(page([costBucket("2026-10-23", 0.0000001), second]), "UNSUPPORTED_PRECISION");
  });

  it("rejects duplicate, malformed and incomplete pagination rather than undercounting", async () => {
    await rejectsWith(page([
      costBucket("2026-10-23", 0.01), costBucket("2026-10-23", 0.01),
    ]), "DUPLICATE_COST_BUCKET");
    await rejectsWith(page([costBucket("2026-10-23", 0.01)], true),
      "INVALID_PAGINATION");
    const fetcher = fakeFetch(
      page([costBucket("2026-10-23", 0.01)], true, "repeat"),
      page([costBucket("2026-10-24", 0.02)], true, "repeat"),
    );
    await expect(readOpenAiGrowthProjectCosts({ ...config, fetcher }))
      .rejects.toMatchObject({ code: "INVALID_PAGINATION" });
  });

  it("never calls the provider on unscoped or invalid credentials, dates, or windows", async () => {
    const fetcher = fakeFetch();
    for (const input of [
      { ...config, adminApiKey: "" },
      { ...config, projectId: "anything" },
      { ...config, startDateUtc: "2026-02-30" },
      { ...config, endDateUtcExclusive: "2026-10-23" },
      { ...config, endDateUtcExclusive: "2026-12-01" },
    ]) {
      await expect(readOpenAiGrowthProjectCosts({ ...input, fetcher }))
        .rejects.toBeInstanceOf(GrowthProviderCostsError);
    }
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("sanitizes the error on an HTTP failure without leaking the admin token", async () => {
    const fetcher = vi.fn(async () => new Response("private provider error", { status: 403 })) as unknown as typeof fetch;
    await expect(readOpenAiGrowthProjectCosts({ ...config, fetcher }))
      .rejects.toMatchObject({
        name: "GrowthProviderCostsError",
        message: "Growth provider costs: READ_ONLY_FETCH_FAILED",
      });
  });
});
