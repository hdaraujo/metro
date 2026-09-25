import type { StyleSpecification } from 'maplibre-gl';

export const OSM_TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';

/**
 * OpenStreetMap raster tiles, muted towards the design's calm base (#f1f0eb land, white roads,
 * #cad9e5 water) so that route colours and markers stand out. No glyphs or sprites: every label is
 * a DOM marker.
 */
export const mapStyle: StyleSpecification = {
  version: 8,
  sources: {
    osm: {
      type: 'raster',
      tiles: [OSM_TILE_URL],
      tileSize: 256,
      maxzoom: 19,
    },
  },
  layers: [
    { id: 'background', type: 'background', paint: { 'background-color': '#f1f0eb' } },
    {
      id: 'osm',
      type: 'raster',
      source: 'osm',
      paint: {
        'raster-saturation': -0.75,
        'raster-contrast': -0.15,
        'raster-brightness-min': 0.15,
        'raster-brightness-max': 1,
      },
    },
  ],
};
