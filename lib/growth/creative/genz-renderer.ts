import sharp from "sharp";
import type { Font, GlyphRun } from "fontkit";
import { GENZ_LAYOUT, effectiveGenZStroke, genzHeadline, genzTypographySchema, type GenZTypography } from "./genz-editorial";
import type { UprightFont } from "./genz-font";
import { validateCreativePng } from "./storage";

export interface GenZHeadlineLayout { lines: string[]; fontSize: number; strokeWidth: number; lineHeight: number; bounds: { left: number; top: number; right: number; bottom: number }; svg: string }
function measure(font: Font, text: string, size: number, runs = new Map<string, GlyphRun>()) {
  const run = runs.get(text) ?? font.layout(text);
  runs.set(text, run);
  if (run.glyphs.some(g => g.id === 0)) throw Error("UPRIGHT_GLYPH_UNSUPPORTED_NO_FALLBACK");
  const scale = size / font.unitsPerEm;
  return { run, scale, width: (run.bbox.maxX - run.bbox.minX) * scale, minX: run.bbox.minX * scale, top: -run.bbox.maxY * scale, bottom: -run.bbox.minY * scale };
}
function wrap(font: Font, words: string[], size: number, maximumLines: number, width: number, runs: Map<string, GlyphRun>): string[] | null {
  const memo = new Map<string, { lines: string[]; score: number } | null>();
  function visit(start: number, left: number): { lines: string[]; score: number } | null {
    if (start === words.length) return { lines: [], score: 0 };
    if (!left) return null;
    const key = start + ":" + left;
    if (memo.has(key)) return memo.get(key)!;
    let best: { lines: string[]; score: number } | null = null;
    for (let end = start + 1; end <= words.length; end++) {
      const line = words.slice(start, end).join(" ");
      const measured = measure(font, line, size, runs).width;
      if (measured > width) break;
      const tail = visit(end, left - 1);
      if (!tail) continue;
      const score = tail.score + (width - measured) ** 2 + (tail.lines.length ? 1000 : 0);
      if (!best || score < best.score) best = { lines: [line, ...tail.lines], score };
    }
    memo.set(key, best); return best;
  }
  return visit(0, maximumLines)?.lines ?? null;
}
export function layoutGenZHeadline(title: string, upright: UprightFont, raw: Partial<GenZTypography> = {}): GenZHeadlineLayout {
  const config = genzTypographySchema.parse(raw), text = genzHeadline(title), words = text.split(" ");
  if (words.length > 40) throw Error("GENZ_HEADLINE_TOO_LONG");
  // Reject unsupported code points before planning or paying for photography.
  const runs = new Map<string, GlyphRun>();
  measure(upright.font, text, 170, runs);
  for (let size = 170; size >= 64; size -= 2) {
    const stroke = effectiveGenZStroke(size, config.strokeWidthPercent);
    const lines = wrap(upright.font, words, size, 4, GENZ_LAYOUT.headlineMaxWidth - stroke, runs);
    if (!lines) continue;
    const metrics = lines.map(line => measure(upright.font, line, size, runs));
    const lineHeight = Math.max(size * GENZ_LAYOUT.lineSpacingMultiplier, ...metrics.map(m => m.bottom - m.top + stroke + 5));
    const height = Math.max(...metrics.map((m, i) => i * lineHeight + m.bottom)) - Math.min(...metrics.map((m, i) => i * lineHeight + m.top)) + stroke;
    if (height > 670) continue;
    const bottom = height <= GENZ_LAYOUT.headlineRegionEndY - GENZ_LAYOUT.headlineRegionStartY
      ? (GENZ_LAYOUT.headlineRegionStartY + GENZ_LAYOUT.headlineRegionEndY + height) / 2
      : GENZ_LAYOUT.headlineRegionEndY;
    const baseline = bottom - stroke / 2 - Math.max(...metrics.map((m, i) => i * lineHeight + m.bottom));
    let left = 1000, right = 0; const glyphs: string[] = [];
    for (let line = 0; line < lines.length; line++) {
      const m = metrics[line], x = (1000 - m.width) / 2 - m.minX;
      left = Math.min(left, (1000 - m.width) / 2 - stroke / 2); right = Math.max(right, (1000 + m.width) / 2 + stroke / 2);
      let penX = 0, penY = 0;
      m.run.glyphs.forEach((glyph, i) => {
        const p = m.run.positions[i];
        glyphs.push(`<path transform="translate(${x.toFixed(3)} ${(baseline + line * lineHeight).toFixed(3)}) scale(${m.scale} ${-m.scale}) translate(${penX + p.xOffset} ${penY + p.yOffset})" d="${glyph.path.toSVG()}"/>`);
        penX += p.xAdvance; penY += p.yAdvance;
      });
    }
    const top = bottom - height;
    if (left < 70 - 0.01 || right > 930 + 0.01 || top < 700 || bottom > 1410) continue;
    // Paths use the actual font's contours. Two complete passes keep all black
    // strokes BEHIND all white fills, without system-font substitution.
    const paths = glyphs.join("");
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="1500" viewBox="0 0 1000 1500"><defs><g id="headline">${paths}</g></defs><use href="#headline" fill="none" stroke="#000000" stroke-width="${stroke / metrics[0].scale}" stroke-linejoin="round" paint-order="stroke fill"/><use href="#headline" fill="#FFFFFF"/></svg>`;
    return { lines, fontSize: size, strokeWidth: stroke, lineHeight, bounds: { left, top, right, bottom }, svg };
  }
  throw Error("GENZ_HEADLINE_CANNOT_FIT_WITHOUT_CLIPPING");
}
export async function compositeGenZEditorial(background: Buffer, title: string, font: UprightFont, raw: Partial<GenZTypography> = {}) {
  const config = genzTypographySchema.parse(raw), layout = layoutGenZHeadline(title, font, config);
  const pipeline = sharp(background, { limitInputPixels: 40_000_000 }).rotate().resize(1000, 1500, { fit: "cover", position: "attention" }).composite([{ input: Buffer.from(layout.svg) }]);
  const png = await pipeline.clone().png().toBuffer(); validateCreativePng(png);
  const webp = await pipeline.clone().webp({ quality: config.webpQuality, effort: 5 }).toBuffer();
  return { png, webp, layout, fontChecksum: font.checksum, config };
}
