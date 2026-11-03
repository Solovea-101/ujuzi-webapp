'use client';

import { useEffect, useState } from 'react';

/** Seconds left until `seconds` from the moment it was set; 0 when done. Set it to null to stop. */
export function useCountdown(seconds: number | null): number {
  const [left, setLeft] = useState(0);
  useEffect(() => {
    if (!seconds || seconds <= 0) {
      setLeft(0);
      return;
    }
    const end = Date.now() + seconds * 1000;
    setLeft(seconds);
    const timer = setInterval(() => {
      const remaining = Math.ceil((end - Date.now()) / 1000);
      setLeft(Math.max(0, remaining));
      if (remaining <= 0) clearInterval(timer);
    }, 250);
    return () => clearInterval(timer);
  }, [seconds]);
  return left;
}
