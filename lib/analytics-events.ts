declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
  }
}

function lengthBucket(length: number) {
  if (length <= 80) return "short";
  if (length <= 400) return "medium";
  return "long";
}

/**
 * Sends a GA4 event when a translation succeeds. Only the translator slug, mode,
 * direction and a coarse length bucket are sent, never the text itself. Safe to
 * call when GA4 is blocked or not loaded.
 */
export function trackTranslationCompleted(params: { translatorSlug: string; modeKey?: string; direction: string; inputLength: number }) {
  try {
    if (typeof window === "undefined" || typeof window.gtag !== "function") return;
    window.gtag("event", "translation_completed", {
      translator_slug: params.translatorSlug,
      mode: params.modeKey || "default",
      direction: params.direction,
      input_length: lengthBucket(params.inputLength),
    });
  } catch {
    // Analytics must never affect the translation flow.
  }
}
