import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import type { Waypoint } from '../route/types';
import type { Frame } from '../play/controller';
import { interpolate } from '../geo/greatcircle';

const DARK_STYLE = 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json';
const ARC = '#ff5a4d';

function arcLine(a: Waypoint, b: Waypoint, upTo = 1): [number, number][] {
  const pts: [number, number][] = [];
  const steps = 64;
  for (let i = 0; i <= steps; i++) {
    const f = (i / steps) * upTo;
    const p = interpolate(a, b, f);
    pts.push([p.lon, p.lat]);
  }
  return pts;
}

export interface MapView {
  onReady(cb: () => void): void;
  setRoute(waypoints: Waypoint[]): void;
  renderFrame(frame: Frame, waypoints: Waypoint[]): void;
  reset(): void;
  destroy(): void;
}

export function createMapView(container: HTMLElement): MapView {
  const map = new maplibregl.Map({
    container,
    style: DARK_STYLE,
    center: [0, 20],
    zoom: 1.4,
    attributionControl: { compact: true },
  });

  let planeEl: HTMLDivElement | null = null;
  let planeMarker: maplibregl.Marker | null = null;
  const labelMarkers: maplibregl.Marker[] = [];

  function ensureSources() {
    if (!map.getSource('full')) {
      map.addSource('full', { type: 'geojson', data: emptyFc() });
      map.addLayer({ id: 'full', type: 'line', source: 'full', paint: { 'line-color': ARC, 'line-opacity': 0.25, 'line-width': 1.5 } });
    }
    if (!map.getSource('trail')) {
      map.addSource('trail', { type: 'geojson', data: emptyFc() });
      map.addLayer({ id: 'trail', type: 'line', source: 'trail', paint: { 'line-color': ARC, 'line-width': 2.5 } });
    }
    if (!map.getSource('dots')) {
      map.addSource('dots', { type: 'geojson', data: emptyFc() });
      map.addLayer({ id: 'dots', type: 'circle', source: 'dots', paint: { 'circle-radius': 4, 'circle-color': '#fff', 'circle-stroke-color': ARC, 'circle-stroke-width': 1.5 } });
    }
  }

  function emptyFc(): GeoJSON.FeatureCollection {
    return { type: 'FeatureCollection', features: [] };
  }

  function fullRouteFc(wps: Waypoint[]): GeoJSON.FeatureCollection {
    const features = wps.slice(0, -1).map((a, i) => ({
      type: 'Feature' as const,
      geometry: { type: 'LineString' as const, coordinates: arcLine(a, wps[i + 1]) },
      properties: {},
    }));
    return { type: 'FeatureCollection', features };
  }

  function dotsFc(wps: Waypoint[]): GeoJSON.FeatureCollection {
    return {
      type: 'FeatureCollection',
      features: wps.map((w) => ({
        type: 'Feature' as const,
        geometry: { type: 'Point' as const, coordinates: [w.lon, w.lat] },
        properties: {},
      })),
    };
  }

  function fitWhole(wps: Waypoint[]) {
    const b = new maplibregl.LngLatBounds();
    wps.forEach((w) => b.extend([w.lon, w.lat]));
    map.fitBounds(b, { padding: 80, duration: 600 });
  }

  return {
    onReady(cb) {
      map.on('load', cb);
    },
    setRoute(wps) {
      ensureSources();
      (map.getSource('full') as maplibregl.GeoJSONSource).setData(fullRouteFc(wps));
      (map.getSource('dots') as maplibregl.GeoJSONSource).setData(dotsFc(wps));
      (map.getSource('trail') as maplibregl.GeoJSONSource).setData(emptyFc());
      labelMarkers.forEach((m) => m.remove());
      labelMarkers.length = 0;
      fitWhole(wps);
    },
    renderFrame(frame, wps) {
      ensureSources();
      // trail: all completed legs solid, plus partial active leg
      const feats: GeoJSON.Feature[] = [];
      const arrived = new Set(frame.arrivedIndices);
      for (let i = 0; i < wps.length - 1; i++) {
        if (arrived.has(i + 1)) {
          feats.push({ type: 'Feature', geometry: { type: 'LineString', coordinates: arcLine(wps[i], wps[i + 1]) }, properties: {} });
        }
      }
      if (frame.activeLegIndex !== null && frame.plane) {
        const a = wps[frame.activeLegIndex];
        const b = wps[frame.activeLegIndex + 1];
        // approximate fraction from plane distance is unnecessary; redraw whole arc faintly handled by 'full'
        feats.push({ type: 'Feature', geometry: { type: 'LineString', coordinates: arcLineToPlane(a, b, frame.plane) }, properties: {} });
      }
      (map.getSource('trail') as maplibregl.GeoJSONSource).setData({ type: 'FeatureCollection', features: feats });

      // labels for arrived stops
      for (const i of frame.arrivedIndices) {
        if (!labelMarkers[i]) {
          const el = document.createElement('div');
          el.className = 'stop-label';
          el.textContent = wps[i].label + (wps[i].arrive ? ` · ${wps[i].arrive.slice(0, 10)}` : '');
          labelMarkers[i] = new maplibregl.Marker({ element: el, anchor: 'left', offset: [8, 0] })
            .setLngLat([wps[i].lon, wps[i].lat]).addTo(map);
        }
      }

      // plane marker
      if (frame.plane) {
        if (!planeMarker) {
          planeEl = document.createElement('div');
          planeEl.className = 'plane';
          planeEl.textContent = '✈';
          planeMarker = new maplibregl.Marker({ element: planeEl }).setLngLat([frame.plane.lon, frame.plane.lat]).addTo(map);
        }
        planeMarker.setLngLat([frame.plane.lon, frame.plane.lat]);
        if (planeEl) planeEl.style.transform = `rotate(${frame.plane.bearing - 90}deg)`;
      }

      // camera follow the active leg
      if (frame.state === 'playing' && frame.activeLegIndex !== null) {
        const a = wps[frame.activeLegIndex];
        const b = wps[frame.activeLegIndex + 1];
        const mid = interpolate(a, b, 0.5);
        map.easeTo({ center: [mid.lon, mid.lat], duration: 300 });
      }
      if (frame.state === 'done') fitWhole(wps);
    },
    reset() {
      ensureSources();
      (map.getSource('trail') as maplibregl.GeoJSONSource).setData(emptyFc());
      labelMarkers.forEach((m) => m.remove());
      labelMarkers.length = 0;
      if (planeMarker) { planeMarker.remove(); planeMarker = null; planeEl = null; }
    },
    destroy() {
      map.remove();
    },
  };
}

function arcLineToPlane(a: Waypoint, b: Waypoint, plane: { lat: number; lon: number }): [number, number][] {
  // draw the arc and append the plane position as the live endpoint
  const pts = arcLine(a, b);
  pts.push([plane.lon, plane.lat]);
  return pts;
}
