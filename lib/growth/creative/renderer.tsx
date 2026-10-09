import { GrowthCreativeArchetype } from "@prisma/client";
import sharp from "sharp";

import { CREATIVE_HEIGHT, CREATIVE_WIDTH, STATIC_RENDERER_DEFINITIONS, type CreativeDirection } from "@/lib/growth/creative/constants";
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

function controlledVariation(value?: number) {
  return Number.isInteger(value) && value! >= 0 && value! <= 2 ? value! : 0;
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
  return `<g data-element="footer"><line x1="70" y1="1250" x2="930" y2="1250" stroke="#D9DEDC" stroke-width="2" stroke-dasharray="8 11"/><text x="70" y="1300" fill="${BRAND.muted}" font-size="16" font-weight="900" letter-spacing="2.1">MAKE THE MESSAGE YOURS</text>${renderTextLines(cta, 70, 1364, `fill="${BRAND.ink}" font-weight="800"`)}<g data-element="cta-domain" transform="translate(690 1310)"><rect width="240" height="76" rx="24" fill="${BRAND.primary}"/><text x="120" y="38" fill="${BRAND.white}" font-size="24" font-weight="800" text-anchor="middle" dominant-baseline="middle">saytwist.com</text></g></g>`;
}

function minimalMotif(variant: number) {
  if (variant === 1) return `<path d="M735 260h207v248l-104-62-103 62Z" fill="#1A2942"/><rect x="810" y="317" width="82" height="82" rx="24" fill="${BRAND.accent}" transform="rotate(9 851 358)"/><circle cx="105" cy="1095" r="70" fill="${BRAND.secondary}" opacity=".18"/>`;
  if (variant === 2) return `<circle cx="847" cy="360" r="92" fill="${BRAND.secondary}"/><path d="M58 915c166-86 316 90 477 5s276-62 407 30v210H58Z" fill="#14213A"/><rect x="99" y="308" width="132" height="15" rx="7.5" fill="${BRAND.accent}"/>`;
  return `<path d="M720 260h222v226L828 438l-108 61Z" fill="#17243B"/><circle cx="852" cy="361" r="48" fill="${BRAND.secondary}"/><rect x="108" y="322" width="118" height="14" rx="7" fill="${BRAND.accent}"/>`;
}

