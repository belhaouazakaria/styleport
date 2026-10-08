import { GrowthCreativeArchetype } from "@prisma/client";
import sharp from "sharp";

import { CREATIVE_HEIGHT, CREATIVE_WIDTH, STATIC_RENDERER_DEFINITIONS } from "@/lib/growth/creative/constants";
import { creativeCopySchema, type CreativeCopy } from "@/lib/growth/creative/contracts";

export const CREATIVE_TEXT_LINE_LIMITS = {
  CHAT_HEADLINE: { characters: 23, lines: 3 },
  CHAT_REPLY: { characters: 31, lines: 3 },
  HEADLINE: { characters: 24, lines: 4 },
  MINIMAL_HEADLINE: { characters: 20, lines: 4 },
  SUBHEADLINE: { characters: 38, lines: 4 },
  EDITORIAL_SUBHEADLINE: { characters: 38, lines: 3 },
  EDITORIAL_ITEM: { characters: 38, lines: 2 },
} as const;

export function getCreativeRendererDefinition(archetype: GrowthCreativeArchetype) {
  const definition = STATIC_RENDERER_DEFINITIONS[archetype as keyof typeof STATIC_RENDERER_DEFINITIONS];
  if (!definition) throw new Error(`Creative archetype ${archetype} has no Phase 10 deterministic renderer.`);
  return definition;
}

function palette(archetype: GrowthCreativeArchetype) {
  if (archetype === GrowthCreativeArchetype.EDITORIAL_LIST) return { background: "#fff7e8", ink: "#2a1f18", accent: "#e6603c" };
  if (archetype === GrowthCreativeArchetype.CONVERSATION_CHAT) return { background: "#eaf4ff", ink: "#15243a", accent: "#2867d7" };
  if (archetype === GrowthCreativeArchetype.MINIMAL_STATEMENT) return { background: "#171717", ink: "#ffffff", accent: "#b9ff66" };
  return { background: "#f1e8ff", ink: "#171717", accent: "#7048d8" };
}

function escapeXml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '\"': "&quot;", "'": "&apos;" })[character] ?? character);
}

export function capCreativeTextLines(value: string, maximumCharacters: number, maximumLines: number) {
  const words = value.trim().split(/\s+/).flatMap((word) => {
    if (word.length <= maximumCharacters) return [word];
    const chunks: string[] = [];
    for (let index = 0; index < word.length; index += maximumCharacters) chunks.push(word.slice(index, index + maximumCharacters));
    return chunks;
  });
  const lines: string[] = [];
  for (const word of words) {
    const candidate = lines.length ? `${lines.at(-1)} ${word}` : word;
    if (lines.length && candidate.length > maximumCharacters) lines.push(word);
    else if (lines.length) lines[lines.length - 1] = candidate;
    else lines.push(word);
  }
  if (lines.length <= maximumLines) return lines;
  const capped = lines.slice(0, maximumLines);
  capped[maximumLines - 1] = `${capped[maximumLines - 1].slice(0, maximumCharacters - 1).trimEnd()}…`;
  return capped;
}

function renderTextLines(lines: string[], x: number, y: number, lineHeight: number, attributes: string) {
  return lines
    .map((line, index) => `<text x="${x}" y="${y + index * lineHeight}" ${attributes}>${escapeXml(line)}</text>`)
    .join("");
}

