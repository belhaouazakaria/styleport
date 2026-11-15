import { mainPinDesignDefault } from "@/lib/growth/creative/genz-editorial";
import { generateGenZEditorial } from "@/lib/growth/creative/genz-generation";
import type { CreativePublicationRole } from "@/lib/growth/creative/account-direction";
import { OpenAICreativeImageProvider } from "@/lib/growth/creative/ai-image-provider";
import sharp from "sharp";
import {
  creativeAssetChecksum,
  persistCreativeAssetFile,
  releaseCreativeAssetLease,
  validateCreativePng,
} from "@/lib/growth/creative/storage";
import { canonicalSourceTranslatorUrl } from "@/lib/growth/viral/catalog";

function xml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&apos;",
      })[character] || character,
  );
}

export type SourceCreativeCopy = {
  topic: string;
  title: string;
  description: string;
  headline: string;
  subline: string;
  footerDomain: "saytwist.com";
};

export function originalSourceCreativeCopy(
  rawTitle: string,
  sourceUrl: string,
): SourceCreativeCopy {
  if (!canonicalSourceTranslatorUrl(sourceUrl))
    throw Error("SOURCE_CREATIVE_URL_INVALID");
  const title = rawTitle
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!/^[A-Za-z0-9 &,'-]{8,80}$/.test(title) || !/\btranslator\b/i.test(title))
    throw Error("SOURCE_CREATIVE_TOPIC_INVALID");
  const topic = title.replace(/\banything\s*translate\b/gi, "").replace(/\s+/g, " ").trim();
  const label = topic.replace(/\s*translator$/i, "").trim();
  if (!label) throw Error("SOURCE_CREATIVE_TOPIC_INVALID");
  const headline = "Explore " + label + " wording";
  const subline = "Explore a different way to express the same message.";
  const description =
    "Discover " +
    label +
    " wording with SayTwist. Explore a different way to express the same message.";
  return {
    topic,
    title: ("Explore " + label + " Wording | SayTwist").slice(0, 100),
    description: description.slice(0, 500),
    headline,
    subline,
    footerDomain: "saytwist.com",
  };
}

export async function renderOriginalSourcePin(
  raw: SourceCreativeCopy,
): Promise<Buffer> {
  if (
    raw.footerDomain !== "saytwist.com" ||
    raw.title.length > 100 ||
    raw.description.length > 500 ||
    raw.headline.length > 150 ||
    raw.subline.length > 150
  ) {
    throw Error("SOURCE_CREATIVE_COPY_INVALID");
  }
  const headline =
    raw.headline
      .match(/.{1,29}(?:\s|$)|.{1,29}/g)
      ?.map((x) => x.trim())
      .filter(Boolean)
      .slice(0, 5) ?? [];
  if (!headline.length) throw Error("SOURCE_CREATIVE_HEADLINE_EMPTY");
  const lines = headline
    .map(
      (line, index) =>
        '<text x="94" y="' +
        (490 + index * 88) +
        '" fill="#F8FAFC" font-family="Arial, sans-serif" font-size="66" font-weight="800">' +
        xml(line) +
        "</text>",
    )
    .join("");
  const subline = xml(raw.subline);
  const svg =
    '<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="1500" viewBox="0 0 1000 1500">' +
    '<rect width="1000" height="1500" fill="#111827"/>' +
    '<circle cx="850" cy="260" r="300" fill="#2DD4BF" opacity=".18"/>' +
    '<circle cx="115" cy="1200" r="300" fill="#FCA5A5" opacity=".12"/>' +
    '<path d="M90 275h820M90 1200h820" stroke="#6EE7B7" stroke-width="4"/>' +
    '<text x="95" y="185" fill="#99F6E4" font-family="Arial, sans-serif" font-size="28" letter-spacing="4" font-weight="700">LANGUAGE STYLE SPOTLIGHT</text>' +
    '<text x="94" y="355" fill="#99F6E4" font-family="Arial, sans-serif" font-size="23" letter-spacing="2">SAME MESSAGE, A DIFFERENT FEELING</text>' +
    lines +
    '<text x="94" y="1000" fill="#E5E7EB" font-family="Arial, sans-serif" font-size="31">' +
    subline +
    "</text>" +
    '<rect x="90" y="1245" width="820" height="125" rx="30" fill="#5EEAD4"/>' +
    '<text x="500" y="1322" fill="#0F172A" text-anchor="middle" font-family="Arial, sans-serif" font-size="36" font-weight="800">Discover with SayTwist</text>' +
    '<text x="94" y="1445" fill="#94A3B8" font-family="Arial, sans-serif" font-size="21">saytwist.com · Original illustration</text>' +
    "</svg>";
  const bytes = await sharp(Buffer.from(svg)).png().toBuffer();
  validateCreativePng(bytes);
  return bytes;
}

/** Store through the established immutable, checksum-addressed Growth asset path. */
export async function createOriginalSourceAsset(
  topic: string,
  sourceUrl: string,
  attemptId: string,
  publicationRole?: CreativePublicationRole,
) {
  if (process.env.GROWTH_AI_IMAGE_ENABLED !== "true")
    throw Error("SOURCE_AI_DESIGN_REQUIRED");
  const copy = originalSourceCreativeCopy(topic, sourceUrl);
  if (publicationRole === "SAYTWIST" && mainPinDesignDefault() === "genz_editorial") {
    const rendered = await generateGenZEditorial({ name: copy.topic, description: copy.description, purpose: "A SayTwist language-style discovery. Depict the translator's identity without inventing a transformation example." }, new OpenAICreativeImageProvider(attemptId), {}, undefined, true);
    const stored = await persistCreativeAssetFile(rendered.png);
    let webp: Awaited<ReturnType<typeof persistCreativeAssetFile>> | null = null;
    try {
      webp = await persistCreativeAssetFile(rendered.webp, "webp");
      return { ...copy, ...stored, designStyle: "genz_editorial", fontChecksum: rendered.fontChecksum, webpPublicPath: webp.publicPath };
    } finally {
      await releaseCreativeAssetLease(stored.leasePath);
      if (webp) await releaseCreativeAssetLease(webp.leasePath);
    }
  }
  const generated = await new OpenAICreativeImageProvider(attemptId).generate({
    mode: "TOPIC_SPOTLIGHT",
    topic: copy.topic,
    publicationRole,
    direction: "COLLAGE",
    brandName: "SayTwist",
    headline: copy.headline,
    beforeLabel: "",
    beforeText: copy.subline,
    afterLabel: "",
    afterText: "",
    cta: "Explore this language style",
    domain: copy.footerDomain,
  });
  const bytes = generated.bytes;
  validateCreativePng(bytes);
  const stored = await persistCreativeAssetFile(bytes);
  if (stored.checksum !== creativeAssetChecksum(bytes))
    throw Error("SOURCE_ASSET_CHECKSUM_INVALID");
  await releaseCreativeAssetLease(stored.leasePath);
  return { ...copy, ...stored, designStyle: "legacy", fontChecksum: null, webpPublicPath: null };
}
