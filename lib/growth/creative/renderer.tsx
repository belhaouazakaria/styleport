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

function textBlockHeight(text: FittedText) {
  return text.fontSize + Math.max(0, text.lines.length - 1) * text.lineHeight;
}

function brandWordmark(dark = false) {
  return `<g data-brand="text-wordmark"><text x="70" y="108" font-family="Fredoka, Trebuchet MS, Arial, sans-serif" font-size="48" font-weight="700" letter-spacing="-.8"><tspan fill="${dark ? BRAND.white : BRAND.ink}">Say</tspan><tspan fill="${BRAND.primary}">Twist</tspan></text><text x="930" y="103" fill="${dark ? "#B8C4D8" : BRAND.muted}" font-size="18" font-weight="800" letter-spacing="2.4" text-anchor="end">TEXT, YOUR WAY</text></g>`;
}

function topicBadge(topic: string, fill = BRAND.mint, ink = BRAND.primaryDark) {
  const text = fitCreativeText(topic.toUpperCase(), { maximumCharacters: CREATIVE_TEXT_LINE_LIMITS.TOPIC.characters, maximumLines: 1, maximumFontSize: 23, minimumFontSize: 17, availableWidth: 390 });
  const width = Math.min(500, Math.max(230, 92 + text.lines[0].length * text.fontSize * 0.66));
  return `<g data-element="topic"><rect x="70" y="164" width="${Math.round(width)}" height="58" rx="18" fill="${fill}"/><rect x="90" y="184" width="18" height="18" rx="5" fill="${BRAND.secondary}"/>${renderTextLines(text, 124, 201, `fill="${ink}" font-weight="800" letter-spacing="1.4"`)}</g>`;
}

function footer(copy: CreativeCopy, dark = false) {
  const cta = fitCreativeText(copy.cta, { maximumCharacters: CREATIVE_TEXT_LINE_LIMITS.CTA.characters, maximumLines: 1, maximumFontSize: 30, minimumFontSize: 21, availableWidth: 500 });
  const ink = dark ? BRAND.white : BRAND.ink;
  const rule = dark ? "#45536C" : "#D9DEDC";
  return `<g data-element="footer"><line x1="70" y1="1252" x2="930" y2="1252" stroke="${rule}" stroke-width="2" stroke-dasharray="8 11"/><text x="70" y="1302" fill="${dark ? "#AAB7CB" : BRAND.muted}" font-size="16" font-weight="900" letter-spacing="2.2">READY TO TRY IT?</text>${renderTextLines(cta, 70, 1365, `fill="${ink}" font-weight="800"`)}<g transform="translate(690 1311)"><rect width="240" height="76" rx="24" fill="${BRAND.primary}"/><text x="120" y="49" fill="${BRAND.white}" font-size="24" font-weight="800" text-anchor="middle">saytwist.com</text></g></g>`;
}

function typographyLayout(copy: CreativeCopy) {
  const headline = fitCreativeText(copy.headline, { maximumCharacters: CREATIVE_TEXT_LINE_LIMITS.HEADLINE.characters, maximumLines: CREATIVE_TEXT_LINE_LIMITS.HEADLINE.lines, maximumFontSize: 100, minimumFontSize: 62, availableWidth: 820, lineHeightRatio: 1.01 });
  const subheadline = fitCreativeText(copy.subheadline, { maximumCharacters: CREATIVE_TEXT_LINE_LIMITS.SUBHEADLINE.characters, maximumLines: CREATIVE_TEXT_LINE_LIMITS.SUBHEADLINE.lines, maximumFontSize: 37, minimumFontSize: 29, availableWidth: 790, lineHeightRatio: 1.25 });
  const contentHeight = 25 + 46 + textBlockHeight(headline) + 72 + textBlockHeight(subheadline) + 92;
  const contentTop = Math.max(292, Math.round(735 - contentHeight / 2));
  const headlineY = contentTop + 71 + headline.fontSize;
  const subY = textEndY(headline, headlineY) + 72;
  const flourishY = Math.min(1135, textEndY(subheadline, subY) + 92);
  return `<rect width="1000" height="1500" fill="${BRAND.light}"/><path d="M768 0h232v344L886 280 768 330Z" fill="${BRAND.sky}"/><circle cx="900" cy="228" r="56" fill="${BRAND.accent}" opacity=".9"/><rect x="52" y="${contentTop + 48}" width="12" height="${Math.min(550, contentHeight - 70)}" rx="6" fill="${BRAND.secondary}"/>${brandWordmark()}${topicBadge(copy.topic)}<g data-layout="typography-content"><text x="70" y="${contentTop + 25}" fill="${BRAND.secondary}" font-size="21" font-weight="900" letter-spacing="2.2">WORDS, WITH A TWIST</text>${renderTextLines(headline, 70, headlineY, `fill="${BRAND.ink}" font-weight="800"`)}${renderTextLines(subheadline, 74, subY, `fill="${BRAND.muted}" font-weight="600"`)}<g transform="translate(70 ${flourishY})"><rect width="150" height="13" rx="6.5" fill="${BRAND.primary}"/><rect x="166" width="52" height="13" rx="6.5" fill="${BRAND.secondary}"/><rect x="234" width="88" height="13" rx="6.5" fill="${BRAND.accent}"/></g></g>${footer(copy)}`;
}

