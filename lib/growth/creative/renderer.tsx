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
  HEADLINE: { characters: 18, lines: 4 },
  SUBHEADLINE: { characters: 34, lines: 3 },
  SHOWCASE_HEADLINE: { characters: 25, lines: 2 },
  EXAMPLE_INPUT: { characters: 34, lines: 3 },
  EXAMPLE_OUTPUT: { characters: 31, lines: 4 },
} as const;

interface FittedText { lines: string[]; fontSize: number; lineHeight: number }
interface FitOptions { maximumCharacters: number; maximumLines: number; maximumFontSize: number; minimumFontSize: number; availableWidth: number; lineHeightRatio?: number }

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
    return Array.from({ length: Math.ceil(word.length / maximumCharacters) }, (_, index) => word.slice(index * maximumCharacters, (index + 1) * maximumCharacters));
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

function textBlockHeight(text: FittedText) {
  return text.fontSize + Math.max(0, text.lines.length - 1) * text.lineHeight;
}

function textEndY(text: FittedText, y: number) {
  return y + Math.max(0, text.lines.length - 1) * text.lineHeight;
}

function controlledVariant(copy: CreativeCopy, archetype: GrowthCreativeArchetype) {
  const seed = `${archetype}:${copy.topic}:${copy.headline}`;
  let hash = 0;
  for (let index = 0; index < seed.length; index += 1) hash = (hash * 31 + seed.charCodeAt(index)) >>> 0;
  return hash % 3;
}

function wordmark() {
  return `<g data-brand="text-wordmark"><text x="70" y="106" font-family="Fredoka, Trebuchet MS, Arial, sans-serif" font-size="47" font-weight="700" letter-spacing="-.8"><tspan fill="${BRAND.ink}">Say</tspan><tspan fill="${BRAND.primary}">Twist</tspan></text><text x="930" y="101" fill="${BRAND.muted}" font-size="17" font-weight="800" letter-spacing="2.2" text-anchor="end">TEXT, YOUR WAY</text></g>`;
}

function topicBadge(topic: string) {
  const text = fitCreativeText(topic.toUpperCase(), { maximumCharacters: CREATIVE_TEXT_LINE_LIMITS.TOPIC.characters, maximumLines: 1, maximumFontSize: 22, minimumFontSize: 16, availableWidth: 390 });
  const width = Math.min(490, Math.max(220, 90 + text.lines[0].length * text.fontSize * 0.65));
  return `<g data-element="topic"><rect x="70" y="154" width="${Math.round(width)}" height="58" rx="18" fill="${BRAND.mint}"/><rect x="90" y="174" width="18" height="18" rx="5" fill="${BRAND.secondary}"/>${renderTextLines(text, 124, 191, `fill="${BRAND.primaryDark}" font-weight="800" letter-spacing="1.35"`)}</g>`;
}

function footer(copy: CreativeCopy) {
  const cta = fitCreativeText(copy.cta, { maximumCharacters: CREATIVE_TEXT_LINE_LIMITS.CTA.characters, maximumLines: 1, maximumFontSize: 30, minimumFontSize: 21, availableWidth: 500 });
  return `<g data-element="footer"><line x1="70" y1="1250" x2="930" y2="1250" stroke="#D9DEDC" stroke-width="2" stroke-dasharray="8 11"/><text x="70" y="1300" fill="${BRAND.muted}" font-size="16" font-weight="900" letter-spacing="2.1">MAKE THE MESSAGE YOURS</text>${renderTextLines(cta, 70, 1364, `fill="${BRAND.ink}" font-weight="800"`)}<g transform="translate(690 1310)"><rect width="240" height="76" rx="24" fill="${BRAND.primary}"/><text x="120" y="49" fill="${BRAND.white}" font-size="24" font-weight="800" text-anchor="middle">saytwist.com</text></g></g>`;
}

function minimalMotif(variant: number) {
  if (variant === 1) return `<path d="M735 260h207v248l-104-62-103 62Z" fill="#1A2942"/><rect x="810" y="317" width="82" height="82" rx="24" fill="${BRAND.accent}" transform="rotate(9 851 358)"/><circle cx="105" cy="1095" r="70" fill="${BRAND.secondary}" opacity=".18"/>`;
  if (variant === 2) return `<circle cx="847" cy="360" r="92" fill="${BRAND.secondary}"/><path d="M58 915c166-86 316 90 477 5s276-62 407 30v210H58Z" fill="#14213A"/><rect x="99" y="308" width="132" height="15" rx="7.5" fill="${BRAND.accent}"/>`;
  return `<path d="M720 260h222v226L828 438l-108 61Z" fill="#17243B"/><circle cx="852" cy="361" r="48" fill="${BRAND.secondary}"/><rect x="108" y="322" width="118" height="14" rx="7" fill="${BRAND.accent}"/>`;
}

