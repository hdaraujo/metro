import { useCallback, useEffect, useState } from 'react';
import type { LatLng } from '../../domain/types';

export type GeolocationStatus = 'locating' | 'located' | 'unavailable';

export interface GeolocationState {
  status: GeolocationStatus;
  position?: LatLng;
  accuracy?: number;
}

const hasGeolocation = () => typeof navigator !== 'undefined' && 'geolocation' in navigator;
const initialState = (): GeolocationState => ({
  status: hasGeolocation() ? 'locating' : 'unavailable',
});

const OPTIONS: PositionOptions = { enableHighAccuracy: true, maximumAge: 10_000, timeout: 15_000 };

/** Watches the device position. Any error (denied, unavailable, timeout before a fix) means `unavailable`. */
export function useGeolocation(): GeolocationState & { retry: () => void } {
  const [state, setState] = useState<GeolocationState>(initialState);
  // Bumping the attempt restarts the watch.
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!hasGeolocation()) return;
    const id = navigator.geolocation.watchPosition(
      ({ coords }) =>
        setState({
          status: 'located',
          position: { lat: coords.latitude, lng: coords.longitude },
          accuracy: coords.accuracy,
        }),
      (error) =>
        setState((previous) =>
          // A timeout after a fix keeps the last known position.
          error.code === error.TIMEOUT && previous.status === 'located'
            ? previous
            : { status: 'unavailable' },
        ),
      OPTIONS,
    );
    return () => navigator.geolocation.clearWatch(id);
  }, [attempt]);

  const retry = useCallback(() => {
    setState(initialState());
    setAttempt((n) => n + 1);
  }, []);

  return { ...state, retry };
}
