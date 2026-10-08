import { GrowthCreativeArchetype } from "@prisma/client";
import sharp from "sharp";

import { CREATIVE_HEIGHT, CREATIVE_WIDTH, STATIC_RENDERER_DEFINITIONS } from "@/lib/growth/creative/constants";
import { creativeCopySchema, type CreativeCopy } from "@/lib/growth/creative/contracts";

const BRAND = {
  primary: "#14B8A6",
  primaryDark: "#0F766E",
  secondary: "#FF7A59",
  accent: "#60C5F7",
  ink: "#0F172A",
  muted: "#566176",
  light: "#FFF9F4",
  white: "#FFFFFF",
  warm: "#FFF0E9",
  sky: "#EAF7FF",
  mint: "#E8FAF6",
} as const;

export const CREATIVE_TEXT_LINE_LIMITS = {
  TOPIC: { characters: 28, lines: 1 },
  CTA: { characters: 30, lines: 1 },
  HEADLINE: { characters: 20, lines: 4 },
  MINIMAL_HEADLINE: { characters: 18, lines: 4 },
  SUBHEADLINE: { characters: 36, lines: 3 },
  EDITORIAL_HEADLINE: { characters: 23, lines: 3 },
  EDITORIAL_SUBHEADLINE: { characters: 38, lines: 2 },
  EDITORIAL_ITEM: { characters: 34, lines: 2 },
  CHAT_HEADLINE: { characters: 22, lines: 3 },
  CHAT_REPLY: { characters: 29, lines: 3 },
} as const;

interface FittedText {
  lines: string[];
  fontSize: number;
  lineHeight: number;
}

interface FitOptions {
  maximumCharacters: number;
  maximumLines: number;
  maximumFontSize: number;
  minimumFontSize: number;
  availableWidth: number;
  lineHeightRatio?: number;
}

export function getCreativeRendererDefinition(archetype: GrowthCreativeArchetype) {
  const definition = STATIC_RENDERER_DEFINITIONS[archetype as keyof typeof STATIC_RENDERER_DEFINITIONS];
  if (!definition) throw new Error(`Creative archetype ${archetype} has no Phase 10 deterministic renderer.`);
  return definition;
}

function escapeXml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[character] ?? character);
}