function minimalPosterLayout(copy: CreativeCopy, archetype: GrowthCreativeArchetype) {
  const variant = controlledVariant(copy, archetype);
  const headline = fitCreativeText(copy.headline, { maximumCharacters: CREATIVE_TEXT_LINE_LIMITS.HEADLINE.characters, maximumLines: CREATIVE_TEXT_LINE_LIMITS.HEADLINE.lines, maximumFontSize: 92, minimumFontSize: 58, availableWidth: 720, lineHeightRatio: 1.02 });
  const subheadline = fitCreativeText(copy.subheadline, { maximumCharacters: CREATIVE_TEXT_LINE_LIMITS.SUBHEADLINE.characters, maximumLines: CREATIVE_TEXT_LINE_LIMITS.SUBHEADLINE.lines, maximumFontSize: 32, minimumFontSize: 26, availableWidth: 690, lineHeightRatio: 1.24 });
  const contentHeight = textBlockHeight(headline) + 68 + textBlockHeight(subheadline);
  const headlineY = Math.max(448, Math.round(714 - contentHeight / 2));
  const subY = textEndY(headline, headlineY) + 70;
  const panelX = variant === 1 ? 70 : 58;
  const panelWidth = variant === 1 ? 872 : 884;
  return `<rect width="1000" height="1500" fill="${BRAND.light}"/>${wordmark()}${topicBadge(copy.topic)}<g data-layout="minimal-poster" data-variant="${variant}"><rect x="${panelX}" y="260" width="${panelWidth}" height="900" rx="46" fill="${BRAND.ink}"/>${minimalMotif(variant)}<text x="108" y="382" fill="${BRAND.primary}" font-size="19" font-weight="900" letter-spacing="2.1">ONE CLEAR THOUGHT</text>${renderTextLines(headline, 108, headlineY, `fill="${BRAND.white}" font-weight="800"`)}${renderTextLines(subheadline, 110, subY, `fill="#CFD8E8" font-weight="600"`)}<line x1="110" y1="1052" x2="270" y2="1052" stroke="${BRAND.secondary}" stroke-width="7" stroke-linecap="round"/><text x="110" y="1103" fill="${BRAND.primary}" font-size="21" font-weight="900" letter-spacing="1.7">SIMPLE WORDS. STRONGER FEELING.</text></g>${footer(copy)}`;
}

function showcaseMotif(variant: number) {
  if (variant === 1) return `<circle cx="895" cy="300" r="118" fill="${BRAND.sky}"/><rect x="805" y="232" width="74" height="74" rx="21" fill="${BRAND.secondary}" transform="rotate(-10 842 269)"/>`;
  if (variant === 2) return `<path d="M760 0h240v350l-120-76-120 76Z" fill="${BRAND.warm}"/><circle cx="880" cy="216" r="46" fill="${BRAND.accent}"/>`;
  return `<path d="M815 0h185v328l-93-54-92 54Z" fill="${BRAND.sky}"/><rect x="851" y="198" width="82" height="82" rx="26" fill="${BRAND.secondary}" transform="rotate(8 892 239)"/>`;
}

