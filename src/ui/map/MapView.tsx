import 'maplibre-gl/dist/maplibre-gl.css';
import {
  LngLatBounds,
  Map as MapLibreMap,
  Marker,
  setWorkerUrl,
  type GeoJSONSource,
  type MarkerOptions,
  type PaddingOptions,
} from 'maplibre-gl';
// MapLibre 6 loads its worker from a separate module next to its own file, which a bundle does not
// have; let Vite build the worker and point MapLibre at it.
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import type { FeatureCollection } from 'geojson';
import { useEffect, useImperativeHandle, useRef, useState, type Ref } from 'react';
import type { BusPosition, LatLng, LineId, Network, Stop } from '../../domain/types';
import { prefersReducedMotion } from '../hooks/useMediaQuery';
import { mapStyle } from './mapStyle';
import {
  createBusMarker,
  createStopMarker,
  type BusMarkerView,
  createUserMarker,
  updateBusMarker,
  updateStopMarker,
} from './markers';

setWorkerUrl(workerUrl);

/** Coimbra, where the map opens before the user's position is known. */
const INITIAL_CENTER: [number, number] = [-8.4196, 40.2056];
const INITIAL_ZOOM = 13;
const FALLBACK_LINE_COLOR = '#1f5fa8';

export interface MapHandle {
  /** Frames `points` inside the map, leaving `padding` (in pixels) clear for the UI chrome. */
  fitTo(points: readonly LatLng[], padding: PaddingOptions): void;
}

interface MapViewProps {
  ref?: Ref<MapHandle>;
  network?: Network;
  user: LatLng | null;
  nearestStop: Stop | null;
  /** Every bus in service; each gets its own marker. */
  buses: readonly BusPosition[];
  /** The selected stop's name, which the approaching buses count down to. */
  stopName: string | null;
  lineColors: Record<LineId, string>;
}

const toLngLat = (p: LatLng): [number, number] => [p.lng, p.lat];

function routesGeoJson(network: Network): FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: network.shapes.map((shape) => ({
      type: 'Feature',
      properties: { id: shape.id, color: shape.color },
      geometry: { type: 'LineString', coordinates: shape.points.map(toLngLat) },
    })),
  };
}

function stopsGeoJson(network: Network): FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: network.stops.map((stop) => ({
      type: 'Feature',
      properties: { id: stop.id, name: stop.name },
      geometry: { type: 'Point', coordinates: toLngLat(stop.coords) },
    })),
  };
}

function showNetwork(map: MapLibreMap, network: Network) {
  const routes = map.getSource<GeoJSONSource>('routes');
  const stops = map.getSource<GeoJSONSource>('stops');
  if (routes && stops) {
    void routes.setData(routesGeoJson(network));
    void stops.setData(stopsGeoJson(network));
    return;
  }
  map.addSource('routes', { type: 'geojson', data: routesGeoJson(network) });
  map.addSource('stops', { type: 'geojson', data: stopsGeoJson(network) });
  map.addLayer({
    id: 'routes',
    type: 'line',
    source: 'routes',
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': ['get', 'color'], 'line-width': 4 },
  });
  map.addLayer({
    id: 'stops',
    type: 'circle',
    source: 'stops',
    paint: {
      'circle-radius': 4.5,
      'circle-color': '#ffffff',
      'circle-stroke-color': '#2c313a',
      'circle-stroke-width': 2,
    },
  });
}

