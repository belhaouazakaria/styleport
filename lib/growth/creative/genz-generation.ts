import { loadUprightFont } from "./genz-font";
import { layoutGenZHeadline, compositeGenZEditorial } from "./genz-renderer";
import { buildGenZHeadline, type GenZIdentity, type GenZTypography, genzTypographySchema } from "./genz-editorial";
import type { CreativeAiImageProvider } from "./ai-image-provider";

export async function generateGenZEditorial(identity: GenZIdentity, provider: CreativeAiImageProvider, typography: Partial<GenZTypography> = {}, expectedFontChecksum?: string) {
  // Asset, permission, glyph support and fit are checked BEFORE paid dispatch.
  const font = await loadUprightFont();
  if (expectedFontChecksum && font.checksum !== expectedFontChecksum) throw Error("UPRIGHT_FONT_CHANGED_AFTER_QUEUEING");
  const config = genzTypographySchema.parse(typography);
  const headline = buildGenZHeadline(identity.name);
  layoutGenZHeadline(headline, font, config);
  const generated = await provider.generate({
    mode: "GENZ_BACKGROUND", visualIdentity: identity,
    topic: identity.name, direction: "EDITORIAL_SPLIT", publicationRole: "SAYTWIST",
    brandName: "", headline: "", beforeLabel: "", beforeText: "", afterLabel: "", afterText: "", cta: "", domain: "",
  });
  const rendered = await compositeGenZEditorial(generated.bytes, headline, font, config);
  return { ...rendered, metadata: generated.metadata };
}
