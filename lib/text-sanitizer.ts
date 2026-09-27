export const EM_DASH_CHARACTER = "\u2014";

export const EM_DASH_PROHIBITION_INSTRUCTION =
  `Never use em dashes. Do not use the character ${EM_DASH_CHARACTER} under any circumstances. Rewrite the sentence using commas, periods, colons, semicolons, or parentheses instead.`;

const EM_DASH_PATTERN = /[ \t]*\u2014[ \t]*/g;

/**
 * Rewrites em dashes as sentence punctuation instead of swapping in another dash.
 * The surrounding text determines whether a period or comma reads more naturally.
 */
export function sanitizeGeneratedString(value: string): string {
  if (!value.includes(EM_DASH_CHARACTER)) return value;

  return value.replace(EM_DASH_PATTERN, (match, offset: number, source: string) => {
    const before = source.slice(0, offset);
    const after = source.slice(offset + match.length);
    const previous = before.at(-1) || "";
    const next = after.match(/^[ \t]*(\S)/)?.[1] || "";

    if (!previous) return "";
    if (!next) return /[.!?;:,]$/.test(previous) ? "" : ".";
    if (/[.!?;:,([{]$/.test(previous)) return " ";
    if (/^[.!?;:,)\]}]/.test(next)) return "";
    if (/\d/.test(previous) && /\d/.test(next)) return "-";

    const punctuation = /^[A-Z]/.test(next) ? "." : ",";
    return `${punctuation} `;
  });
}

/** Recursively sanitizes strings in JSON-like generated payloads. */
export function sanitizeGeneratedText<T>(value: T): T {
  if (typeof value === "string") return sanitizeGeneratedString(value) as T;
  if (Array.isArray(value)) return value.map((item) => sanitizeGeneratedText(item)) as T;
  if (value && typeof value === "object") {
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) return value;
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, sanitizeGeneratedText(item)]),
    ) as T;
  }
  return value;
}

export function containsEmDash(value: unknown): boolean {
  if (typeof value === "string") return value.includes(EM_DASH_CHARACTER);
  if (Array.isArray(value)) return value.some(containsEmDash);
  if (value && typeof value === "object") return Object.values(value).some(containsEmDash);
  return false;
}

export function assertNoEmDash(value: unknown, context = "Generated public-facing content"): void {
  if (containsEmDash(value)) {
    throw new Error(`${context} contains forbidden em dash characters.`);
  }
}
