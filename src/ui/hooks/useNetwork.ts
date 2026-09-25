import { useCallback, useEffect, useState } from 'react';
import type { Network } from '../../domain/types';
import { fetchNetwork } from '../../sources/metrobusTimetable';

export const REFRESH_INTERVAL_MS = 6 * 60 * 60 * 1000;

interface NetworkState {
  network?: Network;
  error?: Error;
}

/** Stops and shapes, fetched on mount and every 6 hours. A failed refresh keeps the last good data. */
export function useNetwork(): NetworkState & { retry: () => void } {
  const [state, setState] = useState<NetworkState>({});
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const load = () => {
      fetchNetwork().then(
        (network) => {
          if (!cancelled) setState({ network });
        },
        (error: unknown) => {
          console.error(error);
          if (cancelled) return;
          setState((previous) => ({
            network: previous.network,
            error: error instanceof Error ? error : new Error(String(error)),
          }));
        },
      );
    };
    load();
    const timer = window.setInterval(load, REFRESH_INTERVAL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [attempt]);

  const retry = useCallback(() => {
    setState((previous) => ({ network: previous.network }));
    setAttempt((n) => n + 1);
  }, []);

  return { ...state, retry };
}
