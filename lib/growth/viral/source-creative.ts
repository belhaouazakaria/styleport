import sharp from "sharp";
import {
  creativeAssetChecksum, persistCreativeAssetFile,
  releaseCreativeAssetLease, validateCreativePng,
} from "@/lib/growth/creative/storage";
import { canonicalSourceTranslatorUrl } from "@/lib/growth/viral/catalog";

function xml(value: string): string {
  return value.replace(/[&<>"']/g, character =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;",
      "'": "&apos;" })[character] || character);
}

export type SourceCreativeCopy = {
  title: string;
  description: string;
  headline: string;
  subline: string;
  footerDomain: "anythingtranslate.com";
};

export function originalSourceCreativeCopy(
  rawTitle: string, sourceUrl: string,
): SourceCreativeCopy {
  if (!canonicalSourceTranslatorUrl(sourceUrl)) throw Error("SOURCE_CREATIVE_URL_INVALID");
  const title = rawTitle.replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ").trim();
  if (!/^[A-Za-z0-9 &,'-]{8,80}$/.test(title) ||
      !/\btranslator\b/i.test(title)) throw Error("SOURCE_CREATIVE_TOPIC_INVALID");
  const label = title.replace(/\s+translator$/i, "").trim();
  const headline = "What if your words sounded " + label + "?";
  const subline = "Explore a different way to express the same message.";
  const description = "Curious about " + label +
    " wording? Explore this translation style at AnythingTranslate. " +
    "Independent topic spotlight.";
  return {
    title: ("Explore " + label + " Wording").slice(0, 100),
    description: description.slice(0, 500),
    headline, subline, footerDomain: "anythingtranslate.com",
  };
}

export async function renderOriginalSourcePin(raw: SourceCreativeCopy): Promise<Buffer> {
  if (raw.footerDomain !== "anythingtranslate.com" ||
      raw.title.length > 100 || raw.description.length > 500 ||
      raw.headline.length > 150 || raw.subline.length > 150) {
    throw Error("SOURCE_CREATIVE_COPY_INVALID");
  }
  const headline = raw.headline.match(/.{1,29}(?:\s|$)|.{1,29}/g)?.map(x => x.trim()).filter(Boolean).slice(0, 5) ?? [];
  if (!headline.length) throw Error("SOURCE_CREATIVE_HEADLINE_EMPTY");
  const lines = headline.map((line, index) =>
    '<text x="94" y="' + (490 + index * 88) +
    '" fill="#F8FAFC" font-family="Arial, sans-serif" font-size="66" font-weight="800">' +
    xml(line) + '</text>').join("");
  const subline = xml(raw.subline);
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="1500" viewBox="0 0 1000 1500">' +
    '<rect width="1000" height="1500" fill="#111827"/>' +
    '<circle cx="850" cy="260" r="300" fill="#2DD4BF" opacity=".18"/>' +
    '<circle cx="115" cy="1200" r="300" fill="#FCA5A5" opacity=".12"/>' +
    '<path d="M90 275h820M90 1200h820" stroke="#6EE7B7" stroke-width="4"/>' +
    '<text x="95" y="185" fill="#99F6E4" font-family="Arial, sans-serif" font-size="28" letter-spacing="4" font-weight="700">LANGUAGE STYLE SPOTLIGHT</text>' +
    '<text x="94" y="355" fill="#99F6E4" font-family="Arial, sans-serif" font-size="23" letter-spacing="2">SAME MESSAGE, A DIFFERENT FEELING</text>' +
    lines +
    '<text x="94" y="1000" fill="#E5E7EB" font-family="Arial, sans-serif" font-size="31">' + subline + '</text>' +
    '<rect x="90" y="1245" width="820" height="125" rx="30" fill="#5EEAD4"/>' +
    '<text x="500" y="1322" fill="#0F172A" text-anchor="middle" font-family="Arial, sans-serif" font-size="36" font-weight="800">Explore at anythingtranslate.com</text>' +
    '<text x="94" y="1445" fill="#94A3B8" font-family="Arial, sans-serif" font-size="21">Independent editorial spotlight · Original illustration</text>' +
    '</svg>';
  const bytes = await sharp(Buffer.from(svg)).png().toBuffer();
  validateCreativePng(bytes);
  return bytes;
}

/** Store through the established immutable, checksum-addressed Growth asset path. */
export async function createOriginalSourceAsset(topic: string, sourceUrl: string) {
  const copy = originalSourceCreativeCopy(topic, sourceUrl);
  const bytes = await renderOriginalSourcePin(copy);
  const stored = await persistCreativeAssetFile(bytes);
  if (stored.checksum !== creativeAssetChecksum(bytes)) throw Error("SOURCE_ASSET_CHECKSUM_INVALID");
  await releaseCreativeAssetLease(stored.leasePath);
  return { ...copy, ...stored };
}
