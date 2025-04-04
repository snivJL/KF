"use client";

import { useEffect, useState } from "react";

/**
 * Debounce a value after a delay.
 *
 * @param value Value to debounce
 * @param delay Delay in milliseconds (default 300ms)
 * @returns Debounced value
 */
export function useDebounce<T>(value: T, delay = 300): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const handler = setTimeout(() => setDebouncedValue(value), delay);

    return () => clearTimeout(handler);
  }, [value, delay]);

  return debouncedValue;
}
