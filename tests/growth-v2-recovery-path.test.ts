// @vitest-environment node
import { expect, it } from "vitest";
import {
  resolveCreativeAssetFile,
  resolveCreativeAssetPublicPath,
} from "@/lib/growth/creative/storage";
it("resolves an exact managed public path and rejects URL/path manipulation", () => {
  const filename = "creative-" + "a".repeat(64) + ".png",
    publicPath = "/generated/growth-creatives/" + filename;
  expect(resolveCreativeAssetPublicPath(publicPath)).toBe(
    resolveCreativeAssetFile(filename),
  );
  for (const path of [
    filename,
    "https://saytwist.com" + publicPath,
    publicPath + "?x=1",
    publicPath + "/../" + filename,
    publicPath.replace("creative-", "../creative-"),
    publicPath.replace("creative-", "%2e%2e/creative-"),
  ])
    expect(resolveCreativeAssetPublicPath(path)).toBeNull();
});