function buildCreativeSvg(archetype: GrowthCreativeArchetype, copy: CreativeCopy) {
  const colors = palette(archetype);
  const headlineSize = archetype === GrowthCreativeArchetype.MINIMAL_STATEMENT ? (copy.headline.length > 55 ? 72 : 96) : copy.headline.length > 65 ? 60 : copy.headline.length > 40 ? 70 : 82;
  const headlineLineHeight = headlineSize * 1.08;
  const headlineLimit = archetype === GrowthCreativeArchetype.MINIMAL_STATEMENT ? CREATIVE_TEXT_LINE_LIMITS.MINIMAL_HEADLINE : CREATIVE_TEXT_LINE_LIMITS.HEADLINE;
  const headlineLines = capCreativeTextLines(copy.headline, headlineLimit.characters, headlineLimit.lines);
  const headline = renderTextLines(headlineLines, 84, 330, headlineLineHeight, `fill="${colors.ink}" font-size="${headlineSize}" font-weight="900"`);
  const subheadlineY = 330 + headlineLines.length * headlineLineHeight + 36;
  const subheadlineLimit = archetype === GrowthCreativeArchetype.EDITORIAL_LIST ? CREATIVE_TEXT_LINE_LIMITS.EDITORIAL_SUBHEADLINE : CREATIVE_TEXT_LINE_LIMITS.SUBHEADLINE;
  const subheadlineLines = capCreativeTextLines(copy.subheadline, subheadlineLimit.characters, subheadlineLimit.lines);
  const subheadline = renderTextLines(subheadlineLines, 84, subheadlineY, 52, `fill="${colors.ink}" font-size="38" font-weight="600"`);
  const listY = subheadlineY + subheadlineLines.length * 52 + 54;
  const list = copy.listItems
    .slice(0, 5)
    .map((item, index) => {
      const y = listY + index * 88;
      return `<text x="108" y="${y}" fill="${colors.accent}" font-size="34" font-weight="900">${index + 1}.</text>${renderTextLines(capCreativeTextLines(item, CREATIVE_TEXT_LINE_LIMITS.EDITORIAL_ITEM.characters, CREATIVE_TEXT_LINE_LIMITS.EDITORIAL_ITEM.lines), 158, y, 36, `fill="${colors.ink}" font-size="32"`)}`;
    })
    .join("");
  const main = archetype === GrowthCreativeArchetype.CONVERSATION_CHAT
    ? `<rect x="84" y="300" width="730" height="250" rx="36" fill="#ffffff"/>${renderTextLines(capCreativeTextLines(copy.headline, CREATIVE_TEXT_LINE_LIMITS.CHAT_HEADLINE.characters, CREATIVE_TEXT_LINE_LIMITS.CHAT_HEADLINE.lines), 122, 380, 58, `fill="${colors.ink}" font-size="44" font-weight="700"`)}<rect x="190" y="610" width="726" height="240" rx="36" fill="${colors.accent}"/>${renderTextLines(capCreativeTextLines(copy.subheadline, CREATIVE_TEXT_LINE_LIMITS.CHAT_REPLY.characters, CREATIVE_TEXT_LINE_LIMITS.CHAT_REPLY.lines), 228, 690, 50, 'fill="#ffffff" font-size="38" font-weight="600"')}`
    : `${headline}${subheadline}${archetype === GrowthCreativeArchetype.EDITORIAL_LIST ? list : ""}`;

  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${CREATIVE_WIDTH}" height="${CREATIVE_HEIGHT}" viewBox="0 0 ${CREATIVE_WIDTH} ${CREATIVE_HEIGHT}">
    <rect width="1000" height="1500" fill="${colors.background}"/>
    <rect x="6" y="6" width="988" height="1488" fill="none" stroke="${colors.ink}" stroke-width="12"/>
    <g font-family="Arial, Helvetica, sans-serif">
      <text x="84" y="130" fill="${colors.accent}" font-size="28" font-weight="800" letter-spacing="2">SAYTWIST · ${escapeXml(capCreativeTextLines(copy.topic.toUpperCase(), 42, 1)[0])}</text>
      ${main}
      <line x1="84" y1="1300" x2="916" y2="1300" stroke="${colors.ink}" stroke-width="4"/>
      <text x="84" y="1380" fill="${colors.ink}" font-size="30" font-weight="800">${escapeXml(capCreativeTextLines(copy.cta, 28, 1)[0])}</text>
      <rect x="668" y="1330" width="248" height="74" rx="37" fill="${colors.accent}"/>
      <text x="792" y="1378" fill="#ffffff" font-size="26" font-weight="900" text-anchor="middle">saytwist.com</text>
    </g>
  </svg>`);
}

export async function renderDeterministicCreative(archetype: GrowthCreativeArchetype, rawCopy: CreativeCopy) {
  if (archetype === GrowthCreativeArchetype.V1_CONTROL) throw new Error("Renderer V1 control must be materialized through the share-image adapter.");
  getCreativeRendererDefinition(archetype);
  const copy = creativeCopySchema.parse(rawCopy);
  return sharp(buildCreativeSvg(archetype, copy), { density: 72 }).png().toBuffer();
}