function minimalPosterLayout(copy: CreativeCopy, variation?: number) {
  const variant = controlledVariation(variation);
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

function beforeAfterLayout(copy: CreativeCopy, variation?: number) {
  const variant = controlledVariation(variation);
  const headline = fitCreativeText(copy.headline, { maximumCharacters: CREATIVE_TEXT_LINE_LIMITS.SHOWCASE_HEADLINE.characters, maximumLines: CREATIVE_TEXT_LINE_LIMITS.SHOWCASE_HEADLINE.lines, maximumFontSize: 58, minimumFontSize: 44, availableWidth: 760, lineHeightRatio: 1.04 });
  const input = fitCreativeText(copy.exampleInput || "Can we talk about this later?", { maximumCharacters: CREATIVE_TEXT_LINE_LIMITS.EXAMPLE_INPUT.characters, maximumLines: CREATIVE_TEXT_LINE_LIMITS.EXAMPLE_INPUT.lines, maximumFontSize: 35, minimumFontSize: 28, availableWidth: 710, lineHeightRatio: 1.2 });
  const output = fitCreativeText(copy.exampleOutput || "Let's come back to this later and give it the attention it deserves.", { maximumCharacters: CREATIVE_TEXT_LINE_LIMITS.EXAMPLE_OUTPUT.characters, maximumLines: CREATIVE_TEXT_LINE_LIMITS.EXAMPLE_OUTPUT.lines, maximumFontSize: 38, minimumFontSize: 29, availableWidth: 680, lineHeightRatio: 1.18 });
  const headlineY = 344;
  const inputY = Math.max(485, textEndY(headline, headlineY) + 82);
  const inputHeight = Math.max(210, textBlockHeight(input) + 126);
  const outputY = inputY + inputHeight + 76;
  const outputHeight = Math.max(260, textBlockHeight(output) + 146);
  const inputX = variant === 1 ? 110 : 70;
  const outputX = variant === 2 ? 70 : 130;
  const proofY = Math.min(1165, outputY + outputHeight + 62);
  return `<rect width="1000" height="1500" fill="${BRAND.light}"/>${showcaseMotif(variant)}${wordmark()}${topicBadge(copy.topic)}<g data-layout="before-after-showcase" data-variant="${variant}"><text x="70" y="258" fill="${BRAND.secondary}" font-size="19" font-weight="900" letter-spacing="2">SEE THE TWIST IN ACTION</text>${renderTextLines(headline, 70, headlineY, `fill="${BRAND.ink}" font-weight="800"`)}<g data-element="before-card"><rect x="${inputX}" y="${inputY}" width="820" height="${inputHeight}" rx="32" fill="${BRAND.white}" stroke="#D6E3E1" stroke-width="3"/><text x="${inputX + 42}" y="${inputY + 56}" fill="${BRAND.muted}" font-size="17" font-weight="900" letter-spacing="2">BEFORE</text>${renderTextLines(input, inputX + 42, inputY + 126, `fill="${BRAND.ink}" font-weight="700"`)}</g><g data-element="transition" transform="translate(500 ${inputY + inputHeight + 38})"><circle r="34" fill="${BRAND.secondary}"/><text x="0" y="0" fill="${BRAND.white}" font-size="30" font-weight="900" text-anchor="middle" dominant-baseline="middle">↓</text></g><g data-element="after-card"><rect x="${outputX}" y="${outputY}" width="860" height="${outputHeight}" rx="34" fill="${BRAND.primary}"/><rect x="${outputX + 42}" y="${outputY + 34}" width="102" height="44" rx="14" fill="${BRAND.white}" opacity=".18"/><text x="${outputX + 60}" y="${outputY + 62}" fill="${BRAND.white}" font-size="17" font-weight="900" letter-spacing="2">AFTER</text>${renderTextLines(output, outputX + 48, outputY + 144, `fill="${BRAND.white}" font-weight="750"`)}</g><g transform="translate(70 ${proofY})"><rect width="204" height="10" rx="5" fill="${BRAND.secondary}"/><rect x="220" width="78" height="10" rx="5" fill="${BRAND.accent}"/><text x="0" y="52" fill="${BRAND.muted}" font-size="18" font-weight="900" letter-spacing="1.8">SAME MEANING. NEW ENERGY.</text></g></g>${footer(copy)}`;
}

function compositeFooter(copy: CreativeCopy, dark = false) {
  const cta = fitCreativeText(copy.cta, { maximumCharacters: 44, maximumLines: 1, maximumFontSize: 32, minimumFontSize: 25, availableWidth: 520 });
  const ink = dark ? BRAND.white : BRAND.ink;
  return `<g data-element="composite-footer"><text x="70" y="1364" fill="${ink}" font-size="18" font-weight="900" letter-spacing="2">YOUR WORDS. THIS ENERGY.</text>${renderTextLines(cta, 70, 1420, `fill="${ink}" font-weight="800"`)}<g data-element="cta-domain" transform="translate(674 1346)"><rect width="256" height="88" rx="28" fill="${dark ? BRAND.secondary : BRAND.primary}"/><text x="128" y="44" fill="${BRAND.white}" font-size="26" font-weight="800" text-anchor="middle" dominant-baseline="middle">saytwist.com</text></g></g>`;
}

const COMPOSITE_EXAMPLE_FIT: Record<CreativeDirection, {
  input: Pick<FitOptions, "maximumCharacters" | "maximumLines" | "minimumFontSize" | "availableWidth">;
  output: Pick<FitOptions, "maximumCharacters" | "maximumLines" | "minimumFontSize" | "availableWidth">;
}> = {
  EDITORIAL_SPLIT: {
    input: { maximumCharacters: 32, maximumLines: 4, minimumFontSize: 28, availableWidth: 624 },
    output: { maximumCharacters: 34, maximumLines: 6, minimumFontSize: 28, availableWidth: 674 },
  },
  CHAT_FOCUS: {
    input: { maximumCharacters: 31, maximumLines: 4, minimumFontSize: 28, availableWidth: 594 },
    output: { maximumCharacters: 33, maximumLines: 6, minimumFontSize: 28, availableWidth: 630 },
  },
  BOLD_POSTER: {
    input: { maximumCharacters: 36, maximumLines: 4, minimumFontSize: 30, availableWidth: 860 },
    output: { maximumCharacters: 36, maximumLines: 5, minimumFontSize: 29, availableWidth: 790 },
  },
  COLLAGE: {
    input: { maximumCharacters: 30, maximumLines: 4, minimumFontSize: 28, availableWidth: 585 },
    output: { maximumCharacters: 34, maximumLines: 6, minimumFontSize: 28, availableWidth: 686 },
  },
  MAGAZINE_FRAME: {
    input: { maximumCharacters: 36, maximumLines: 4, minimumFontSize: 30, availableWidth: 860 },
    output: { maximumCharacters: 34, maximumLines: 6, minimumFontSize: 29, availableWidth: 760 },
  },
};

export function fitCompositeExampleText(copy: CreativeCopy, direction: CreativeDirection) {
  const constraints = COMPOSITE_EXAMPLE_FIT[direction];
  return {
    input: fitCreativeText(copy.exampleInput!, { ...constraints.input, maximumFontSize: 36, lineHeightRatio: 1.18 }),
    output: fitCreativeText(copy.exampleOutput!, { ...constraints.output, maximumFontSize: 38, lineHeightRatio: 1.16 }),
  };
}

function centeredTextBaseline(text: FittedText, top: number, bottom: number) {
  const availableHeight = bottom - top;
  return Math.round(top + Math.max(0, (availableHeight - textBlockHeight(text)) / 2) + text.fontSize);
}

function compositeTexts(copy: CreativeCopy, direction: CreativeDirection, headlineWidth: number) {
  const examples = fitCompositeExampleText(copy, direction);
  return {
    headline: fitCreativeText(copy.headline, { maximumCharacters: headlineWidth, maximumLines: 3, maximumFontSize: 56, minimumFontSize: 38, availableWidth: headlineWidth * 25, lineHeightRatio: 1.05 }),
    ...examples,
  };
}

export function buildBeforeAfterOverlaySvg(rawCopy: CreativeCopy, direction: CreativeDirection) {
  const copy = creativeCopySchema.parse(rawCopy);
  if (!copy.exampleInput || !copy.exampleOutput) throw new Error("Before-and-after creative requires verified example evidence.");
  const { headline, input, output } = compositeTexts(copy, direction, 24);
  const textZones: Record<CreativeDirection, { input: [number, number]; output: [number, number] }> = {
    EDITORIAL_SPLIT: { input: [545, 710], output: [850, 1145] },
    CHAT_FOCUS: { input: [545, 710], output: [850, 1140] },
    BOLD_POSTER: { input: [560, 735], output: [850, 1145] },
    COLLAGE: { input: [550, 715], output: [850, 1145] },
    MAGAZINE_FRAME: { input: [535, 720], output: [850, 1145] },
  };
  const inputBaseline = centeredTextBaseline(input, ...textZones[direction].input);
  const outputBaseline = centeredTextBaseline(output, ...textZones[direction].output);
  const brand = `<g data-brand="text-wordmark"><text x="70" y="88" font-family="Fredoka, Trebuchet MS, sans-serif" font-size="44" font-weight="700"><tspan fill="${BRAND.ink}">Say</tspan><tspan fill="${BRAND.primary}">Twist</tspan></text></g>`;
  const kicker = `<text data-element="kicker" x="70" y="176" fill="${BRAND.secondary}" font-size="18" font-weight="900" letter-spacing="2.2">SEE THE TWIST IN ACTION</text>`;
  const layouts: Record<CreativeDirection, string> = {
    EDITORIAL_SPLIT: `<g data-layout="editorial-split"><path d="M0 0h650v1500H0z" fill="${BRAND.light}" opacity=".96"/><path d="M650 0h350v1500H650z" fill="${BRAND.ink}" opacity=".2"/>${brand}${kicker}${renderTextLines(headline, 70, 258, `fill="${BRAND.ink}" font-weight="800"`)}<g data-element="before-card"><rect x="70" y="450" width="700" height="285" rx="18" fill="${BRAND.white}" opacity=".95"/><text x="108" y="505" fill="${BRAND.muted}" font-size="19" font-weight="900" letter-spacing="2">BEFORE</text>${renderTextLines(input, 108, inputBaseline, `fill="${BRAND.ink}" font-weight="700"`)}</g><g data-element="after-card"><rect x="160" y="760" width="770" height="420" rx="34" fill="${BRAND.primary}"/><text x="208" y="820" fill="${BRAND.white}" font-size="19" font-weight="900" letter-spacing="2">AFTER</text>${renderTextLines(output, 208, outputBaseline, `fill="${BRAND.white}" font-weight="750"`)}</g>${compositeFooter(copy)}`,
    CHAT_FOCUS: `<g data-layout="chat-focus"><rect x="34" y="34" width="932" height="1432" rx="54" fill="${BRAND.light}" opacity=".91"/>${brand}${kicker}${renderTextLines(headline, 70, 258, `fill="${BRAND.ink}" font-weight="800"`)}<g data-element="before-card"><rect x="84" y="450" width="690" height="280" rx="54" fill="${BRAND.white}"/><path d="M150 730l-38 48 78-33" fill="${BRAND.white}"/><text x="132" y="505" fill="${BRAND.muted}" font-size="19" font-weight="900" letter-spacing="2">BEFORE</text>${renderTextLines(input, 132, inputBaseline, `fill="${BRAND.ink}" font-weight="700"`)}</g><g data-element="transition"><circle cx="840" cy="746" r="42" fill="${BRAND.secondary}"/><path d="m825 746 13 13 23-27" fill="none" stroke="white" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/></g><g data-element="after-card"><rect x="190" y="770" width="726" height="395" rx="58" fill="${BRAND.primaryDark}"/><path d="M850 1165l38 48-78-33" fill="${BRAND.primaryDark}"/><text x="238" y="830" fill="${BRAND.accent}" font-size="19" font-weight="900" letter-spacing="2">AFTER</text>${renderTextLines(output, 238, outputBaseline, `fill="${BRAND.white}" font-weight="750"`)}</g>${compositeFooter(copy)}`,
    BOLD_POSTER: `<g data-layout="bold-poster"><rect width="1000" height="1500" fill="${BRAND.ink}" opacity=".84"/><g transform="translate(0 0)"><text x="70" y="88" fill="${BRAND.white}" font-family="Fredoka, Trebuchet MS, sans-serif" font-size="44" font-weight="700">Say<tspan fill="${BRAND.primary}">Twist</tspan></text></g><text data-element="kicker" x="70" y="176" fill="${BRAND.accent}" font-size="18" font-weight="900" letter-spacing="2.2">SEE THE TWIST IN ACTION</text>${renderTextLines(headline, 70, 260, `fill="${BRAND.white}" font-weight="850"`)}<rect x="70" y="440" width="860" height="14" rx="7" fill="${BRAND.secondary}"/><g data-element="before-card"><text x="70" y="515" fill="${BRAND.accent}" font-size="19" font-weight="900" letter-spacing="2">BEFORE</text>${renderTextLines(input, 70, inputBaseline, `fill="${BRAND.white}" font-weight="650"`)}</g><g data-element="after-card"><rect x="52" y="755" width="896" height="425" rx="18" fill="${BRAND.light}"/><text x="105" y="820" fill="${BRAND.secondary}" font-size="19" font-weight="900" letter-spacing="2">AFTER</text>${renderTextLines(output, 105, outputBaseline, `fill="${BRAND.ink}" font-weight="800"`)}</g>${compositeFooter(copy, true)}`,
    COLLAGE: `<g data-layout="collage"><rect width="1000" height="1500" fill="${BRAND.warm}" opacity=".9"/><path d="M18 320 958 248l28 820-940 72z" fill="${BRAND.white}" opacity=".83"/><path d="M720 180h210v210H720z" fill="${BRAND.accent}" opacity=".65" transform="rotate(8 825 285)"/>${brand}${kicker}${renderTextLines(headline, 70, 262, `fill="${BRAND.ink}" font-weight="800"`)}<g data-element="before-card" transform="rotate(-2 390 600)"><rect x="72" y="455" width="665" height="285" rx="10" fill="${BRAND.white}" stroke="${BRAND.ink}" stroke-width="3"/><text x="112" y="515" fill="${BRAND.muted}" font-size="19" font-weight="900" letter-spacing="2">BEFORE</text>${renderTextLines(input, 112, inputBaseline, `fill="${BRAND.ink}" font-weight="700"`)}</g><g data-element="after-card" transform="rotate(1.5 560 970)"><rect x="150" y="760" width="790" height="420" rx="14" fill="${BRAND.primary}"/><text x="202" y="825" fill="${BRAND.white}" font-size="19" font-weight="900" letter-spacing="2">AFTER</text>${renderTextLines(output, 202, outputBaseline, `fill="${BRAND.white}" font-weight="750"`)}</g><circle cx="110" cy="1192" r="30" fill="${BRAND.secondary}"/>${compositeFooter(copy)}`,
    MAGAZINE_FRAME: `<g data-layout="magazine-frame"><rect x="42" y="42" width="916" height="1416" fill="${BRAND.light}" opacity=".9"/><rect x="58" y="58" width="884" height="1384" fill="none" stroke="${BRAND.ink}" stroke-width="3"/>${brand}<text x="930" y="88" text-anchor="end" fill="${BRAND.muted}" font-size="15" font-weight="900" letter-spacing="2">FIELD NOTE · 01</text>${kicker}${renderTextLines(headline, 70, 265, `fill="${BRAND.ink}" font-weight="800"`)}<line x1="70" y1="430" x2="930" y2="430" stroke="${BRAND.ink}" stroke-width="2"/><g data-element="before-card"><text x="70" y="500" fill="${BRAND.secondary}" font-size="19" font-weight="900" letter-spacing="2">BEFORE</text>${renderTextLines(input, 70, inputBaseline, `fill="${BRAND.ink}" font-weight="700"`)}</g><line x1="70" y1="745" x2="930" y2="745" stroke="${BRAND.ink}" stroke-width="2"/><g data-element="after-card"><rect x="70" y="760" width="860" height="420" fill="${BRAND.primaryDark}"/><text x="120" y="825" fill="${BRAND.accent}" font-size="19" font-weight="900" letter-spacing="2">AFTER</text>${renderTextLines(output, 120, outputBaseline, `fill="${BRAND.white}" font-weight="750"`)}</g>${compositeFooter(copy)}`,
  };
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${CREATIVE_WIDTH}" height="${CREATIVE_HEIGHT}" viewBox="0 0 ${CREATIVE_WIDTH} ${CREATIVE_HEIGHT}"><defs><clipPath id="safe-canvas"><rect width="1000" height="1500"/></clipPath></defs><g clip-path="url(#safe-canvas)" font-family="Nunito Sans, Arial, Helvetica, sans-serif">${layouts[direction]}</g></g></svg>`);
}

export async function compositeBeforeAfterCreative(base: Buffer, rawCopy: CreativeCopy, direction: CreativeDirection) {
  const normalized = await sharp(base).resize(CREATIVE_WIDTH, CREATIVE_HEIGHT, { fit: "cover", position: "centre" }).png().toBuffer();
  return sharp(normalized).composite([{ input: buildBeforeAfterOverlaySvg(rawCopy, direction), top: 0, left: 0 }]).png().toBuffer();
}

function layoutFor(archetype: GrowthCreativeArchetype, copy: CreativeCopy, variation?: number) {
  if (archetype === GrowthCreativeArchetype.BEFORE_AFTER) {
    if (!copy.exampleInput || !copy.exampleOutput) throw new Error("Before-and-after creative requires verified example evidence.");
    return beforeAfterLayout(copy, variation);
  }
  if (archetype === GrowthCreativeArchetype.CONVERSATION_CHAT) return beforeAfterLayout(copy, variation);
  return minimalPosterLayout(copy, variation);
}

export function buildCreativeSvg(archetype: GrowthCreativeArchetype, rawCopy: CreativeCopy, variation?: number) {
  const copy = creativeCopySchema.parse(rawCopy);
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${CREATIVE_WIDTH}" height="${CREATIVE_HEIGHT}" viewBox="0 0 ${CREATIVE_WIDTH} ${CREATIVE_HEIGHT}"><defs><clipPath id="safe-canvas"><rect width="1000" height="1500"/></clipPath></defs><g clip-path="url(#safe-canvas)" font-family="Nunito Sans, Arial, Helvetica, sans-serif">${layoutFor(archetype, copy, variation)}</g></svg>`);
}

export async function renderDeterministicCreative(archetype: GrowthCreativeArchetype, rawCopy: CreativeCopy, variation?: number) {
  if (archetype === GrowthCreativeArchetype.V1_CONTROL) throw new Error("Renderer V1 control must be materialized through the share-image adapter.");
  getCreativeRendererDefinition(archetype);
  const copy = creativeCopySchema.parse(rawCopy);
  return sharp(buildCreativeSvg(archetype, copy, variation), { density: 72 }).png().toBuffer();
}
