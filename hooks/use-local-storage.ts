"use client";

import { useEffect, useMemo, useState } from "react";

function readFromStorage<T>(key: string, initialValue: T): T {
  if (typeof window === "undefined") {
    return initialValue;
  }

  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) {
      return initialValue;
    }

    return JSON.parse(raw) as T;
  } catch {
    return initialValue;
  }
}

export function useLocalStorage<T>(key: string, initialValue: T): [T, (value: T) => void] {
  const stableInitial = useMemo(() => initialValue, [initialValue]);
  const [value, setValue] = useState<T>(() => readFromStorage(key, stableInitial));

  useEffect(() => {
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // Ignore storage write errors.
    }
  }, [key, value]);

  return [value, setValue];
}
