import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { PaddingOptions } from 'maplibre-gl';
import { approachingBuses, busesInService, soonestPerDirection } from '../domain/buses';
import { directionsAtStop, nextDirectionFilter, type DirectionFilter } from '../domain/directions';
import { haversineMeters } from '../domain/geo';
import { lisbonClock } from '../domain/lisbonTime';
import { nearestStop } from '../domain/nearestStop';
import { measureShape } from '../domain/shape';
import type { LatLng, Stop } from '../domain/types';
import { Attribution } from './chrome/Attribution';
import { LocateButton } from './chrome/LocateButton';
import { Wordmark } from './chrome/Wordmark';
import { useGeolocation } from './hooks/useGeolocation';
import { useMediaQuery } from './hooks/useMediaQuery';
import { useNetwork } from './hooks/useNetwork';
import { useNow } from './hooks/useNow';
import { useTimetable } from './hooks/useTimetable';
import { MapView, type MapHandle } from './map/MapView';
import type { StopKind } from './map/markers';
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
  const now = useNow(1000);
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
  const nearestId = nearest?.stop.id ?? null;

  // ---------- Selected stop ----------
  // A stop the user tapped on the map, held by id so that a network refresh cannot leave it stale.
  // Not persisted, like `sheetCollapsed`. The nearest stop is never shown as "selected".
  const [selectedStopId, setSelectedStopId] = useState<string | null>(null);
  const selected: Stop | null =
    selectedStopId !== null && selectedStopId !== nearestId
      ? (stopsById.get(selectedStopId) ?? null)
      : null;
  // The stop that the sheet, the stop marker, the countdowns and the smart zoom all follow.
  const stop = selected ?? nearest?.stop ?? null;

  // Every bus in service, re-estimated on every tick of `now` without any network call. With no
  // stop shown (no location and nothing selected), the buses are shown without countdowns.
  const buses = useMemo(
    () =>
      busesInService({
        stop,
        clock: lisbonClock(now),
        tripsByDayType,
        shapesById,
        stopsById,
        now,
      }),
    [stop, now, tripsByDayType, shapesById, stopsById],
  );
  const approaching = useMemo(() => approachingBuses(buses), [buses]);
  const framedBuses = useMemo(() => soonestPerDirection(approaching), [approaching]);

  // ---------- Direction filter (the sheet's list only; the map always shows every bus) ----------
  // Keyed on the stop's id, since `nearest` is a new object on every position update.
  const stopId = stop?.id ?? null;
  const directions = useMemo(
    () => (stopId ? directionsAtStop(stopId, [...tripsByDayType.values()].flat()) : []),
    [stopId, tripsByDayType],
  );
  // Tied to the stop it was chosen at, so it falls back to both directions when the stop changes.
  // Not persisted, like `sheetCollapsed`.
  const [directionChoice, setDirectionChoice] = useState<{
    stopId: string;
    filter: DirectionFilter;
  } | null>(null);
  const directionFilter: DirectionFilter =
    directions.length === 2 && directionChoice?.stopId === stopId ? directionChoice.filter : 'both';
  const cycleDirection = useCallback(() => {
    if (stopId) setDirectionChoice({ stopId, filter: nextDirectionFilter(directionFilter) });
  }, [stopId, directionFilter]);

  // ---------- Smart zoom ----------
  const mapRef = useRef<MapHandle>(null);
  const sheetRef = useRef<HTMLElement>(null);

  const fit = useCallback(() => {
    // The soonest approaching bus in each direction is framed, never every bus in service.
    const busPoints = framedBuses.map((b) => b.coords);
    let points: LatLng[];
    if (selected) {
      // The selected view leaves the user out, as if they were standing at the stop.
      points = [selected.coords, ...busPoints];
    } else if (position && nearest) {
      points = [position, nearest.stop.coords, ...busPoints];
    } else {
      return;
    }
    const padding: PaddingOptions = desktop
      ? { top: 64, right: 96, bottom: 64, left: 24 + DESKTOP_PANEL_WIDTH + 48 }
      : { top: 72, left: 40, right: 80, bottom: (sheetRef.current?.offsetHeight ?? 0) + 48 };
    mapRef.current?.fitTo(points, padding);
  }, [selected, position, nearest, framedBuses, desktop]);

  // Framing is requested rather than called, so that it runs in the render that already has the
  // new stop's buses.
  const [fitRequest, setFitRequest] = useState(0);
  const handledFit = useRef(0);
  useEffect(() => {
    if (fitRequest === handledFit.current) return;
    handledFit.current = fitRequest;
    fit();
  }, [fitRequest, fit]);

  const readyToFit = position !== null && nearest !== null;
  const [busWaitOver, setBusWaitOver] = useState(false);
  useEffect(() => {
    if (!readyToFit) return;
    const timer = window.setTimeout(() => setBusWaitOver(true), BUS_WAIT_MS);
    return () => window.clearTimeout(timer);
  }, [readyToFit]);

  // Frame the map once, automatically; later position updates never refit on their own. The
  // user's own framing (selecting a stop, the locate button) counts as the first one.
  const autoFitted = useRef(false);
  const noSelection = selected === null;
  useEffect(() => {
    if (autoFitted.current || !noSelection || !readyToFit || (tripsLoading && !busWaitOver)) {
      return;
    }
    autoFitted.current = true;
    fit();
  }, [noSelection, readyToFit, tripsLoading, busWaitOver, fit]);

  const requestFit = useCallback(() => {
    autoFitted.current = true;
    setFitRequest((n) => n + 1);
  }, []);

  // A tap on the map: the tapped stop's id, or null for empty map.
  const selectStop = useCallback(
    (id: string | null) => {
      if (id !== null) {
        // The nearest stop goes back to the default view. Any other stop is framed, again if it
        // was already selected, since the map may have been panned since.
        setSelectedStopId(id === nearestId ? null : id);
        requestFit();
        return;
      }
      if (selected === null) return;
      setSelectedStopId(null);
      // Without a location there is no default view, so the camera stays where it is.
      if (nearestId !== null) requestFit();
    },
    [nearestId, selected, requestFit],
  );

  const recentre = useCallback(() => {
    setSelectedStopId(null);
    requestFit();
  }, [requestFit]);

  // ---------- Sheet content ----------
  // Minimising is phone only; the desktop panel never collapses. The state is not persisted.
  const [sheetCollapsed, setSheetCollapsed] = useState(false);
  const collapsed = !desktop && sheetCollapsed;

  const stopContent = (kind: StopKind, shown: Stop, distanceMeters: number | null) =>
    network && (
      <NearestStopContent
        stop={shown}
        kind={kind}
        distanceMeters={distanceMeters}
        lineColors={network.lineColors}
        approaching={approaching}
        directions={directions}
        directionFilter={directionFilter}
        onCycleDirection={cycleDirection}
        fetchedAt={network.fetchedAt}
        now={now}
        collapsed={collapsed}
      />
    );

  let label: string;
  let busy = false;
  let content: ReactNode;
  if (network && selected) {
    label = 'Selected stop';
    content = stopContent(
      'selected',
      selected,
      position ? haversineMeters(position, selected.coords) : null,
    );
  } else if (geo.status === 'locating') {
    label = 'Finding your location';
    busy = true;
    content = <LocatingContent collapsed={collapsed} />;
  } else if (geo.status === 'unavailable') {
    label = 'Location unavailable';
    content = <LocationOffContent onRetry={geo.retry} collapsed={collapsed} />;
  } else if (!network && networkError) {
    label = 'Stops unavailable';
    content = <DataErrorContent onRetry={retryNetwork} collapsed={collapsed} />;
  } else if (!network || !nearest) {
    label = 'Finding your nearest stop';
    busy = true;
    content = <LocatingContent title="Finding your nearest stop…" collapsed={collapsed} />;
  } else {
    label = 'Nearest stop';
    content = stopContent('nearest', nearest.stop, nearest.distanceMeters);
  }

  const locate = (
    <LocateButton
      status={geo.status}
      onRecentre={recentre}
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
        stop={stop}
        stopKind={selected ? 'selected' : 'nearest'}
        buses={buses}
        stopName={stop?.name ?? null}
        lineColors={network?.lineColors ?? {}}
        onSelectStop={selectStop}
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
            <Sheet
              ref={sheetRef}
              variant="phone"
              label={label}
              busy={busy}
              collapsed={collapsed}
              onCollapsedChange={setSheetCollapsed}
            >
              {content}
            </Sheet>
          </div>
        </>
      )}
    </div>
  );
}
