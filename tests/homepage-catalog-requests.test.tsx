import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  discovery: vi.fn(),
  newest: vi.fn(),
  categories: vi.fn(),
  featured: vi.fn(),
  ads: vi.fn(),
  settings: vi.fn(),
}));

vi.mock("@/lib/data/translators", () => ({
  getDiscoveryResult: mocks.discovery,
  getNewestPublicTranslatorsPage: mocks.newest,
  getPublicCategories: mocks.categories,
  getFeaturedPublicTranslators: mocks.featured,
}));

vi.mock("@/lib/data/ads", () => ({
  getRenderableAdPlacements: mocks.ads,
}));

vi.mock("@/lib/settings", () => ({
  getAppSettings: mocks.settings,
}));

import HomePage from "@/app/(public)/page";

describe("homepage catalog request routing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.settings.mockResolvedValue({
      discoveryPageSize: 12,
      featuredTranslatorsEnabled: true,
      platformName: "SayTwist",
    });
    mocks.categories.mockResolvedValue([{ id: "cat1", name: "Writing", slug: "writing" }]);
    mocks.newest.mockResolvedValue({
      translators: [],
      total: 42,
      page: 1,
      pageSize: 12,
      totalPages: 4,
    });
    mocks.discovery.mockResolvedValue({
      translators: [],
      total: 4,
      page: 1,
      pageSize: 12,
      totalPages: 1,
      categories: [],
    });
    mocks.featured.mockResolvedValue([]);
    mocks.ads.mockResolvedValue([]);
  });

  it("loads just cached categories + newest list for unfiltered homepage", async () => {
    await HomePage({ searchParams: Promise.resolve({}) });

    expect(mocks.categories).toHaveBeenCalledOnce();
    expect(mocks.newest).toHaveBeenCalledWith({ page: 1, pageSize: 12 });
    expect(mocks.discovery).not.toHaveBeenCalled();
    expect(mocks.featured).toHaveBeenCalledWith(6);
    expect(mocks.ads).toHaveBeenCalledTimes(2);
  });

  it("keeps newest catalog pagination without the redundant discovery query", async () => {
    await HomePage({ searchParams: Promise.resolve({ page: "2" }) });

    expect(mocks.categories).toHaveBeenCalledOnce();
    expect(mocks.newest).toHaveBeenCalledWith({ page: 2, pageSize: 12 });
    expect(mocks.discovery).not.toHaveBeenCalled();
  });

  it("preserves full discovery behavior for search and categories", async () => {
    await HomePage({
      searchParams: Promise.resolve({ q: "funny", category: "wordplay", page: "2" }),
    });

    expect(mocks.discovery).toHaveBeenCalledWith({
      q: "funny",
      category: "wordplay",
      page: 2,
      pageSize: 12,
    });
    expect(mocks.newest).not.toHaveBeenCalled();
    expect(mocks.categories).not.toHaveBeenCalled();
  });
});