/** Keeps one DOM marker in sync with `value`: created, moved/updated, or removed. */
function useMarker<T>(
  map: MapLibreMap | null,
  value: T | null,
  coords: LatLng | null,
  create: (value: T) => HTMLElement,
  update: ((el: HTMLElement, value: T) => void) | null,
  options: MarkerOptions,
) {
  const marker = useRef<Marker | null>(null);
  useEffect(() => {
    if (!map || value === null || coords === null) {
      marker.current?.remove();
      marker.current = null;
      return;
    }
    if (marker.current) {
      update?.(marker.current.getElement(), value);
      marker.current.setLngLat(toLngLat(coords));
    } else {
      marker.current = new Marker({ ...options, element: create(value) })
        .setLngLat(toLngLat(coords))
        .addTo(map);
    }
    // `options`, `create` and `update` are fixed per call site.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, value, coords]);
}

const USER_MARKER: MarkerOptions = { anchor: 'center' };
const STOP_MARKER: MarkerOptions = { anchor: 'center' };
// Centre the bus pill (about 28px tall) on the position; the "Scheduled" tag hangs below it.
const BUS_MARKER: MarkerOptions = { anchor: 'top', offset: [0, -14] };

function busMarkerView(
  bus: BusPosition,
  lineColors: Record<LineId, string>,
  stopName: string | null,
): BusMarkerView {
  return {
    line: bus.line,
    color: lineColors[bus.line] ?? FALLBACK_LINE_COLOR,
    destination: bus.destination,
    secondsToStop: bus.arrivalAtStopSeconds,
    stopName,
    dimmed: stopName !== null && bus.arrivalAtStopSeconds === null,
  };
}

/** Keeps one DOM marker per bus, keyed by trip: created, moved/updated, or removed. */
function useBusMarkers(
  map: MapLibreMap | null,
  buses: readonly BusPosition[],
  lineColors: Record<LineId, string>,
  stopName: string | null,
) {
  const markers = useRef(new Map<string, Marker>());
  useEffect(() => {
    const current = markers.current;
    if (!map) {
      for (const marker of current.values()) marker.remove();
      current.clear();
      return;
    }
    const seen = new Set<string>();
    for (const bus of buses) {
      seen.add(bus.tripId);
      const view = busMarkerView(bus, lineColors, stopName);
      const marker = current.get(bus.tripId);
      if (marker) {
        updateBusMarker(marker.getElement(), view);
        marker.setLngLat(toLngLat(bus.coords));
      } else {
        current.set(
          bus.tripId,
          new Marker({ ...BUS_MARKER, element: createBusMarker(view) })
            .setLngLat(toLngLat(bus.coords))
            .addTo(map),
        );
      }
    }
    for (const [tripId, marker] of current) {
      if (seen.has(tripId)) continue;
      marker.remove();
      current.delete(tripId);
    }
  }, [map, buses, lineColors, stopName]);

  useEffect(() => {
    const current = markers.current;
    return () => {
      for (const marker of current.values()) marker.remove();
      current.clear();
    };
  }, []);
}

export function MapView({
  ref,
  network,
  user,
  nearestStop,
  buses,
  stopName,
  lineColors,
}: MapViewProps) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  // Set once the style has loaded; layers and markers wait for it.
  const [map, setMap] = useState<MapLibreMap | null>(null);

  useEffect(() => {
    if (!container.current) return;
    let instance: MapLibreMap;
    try {
      instance = new MapLibreMap({
        container: container.current,
        style: mapStyle,
        center: INITIAL_CENTER,
        zoom: INITIAL_ZOOM,
        attributionControl: false,
        dragRotate: false,
        touchPitch: false,
        pitchWithRotate: false,
      });
    } catch (error) {
      // Without WebGL the map cannot start; the sheet still works.
      console.error('The map could not be started', error);
      return;
    }
    instance.touchZoomRotate.disableRotation();
    instance.keyboard.disableRotation();
    mapRef.current = instance;
    instance.once('load', () => setMap(instance));
    return () => {
      mapRef.current = null;
      setMap(null);
      instance.remove();
    };
  }, []);

  useEffect(() => {
    if (map && network) showNetwork(map, network);
  }, [map, network]);

  useImperativeHandle(
    ref,
    () => ({
      fitTo(points, padding) {
        const instance = mapRef.current;
        if (!instance || points.length === 0) return;
        const bounds = new LngLatBounds();
        for (const p of points) bounds.extend(toLngLat(p));
        instance.fitBounds(bounds, {
          padding,
          maxZoom: 17,
          duration: prefersReducedMotion() ? 0 : 800,
        });
      },
    }),
    [],
  );

  useMarker(map, user, user, createUserMarker, null, USER_MARKER);
  useMarker(
    map,
    nearestStop,
    nearestStop?.coords ?? null,
    (stop) => createStopMarker(stop.name),
    (el, stop) => updateStopMarker(el, stop.name),
    STOP_MARKER,
  );
  useBusMarkers(map, buses, lineColors, stopName);

  return <div ref={container} className="map" />;
}
