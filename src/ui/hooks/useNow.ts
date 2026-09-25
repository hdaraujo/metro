import { useEffect, useState } from 'react';

/** The current time, updated every `intervalMs`. */
export function useNow(intervalMs = 5000): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), intervalMs);
    return () => window.clearInterval(timer);
  }, [intervalMs]);
  return now;
}