function beforeAfterLayout(copy: CreativeCopy, archetype: GrowthCreativeArchetype) {
  const variant = controlledVariant(copy, archetype);
  const headline = fitCreativeText(copy.headline, { maximumCharacters: CREATIVE_TEXT_LINE_LIMITS.SHOWCASE_HEADLINE.characters, maximumLines: CREATIVE_TEXT_LINE_LIMITS.SHOWCASE_HEADLINE.lines, maximumFontSize: 58, minimumFontSize: 44, availableWidth: 760, lineHeightRatio: 1.04 });
  const input = fitCreativeText(copy.exampleInput || "Can we talk about this later?", { maximumCharacters: CREATIVE_TEXT_LINE_LIMITS.EXAMPLE_INPUT.characters, maximumLines: CREATIVE_TEXT_LINE_LIMITS.EXAMPLE_INPUT.lines, maximumFontSize: 35, minimumFontSize: 28, availableWidth: 710, lineHeightRatio: 1.2 });
  const output = fitCreativeText(copy.exampleOutput || "Let's come back to this later and give it the attention it deserves.", { maximumCharacters: CREATIVE_TEXT_LINE_LIMITS.EXAMPLE_OUTPUT.characters, maximumLines: CREATIVE_TEXT_LINE_LIMITS.EXAMPLE_OUTPUT.lines, maximumFontSize: 38, minimumFontSize: 29, availableWidth: 680, lineHeightRatio: 1.18 });
  const headlineY = 310;
  const inputY = Math.max(485, textEndY(headline, headlineY) + 82);
  const inputHeight = Math.max(190, textBlockHeight(input) + 94);
  const outputY = inputY + inputHeight + 54;
  const outputHeight = Math.max(245, textBlockHeight(output) + 112);
  const inputX = variant === 1 ? 110 : 70;
  const outputX = variant === 2 ? 70 : 130;
  const proofY = Math.min(1165, outputY + outputHeight + 62);
  return `<rect width="1000" height="1500" fill="${BRAND.light}"/>${showcaseMotif(variant)}${wordmark()}${topicBadge(copy.topic)}<g data-layout="before-after-showcase" data-variant="${variant}"><text x="70" y="258" fill="${BRAND.secondary}" font-size="19" font-weight="900" letter-spacing="2">SEE THE TWIST IN ACTION</text>${renderTextLines(headline, 70, headlineY, `fill="${BRAND.ink}" font-weight="800"`)}<g data-element="before-card"><rect x="${inputX}" y="${inputY}" width="820" height="${inputHeight}" rx="32" fill="${BRAND.white}" stroke="#D6E3E1" stroke-width="3"/><text x="${inputX + 42}" y="${inputY + 50}" fill="${BRAND.muted}" font-size="17" font-weight="900" letter-spacing="2">BEFORE</text>${renderTextLines(input, inputX + 42, inputY + 112, `fill="${BRAND.ink}" font-weight="700"`)}</g><g transform="translate(${variant === 1 ? 775 : 785} ${inputY + inputHeight + 10})"><circle r="34" fill="${BRAND.secondary}"/><text x="0" y="10" fill="${BRAND.white}" font-size="30" font-weight="900" text-anchor="middle">↓</text></g><g data-element="after-card"><rect x="${outputX}" y="${outputY}" width="860" height="${outputHeight}" rx="34" fill="${BRAND.primary}"/><rect x="${outputX + 34}" y="${outputY + 30}" width="92" height="42" rx="14" fill="${BRAND.white}" opacity=".18"/><text x="${outputX + 52}" y="${outputY + 58}" fill="${BRAND.white}" font-size="17" font-weight="900" letter-spacing="2">AFTER</text>${renderTextLines(output, outputX + 48, outputY + 128, `fill="${BRAND.white}" font-weight="750"`)}</g><g transform="translate(70 ${proofY})"><rect width="204" height="10" rx="5" fill="${BRAND.secondary}"/><rect x="220" width="78" height="10" rx="5" fill="${BRAND.accent}"/><text x="0" y="52" fill="${BRAND.muted}" font-size="18" font-weight="900" letter-spacing="1.8">SAME MEANING. NEW ENERGY.</text></g></g>${footer(copy)}`;
}

function layoutFor(archetype: GrowthCreativeArchetype, copy: CreativeCopy) {
  if (archetype === GrowthCreativeArchetype.BEFORE_AFTER || archetype === GrowthCreativeArchetype.CONVERSATION_CHAT) return beforeAfterLayout(copy, archetype);
  return minimalPosterLayout(copy, archetype);
}

export function buildCreativeSvg(archetype: GrowthCreativeArchetype, rawCopy: CreativeCopy) {
  const copy = creativeCopySchema.parse(rawCopy);
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${CREATIVE_WIDTH}" height="${CREATIVE_HEIGHT}" viewBox="0 0 ${CREATIVE_WIDTH} ${CREATIVE_HEIGHT}"><defs><clipPath id="safe-canvas"><rect width="1000" height="1500"/></clipPath></defs><g clip-path="url(#safe-canvas)" font-family="Nunito Sans, Arial, Helvetica, sans-serif">${layoutFor(archetype, copy)}</g></svg>`);
}

export async function renderDeterministicCreative(archetype: GrowthCreativeArchetype, rawCopy: CreativeCopy) {
  if (archetype === GrowthCreativeArchetype.V1_CONTROL) throw new Error("Renderer V1 control must be materialized through the share-image adapter.");
  getCreativeRendererDefinition(archetype);
  const copy = creativeCopySchema.parse(rawCopy);
  return sharp(buildCreativeSvg(archetype, copy), { density: 72 }).png().toBuffer();
}
