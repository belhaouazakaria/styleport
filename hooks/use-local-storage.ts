"use client";

import { useCallback, useMemo, useSyncExternalStore } from "react";

/**
 * Backwards-compatible localStorage hook with SayTwist migration.
 *
 * Legacy `styleport:` keys are intentionally preserved solely for
 * backwards-compatible migration of existing user data. When the new
 * `saytwist:` key is empty, we check the corresponding legacy key
 * and migrate it forward.
 */
function readFromStorage<T>(key: string, initialValue: T): T {
  if (typeof window === "undefined") {
    return initialValue;
  }

  try {
    const raw = window.localStorage.getItem(key);
    if (raw) {
      return JSON.parse(raw) as T;
    }

    // Backwards-compatible migration: check legacy styleport: prefix
    // Only used for keys that were previously stored under styleport: namespace
    if (key.startsWith("saytwist:")) {
      const legacyKey = key.replace("saytwist:", "styleport:");
      const legacyRaw = window.localStorage.getItem(legacyKey);
      if (legacyRaw) {
        window.localStorage.setItem(key, legacyRaw);
        window.localStorage.removeItem(legacyKey);
        return JSON.parse(legacyRaw) as T;
      }
    }
  } catch {
    return initialValue;
  }

  return initialValue;
}

export function useLocalStorage<T>(key: string, initialValue: T): [T, (value: T) => void] {
  const stableInitial = useMemo(() => initialValue, [initialValue]);
  const eventName = `saytwist-storage:${key}`;
  const subscribe = useCallback((onStoreChange: () => void) => {
    const onStorage = () => onStoreChange();
    window.addEventListener("storage", onStorage);
    window.addEventListener(eventName, onStorage);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(eventName, onStorage);
    };
  }, [eventName]);
  const getSnapshot = useCallback(() => readFromStorage(key, stableInitial), [key, stableInitial]);
  const getServerSnapshot = useCallback(() => stableInitial, [stableInitial]);
  const value = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const setValue = useCallback((nextValue: T) => {
    try {
      window.localStorage.setItem(key, JSON.stringify(nextValue));
      window.dispatchEvent(new Event(eventName));
    } catch {
      // Ignore storage write errors.
    }
  }, [eventName, key]);

  return [value, setValue];
}