function editorialLayout(copy: CreativeCopy) {
  const headline = fitCreativeText(copy.headline, { maximumCharacters: CREATIVE_TEXT_LINE_LIMITS.EDITORIAL_HEADLINE.characters, maximumLines: CREATIVE_TEXT_LINE_LIMITS.EDITORIAL_HEADLINE.lines, maximumFontSize: 72, minimumFontSize: 52, availableWidth: 820, lineHeightRatio: 1.04 });
  const subheadline = fitCreativeText(copy.subheadline, { maximumCharacters: CREATIVE_TEXT_LINE_LIMITS.EDITORIAL_SUBHEADLINE.characters, maximumLines: CREATIVE_TEXT_LINE_LIMITS.EDITORIAL_SUBHEADLINE.lines, maximumFontSize: 31, minimumFontSize: 25, availableWidth: 800, lineHeightRatio: 1.28 });
  const headlineY = 324;
  const subY = textEndY(headline, headlineY) + 54;
  const listStart = Math.max(620, textEndY(subheadline, subY) + 100);
  const itemCount = Math.max(copy.listItems.slice(0, 5).length, 1);
  const itemStep = itemCount >= 5 ? 101 : itemCount === 4 ? 132 : 176;
  const items = copy.listItems.slice(0, 5).map((item, index) => {
    const fitted = fitCreativeText(item, { maximumCharacters: CREATIVE_TEXT_LINE_LIMITS.EDITORIAL_ITEM.characters, maximumLines: CREATIVE_TEXT_LINE_LIMITS.EDITORIAL_ITEM.lines, maximumFontSize: 29, minimumFontSize: 23, availableWidth: 690, lineHeightRatio: 1.12 });
    const y = listStart + index * itemStep;
    const fill = index % 2 ? BRAND.sky : BRAND.white;
    return `<g data-element="list-item"><rect x="70" y="${y - 42}" width="860" height="84" rx="20" fill="${fill}" stroke="#DDE7E6" stroke-width="2"/><rect x="88" y="${y - 24}" width="48" height="48" rx="15" fill="${index % 2 ? BRAND.accent : BRAND.primary}"/><text x="112" y="${y + 8}" fill="${BRAND.white}" font-size="22" font-weight="900" text-anchor="middle">${index + 1}</text>${renderTextLines(fitted, 160, y - (fitted.lines.length > 1 ? 10 : -9), `fill="${BRAND.ink}" font-weight="700"`)}</g>`;
  }).join("");
  return `<rect width="1000" height="1500" fill="${BRAND.light}"/><path d="M790 0h210v275l-138-56-72 68Z" fill="${BRAND.warm}"/><rect x="857" y="158" width="72" height="72" rx="22" fill="${BRAND.secondary}" transform="rotate(8 893 194)"/>${brandWordmark()}${topicBadge(copy.topic)}<g data-layout="editorial-content">${renderTextLines(headline, 70, headlineY, `fill="${BRAND.ink}" font-weight="800"`)}${renderTextLines(subheadline, 72, subY, `fill="${BRAND.muted}" font-weight="600"`)}<line x1="72" y1="${listStart - 60}" x2="930" y2="${listStart - 60}" stroke="${BRAND.secondary}" stroke-width="5"/>${items}</g>${footer(copy)}`;
}