export function capCreativeTextLines(value: string, maximumCharacters: number, maximumLines: number) {
  const words = value.trim().split(/\s+/).filter(Boolean).flatMap((word) => {
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
  if (!lines.length) return [""];
  if (lines.length <= maximumLines) return lines;
  const capped = lines.slice(0, maximumLines);
  capped[maximumLines - 1] = `${capped[maximumLines - 1].slice(0, maximumCharacters - 1).trimEnd()}…`;
  return capped;
}

export function fitCreativeText(value: string, options: FitOptions): FittedText {
  const lines = capCreativeTextLines(value, options.maximumCharacters, options.maximumLines);
  const longest = Math.max(...lines.map((line) => line.length), 1);
  const widthBound = Math.floor(options.availableWidth / (longest * 0.58));
  const linePenalty = Math.max(0, lines.length - 2) * 4;
  const fontSize = Math.max(options.minimumFontSize, Math.min(options.maximumFontSize - linePenalty, widthBound));
  return { lines, fontSize, lineHeight: Math.round(fontSize * (options.lineHeightRatio || 1.08)) };
}

function renderTextLines(text: FittedText, x: number, y: number, attributes: string) {
  return text.lines.map((line, index) => `<text x="${x}" y="${y + index * text.lineHeight}" font-size="${text.fontSize}" ${attributes}>${escapeXml(line)}</text>`).join("");
}

function textEndY(text: FittedText, y: number) {
  return y + Math.max(0, text.lines.length - 1) * text.lineHeight;
}

function brandMark() {
  return `<g transform="translate(70 66)">
    <path d="M0 22C0 7 13 0 28 0h18c15 0 27 8 27 22s-12 23-27 23H25L13 56l3-13C6 39 0 32 0 22Z" fill="${BRAND.primary}"/>
    <circle cx="24" cy="22" r="4" fill="${BRAND.white}"/><circle cx="38" cy="22" r="4" fill="${BRAND.white}"/><circle cx="52" cy="22" r="4" fill="${BRAND.white}"/>
    <text x="92" y="38" font-family="Fredoka, Arial Rounded MT Bold, Arial, sans-serif" font-size="42" font-weight="700"><tspan fill="${BRAND.ink}">Say</tspan><tspan fill="${BRAND.primary}">Twist</tspan></text>
  </g>`;
}

function topicBadge(topic: string, fill = BRAND.mint, ink = BRAND.primaryDark) {
  const text = fitCreativeText(topic.toUpperCase(), { maximumCharacters: CREATIVE_TEXT_LINE_LIMITS.TOPIC.characters, maximumLines: 1, maximumFontSize: 23, minimumFontSize: 17, availableWidth: 390 });
  return `<g><rect x="70" y="164" width="440" height="58" rx="29" fill="${fill}"/><circle cx="101" cy="193" r="8" fill="${BRAND.secondary}"/>${renderTextLines(text, 124, 201, `fill="${ink}" font-weight="800" letter-spacing="1.5"`)}</g>`;
}

function footer(copy: CreativeCopy, dark = false) {
  const cta = fitCreativeText(copy.cta, { maximumCharacters: CREATIVE_TEXT_LINE_LIMITS.CTA.characters, maximumLines: 1, maximumFontSize: 29, minimumFontSize: 21, availableWidth: 500 });
  const ink = dark ? BRAND.white : BRAND.ink;
  const rule = dark ? "#43506A" : "#D8D7D3";
  return `<g><line x1="70" y1="1270" x2="930" y2="1270" stroke="${rule}" stroke-width="2" stroke-dasharray="9 10"/>${renderTextLines(cta, 70, 1364, `fill="${ink}" font-weight="800"`)}<g transform="translate(690 1310)"><rect width="240" height="78" rx="39" fill="${BRAND.primary}"/><text x="120" y="50" fill="${BRAND.white}" font-size="25" font-weight="800" text-anchor="middle">saytwist.com</text></g></g>`;
}

function typographyLayout(copy: CreativeCopy) {
  const headline = fitCreativeText(copy.headline, { maximumCharacters: CREATIVE_TEXT_LINE_LIMITS.HEADLINE.characters, maximumLines: CREATIVE_TEXT_LINE_LIMITS.HEADLINE.lines, maximumFontSize: 92, minimumFontSize: 62, availableWidth: 820, lineHeightRatio: 1.02 });
  const subheadline = fitCreativeText(copy.subheadline, { maximumCharacters: CREATIVE_TEXT_LINE_LIMITS.SUBHEADLINE.characters, maximumLines: CREATIVE_TEXT_LINE_LIMITS.SUBHEADLINE.lines, maximumFontSize: 37, minimumFontSize: 29, availableWidth: 790, lineHeightRatio: 1.25 });
  const subY = textEndY(headline, 390) + 76;
  return `<rect width="1000" height="1500" fill="${BRAND.light}"/><circle cx="900" cy="285" r="124" fill="${BRAND.sky}"/><rect x="825" y="244" width="140" height="30" rx="15" fill="${BRAND.accent}" transform="rotate(-12 825 244)"/><rect x="57" y="292" width="12" height="520" rx="6" fill="${BRAND.secondary}"/>${brandMark()}${topicBadge(copy.topic)}<text x="70" y="302" fill="${BRAND.secondary}" font-size="22" font-weight="900" letter-spacing="2">WORDS, WITH A TWIST</text>${renderTextLines(headline, 70, 390, `fill="${BRAND.ink}" font-weight="800"`)}${renderTextLines(subheadline, 74, subY, `fill="${BRAND.muted}" font-weight="600"`)}<path d="M70 1085c150-70 285 52 440-8s274-26 420 20" fill="none" stroke="${BRAND.primary}" stroke-width="14" stroke-linecap="round" opacity=".9"/>${footer(copy)}`;
}

function editorialLayout(copy: CreativeCopy) {
  const headline = fitCreativeText(copy.headline, { maximumCharacters: CREATIVE_TEXT_LINE_LIMITS.EDITORIAL_HEADLINE.characters, maximumLines: CREATIVE_TEXT_LINE_LIMITS.EDITORIAL_HEADLINE.lines, maximumFontSize: 72, minimumFontSize: 52, availableWidth: 820, lineHeightRatio: 1.04 });
  const subheadline = fitCreativeText(copy.subheadline, { maximumCharacters: CREATIVE_TEXT_LINE_LIMITS.EDITORIAL_SUBHEADLINE.characters, maximumLines: CREATIVE_TEXT_LINE_LIMITS.EDITORIAL_SUBHEADLINE.lines, maximumFontSize: 31, minimumFontSize: 25, availableWidth: 800, lineHeightRatio: 1.28 });
  const subY = textEndY(headline, 322) + 60;
  const listStart = Math.max(650, textEndY(subheadline, subY) + 55);
  const items = copy.listItems.slice(0, 5).map((item, index) => {
    const fitted = fitCreativeText(item, { maximumCharacters: CREATIVE_TEXT_LINE_LIMITS.EDITORIAL_ITEM.characters, maximumLines: CREATIVE_TEXT_LINE_LIMITS.EDITORIAL_ITEM.lines, maximumFontSize: 29, minimumFontSize: 23, availableWidth: 690, lineHeightRatio: 1.12 });
    const y = listStart + index * 101;
    const fill = index % 2 ? BRAND.sky : BRAND.white;
    return `<g><rect x="70" y="${y - 42}" width="860" height="84" rx="24" fill="${fill}" stroke="#DDE7E6" stroke-width="2"/><circle cx="116" cy="${y}" r="25" fill="${index % 2 ? BRAND.accent : BRAND.primary}"/><text x="116" y="${y + 9}" fill="${BRAND.white}" font-size="23" font-weight="900" text-anchor="middle">${index + 1}</text>${renderTextLines(fitted, 160, y - (fitted.lines.length > 1 ? 10 : -9), `fill="${BRAND.ink}" font-weight="700"`)}</g>`;
  }).join("");
  return `<rect width="1000" height="1500" fill="${BRAND.light}"/><path d="M780 0h220v260L846 214Z" fill="${BRAND.warm}"/><circle cx="899" cy="88" r="34" fill="${BRAND.secondary}" opacity=".8"/>${brandMark()}${topicBadge(copy.topic)}${renderTextLines(headline, 70, 322, `fill="${BRAND.ink}" font-weight="800"`)}${renderTextLines(subheadline, 72, subY, `fill="${BRAND.muted}" font-weight="600"`)}${items}${footer(copy)}`;
}

function conversationLayout(copy: CreativeCopy) {
  const question = fitCreativeText(copy.headline, { maximumCharacters: CREATIVE_TEXT_LINE_LIMITS.CHAT_HEADLINE.characters, maximumLines: CREATIVE_TEXT_LINE_LIMITS.CHAT_HEADLINE.lines, maximumFontSize: 48, minimumFontSize: 37, availableWidth: 680, lineHeightRatio: 1.18 });
  const reply = fitCreativeText(copy.subheadline, { maximumCharacters: CREATIVE_TEXT_LINE_LIMITS.CHAT_REPLY.characters, maximumLines: CREATIVE_TEXT_LINE_LIMITS.CHAT_REPLY.lines, maximumFontSize: 41, minimumFontSize: 32, availableWidth: 660, lineHeightRatio: 1.2 });
  return `<rect width="1000" height="1500" fill="${BRAND.light}"/><circle cx="895" cy="250" r="150" fill="${BRAND.sky}"/><circle cx="92" cy="1080" r="82" fill="${BRAND.warm}"/>${brandMark()}${topicBadge(copy.topic)}<text x="70" y="292" fill="${BRAND.muted}" font-size="22" font-weight="800" letter-spacing="1.5">A LITTLE TWIST CHANGES EVERYTHING</text><g><rect x="70" y="338" width="770" height="278" rx="44" fill="${BRAND.white}" stroke="#DDE7E6" stroke-width="3"/><path d="M112 612l-12 52 61-49" fill="${BRAND.white}" stroke="#DDE7E6" stroke-width="3"/>${renderTextLines(question, 118, 432, `fill="${BRAND.ink}" font-weight="700"`)}</g><g><rect x="165" y="694" width="765" height="310" rx="44" fill="${BRAND.primary}"/><path d="M861 998l46 48-8-59" fill="${BRAND.primary}"/>${renderTextLines(reply, 216, 792, `fill="${BRAND.white}" font-weight="700"`)}</g><rect x="194" y="1060" width="270" height="54" rx="27" fill="${BRAND.warm}"/><text x="329" y="1096" fill="${BRAND.secondary}" font-size="21" font-weight="900" text-anchor="middle">SOUNDS MORE LIKE YOU</text>${footer(copy)}`;
}

function minimalLayout(copy: CreativeCopy) {
  const headline = fitCreativeText(copy.headline, { maximumCharacters: CREATIVE_TEXT_LINE_LIMITS.MINIMAL_HEADLINE.characters, maximumLines: CREATIVE_TEXT_LINE_LIMITS.MINIMAL_HEADLINE.lines, maximumFontSize: 86, minimumFontSize: 58, availableWidth: 730, lineHeightRatio: 1.03 });
  const subheadline = fitCreativeText(copy.subheadline, { maximumCharacters: CREATIVE_TEXT_LINE_LIMITS.SUBHEADLINE.characters, maximumLines: CREATIVE_TEXT_LINE_LIMITS.SUBHEADLINE.lines, maximumFontSize: 34, minimumFontSize: 27, availableWidth: 700, lineHeightRatio: 1.25 });
  const subY = Math.min(885, textEndY(headline, 420) + 76);
  return `<rect width="1000" height="1500" fill="${BRAND.light}"/>${brandMark()}${topicBadge(copy.topic)}<g><rect x="58" y="260" width="884" height="890" rx="58" fill="${BRAND.ink}"/><circle cx="854" cy="362" r="54" fill="${BRAND.secondary}"/><rect x="98" y="306" width="112" height="15" rx="7.5" fill="${BRAND.accent}"/>${renderTextLines(headline, 108, 420, `fill="${BRAND.white}" font-weight="800"`)}${renderTextLines(subheadline, 110, subY, `fill="#CFD8E8" font-weight="600"`)}<text x="110" y="1080" fill="${BRAND.primary}" font-size="23" font-weight="900" letter-spacing="2">SIMPLE WORDS. STRONGER FEELING.</text></g>${footer(copy)}`;
}

export function buildCreativeSvg(archetype: GrowthCreativeArchetype, copy: CreativeCopy) {
  const content = archetype === GrowthCreativeArchetype.EDITORIAL_LIST
    ? editorialLayout(copy)
    : archetype === GrowthCreativeArchetype.CONVERSATION_CHAT
      ? conversationLayout(copy)
      : archetype === GrowthCreativeArchetype.MINIMAL_STATEMENT
        ? minimalLayout(copy)
        : typographyLayout(copy);
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${CREATIVE_WIDTH}" height="${CREATIVE_HEIGHT}" viewBox="0 0 ${CREATIVE_WIDTH} ${CREATIVE_HEIGHT}"><defs><clipPath id="safe-canvas"><rect width="1000" height="1500" rx="0"/></clipPath></defs><g clip-path="url(#safe-canvas)" font-family="Nunito Sans, Arial, Helvetica, sans-serif">${content}</g></svg>`);
}

export async function renderDeterministicCreative(archetype: GrowthCreativeArchetype, rawCopy: CreativeCopy) {
  if (archetype === GrowthCreativeArchetype.V1_CONTROL) throw new Error("Renderer V1 control must be materialized through the share-image adapter.");
  getCreativeRendererDefinition(archetype);
  const copy = creativeCopySchema.parse(rawCopy);
  return sharp(buildCreativeSvg(archetype, copy), { density: 72 }).png().toBuffer();
}
