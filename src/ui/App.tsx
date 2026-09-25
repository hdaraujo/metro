import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { PaddingOptions } from 'maplibre-gl';
import { lisbonClock } from '../domain/lisbonTime';
import { nearestApproachingBus } from '../domain/nearestBus';
import { nearestStop } from '../domain/nearestStop';
import { measureShape } from '../domain/shape';
import type { LatLng } from '../domain/types';
import { Attribution } from './chrome/Attribution';
import { LocateButton } from './chrome/LocateButton';
import { Wordmark } from './chrome/Wordmark';
import { useGeolocation } from './hooks/useGeolocation';
import { useMediaQuery } from './hooks/useMediaQuery';
import { useNetwork } from './hooks/useNetwork';
import { useNow } from './hooks/useNow';
import { useTimetable } from './hooks/useTimetable';
import { MapView, type MapHandle } from './map/MapView';
import { DataErrorContent } from './sheet/DataErrorContent';
import { LocatingContent } from './sheet/LocatingContent';
import { LocationOffContent } from './sheet/LocationOffContent';
import { NearestStopContent } from './sheet/NearestStopContent';
import { Sheet } from './sheet/Sheet';

const DESKTOP_QUERY = '(min-width: 768px)';
const DESKTOP_PANEL_WIDTH = 380;
/** How long the first automatic framing waits for the timetable before framing without the bus. */
const BUS_WAIT_MS = 3000;

export function App() {
  const desktop = useMediaQuery(DESKTOP_QUERY);
  const geo = useGeolocation();
  const { network, error: networkError, retry: retryNetwork } = useNetwork();
  const now = useNow(5000);
  const { tripsByDayType, loading: tripsLoading } = useTimetable(network, now);

  const stopsById = useMemo(() => new Map(network?.stops.map((s) => [s.id, s])), [network]);
  const shapesById = useMemo(
    () => new Map(network?.shapes.map((s) => [s.id, measureShape(s)])),
    [network],
  );

  const position = geo.status === 'located' ? (geo.position ?? null) : null;
  const nearest = useMemo(
    () => (network && position ? nearestStop(network.stops, position) : null),
    [network, position],
  );
  // Re-estimated on every tick of `now`, without any network call.
  const bus = useMemo(
    () =>
      nearest
        ? nearestApproachingBus({
            stop: nearest.stop,
            clock: lisbonClock(now),
            tripsByDayType,
            shapesById,
            stopsById,
            now,
          })
        : null,
    [nearest, now, tripsByDayType, shapesById, stopsById],
  );

  // ---------- Smart zoom ----------
  const mapRef = useRef<MapHandle>(null);
  const sheetRef = useRef<HTMLElement>(null);

  const fit = useCallback(() => {
    if (!position || !nearest) return;
    const points: LatLng[] = [position, nearest.stop.coords];
    if (bus) points.push(bus.coords);
    const padding: PaddingOptions = desktop
      ? { top: 64, right: 96, bottom: 64, left: 24 + DESKTOP_PANEL_WIDTH + 48 }
      : { top: 72, left: 40, right: 80, bottom: (sheetRef.current?.offsetHeight ?? 0) + 48 };
    mapRef.current?.fitTo(points, padding);
  }, [position, nearest, bus, desktop]);

  const readyToFit = position !== null && nearest !== null;
  const [busWaitOver, setBusWaitOver] = useState(false);
  useEffect(() => {
    if (!readyToFit) return;
    const timer = window.setTimeout(() => setBusWaitOver(true), BUS_WAIT_MS);
    return () => window.clearTimeout(timer);
  }, [readyToFit]);

  // Frame the map once, automatically; later position updates never refit on their own.
  const autoFitted = useRef(false);
  useEffect(() => {
    if (autoFitted.current || !readyToFit || (tripsLoading && !busWaitOver)) return;
    autoFitted.current = true;
    fit();
  }, [readyToFit, tripsLoading, busWaitOver, fit]);

  // ---------- Sheet content ----------
  let label: string;
  let busy = false;
  let content: ReactNode;
  if (geo.status === 'locating') {
    label = 'Finding your location';
    busy = true;
    content = <LocatingContent />;
  } else if (geo.status === 'unavailable') {
    label = 'Location unavailable';
    content = <LocationOffContent onRetry={geo.retry} />;
  } else if (!network && networkError) {
    label = 'Stops unavailable';
    content = <DataErrorContent onRetry={retryNetwork} />;
  } else if (!network || !nearest) {
    label = 'Finding your nearest stop';
    busy = true;
    content = <LocatingContent title="Finding your nearest stop…" />;
  } else {
    label = 'Nearest stop';
    content = (
      <NearestStopContent
        stop={nearest.stop}
        distanceMeters={nearest.distanceMeters}
        lineColors={network.lineColors}
        bus={bus}
        fetchedAt={network.fetchedAt}
        now={now}
      />
    );
  }

  const locate = (
    <LocateButton
      status={geo.status}
      onRecentre={fit}
      onRetry={geo.retry}
      className={desktop ? 'desktop-locate' : ''}
    />
  );

  return (
    <div className="app" data-layout={desktop ? 'desktop' : 'phone'}>
      <MapView
        ref={mapRef}
        network={network}
        user={position}
        nearestStop={nearest?.stop ?? null}
        bus={bus}
        lineColors={network?.lineColors ?? {}}
      />
      {desktop ? (
        <>
          <Sheet ref={sheetRef} variant="panel" label={label} busy={busy}>
            {content}
          </Sheet>
          {locate}
          <Attribution className="desktop-attribution" />
        </>
      ) : (
        <>
          <Wordmark />
          <div className="bottom-stack">
            <div className="controls-row">
              <Attribution />
              {locate}
            </div>
            <Sheet ref={sheetRef} variant="phone" label={label} busy={busy}>
              {content}
            </Sheet>
          </div>
        </>
      )}
    </div>
  );
}