function conversationLayout(copy: CreativeCopy) {
  const question = fitCreativeText(copy.headline, { maximumCharacters: CREATIVE_TEXT_LINE_LIMITS.CHAT_HEADLINE.characters, maximumLines: CREATIVE_TEXT_LINE_LIMITS.CHAT_HEADLINE.lines, maximumFontSize: 48, minimumFontSize: 37, availableWidth: 680, lineHeightRatio: 1.18 });
  const reply = fitCreativeText(copy.subheadline, { maximumCharacters: CREATIVE_TEXT_LINE_LIMITS.CHAT_REPLY.characters, maximumLines: CREATIVE_TEXT_LINE_LIMITS.CHAT_REPLY.lines, maximumFontSize: 41, minimumFontSize: 32, availableWidth: 660, lineHeightRatio: 1.2 });
  const questionHeight = Math.max(190, textBlockHeight(question) + 92);
  const replyHeight = Math.max(205, textBlockHeight(reply) + 104);
  const questionY = 350;
  const replyY = questionY + questionHeight + 54;
  const noteY = Math.min(1148, replyY + replyHeight + 42);
  return `<rect width="1000" height="1500" fill="${BRAND.light}"/><circle cx="910" cy="262" r="128" fill="${BRAND.sky}"/><rect x="30" y="1000" width="126" height="126" rx="36" fill="${BRAND.warm}" transform="rotate(-9 93 1063)"/>${brandWordmark()}${topicBadge(copy.topic)}<g data-layout="conversation-content"><text x="70" y="292" fill="${BRAND.muted}" font-size="20" font-weight="900" letter-spacing="1.8">A LITTLE TWIST CHANGES EVERYTHING</text><g><rect x="70" y="${questionY}" width="770" height="${questionHeight}" rx="38" fill="${BRAND.white}" stroke="#DDE7E6" stroke-width="3"/><path d="M112 ${questionY + questionHeight - 3}l-12 46 58-44" fill="${BRAND.white}" stroke="#DDE7E6" stroke-width="3"/>${renderTextLines(question, 118, questionY + 84, `fill="${BRAND.ink}" font-weight="700"`)}</g><g><rect x="165" y="${replyY}" width="765" height="${replyHeight}" rx="38" fill="${BRAND.primary}"/><path d="M858 ${replyY + replyHeight - 3}l48 44-9-56" fill="${BRAND.primary}"/>${renderTextLines(reply, 216, replyY + 88, `fill="${BRAND.white}" font-weight="700"`)}</g><g transform="translate(194 ${noteY})"><rect width="300" height="56" rx="18" fill="${BRAND.warm}"/><text x="150" y="37" fill="${BRAND.secondary}" font-size="20" font-weight="900" text-anchor="middle">SOUNDS MORE LIKE YOU</text></g></g>${footer(copy)}`;
}

function minimalLayout(copy: CreativeCopy) {
  const headline = fitCreativeText(copy.headline, { maximumCharacters: CREATIVE_TEXT_LINE_LIMITS.MINIMAL_HEADLINE.characters, maximumLines: CREATIVE_TEXT_LINE_LIMITS.MINIMAL_HEADLINE.lines, maximumFontSize: 86, minimumFontSize: 58, availableWidth: 730, lineHeightRatio: 1.03 });
  const subheadline = fitCreativeText(copy.subheadline, { maximumCharacters: CREATIVE_TEXT_LINE_LIMITS.SUBHEADLINE.characters, maximumLines: CREATIVE_TEXT_LINE_LIMITS.SUBHEADLINE.lines, maximumFontSize: 34, minimumFontSize: 27, availableWidth: 700, lineHeightRatio: 1.25 });
  const contentHeight = textBlockHeight(headline) + 70 + textBlockHeight(subheadline);
  const headlineY = Math.max(440, Math.round(710 - contentHeight / 2));
  const subY = textEndY(headline, headlineY) + 72;
  return `<rect width="1000" height="1500" fill="${BRAND.light}"/>${brandWordmark()}${topicBadge(copy.topic)}<g data-layout="minimal-content"><rect x="58" y="260" width="884" height="900" rx="46" fill="${BRAND.ink}"/><path d="M720 260h222v226L828 438l-108 61Z" fill="#17243B"/><circle cx="852" cy="361" r="48" fill="${BRAND.secondary}"/><rect x="108" y="322" width="118" height="14" rx="7" fill="${BRAND.accent}"/><text x="108" y="380" fill="${BRAND.primary}" font-size="19" font-weight="900" letter-spacing="2.1">ONE CLEAR THOUGHT</text>${renderTextLines(headline, 108, headlineY, `fill="${BRAND.white}" font-weight="800"`)}${renderTextLines(subheadline, 110, subY, `fill="#CFD8E8" font-weight="600"`)}<line x1="110" y1="1052" x2="270" y2="1052" stroke="${BRAND.secondary}" stroke-width="7" stroke-linecap="round"/><text x="110" y="1103" fill="${BRAND.primary}" font-size="21" font-weight="900" letter-spacing="1.7">SIMPLE WORDS. STRONGER FEELING.</text></g>${footer(copy)}`;
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
