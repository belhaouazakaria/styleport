let invalidator: (() => void) | null = null;

export function registerPublicTranslatorCacheInvalidator(callback: () => void) {
  invalidator = callback;
}

export function invalidatePublicTranslatorCaches() {
  invalidator?.();
}

