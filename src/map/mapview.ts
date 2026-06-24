import maplibregl from 'maplibre-gl';
import type * as GeoJSON from 'geojson';
import 'maplibre-gl/dist/maplibre-gl.css';
import type { Waypoint } from '../route/types';
import type { Frame } from '../play/controller';
import { interpolate, unwrapLongitude, distanceKm } from '../geo/greatcircle';
import { formatDistance, formatDuration, legFlightMs, type DistanceUnit } from '../geo/legstats';

const DARK_STYLE = 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json';
// Google-nav style: the not-yet-flown path is blue, the flown path behind the plane is gray.
const AHEAD = '#4287f5';
const BEHIND = '#9aa0a6';
const PATH_WIDTH = 3.5;

function arcLine(a: Waypoint, b: Waypoint, upTo = 1): [number, number][] {
  const pts: [number, number][] = [];
  const steps = 64;
  let prevLon: number | null = null;
  for (let i = 0; i <= steps; i++) {
    const f = (i / steps) * upTo;
    const p = interpolate(a, b, f);
    // Unwrap longitude so an antimeridian (±180°) crossing stays continuous instead of
    // jumping ~360° and drawing a horizontal line across the map. MapLibre renders the
    // out-of-range longitudes correctly across the seam.
    const lon: number = prevLon === null ? p.lon : unwrapLongitude(p.lon, prevLon);
    prevLon = lon;
    pts.push([lon, p.lat]);
  }
  return pts;
}

export interface MapView {
  onReady(cb: () => void): void;
  onUserInteract(cb: () => void): void;
  setUnits(unit: DistanceUnit): void;
  setRoute(waypoints: Waypoint[]): void;
  renderFrame(frame: Frame, waypoints: Waypoint[]): void;
  resetView(): void;
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
  let planeGlyphEl: HTMLElement | null = null;
  let planeMarker: maplibregl.Marker | null = null;
  const labelMarkers: maplibregl.Marker[] = [];
  // Per-leg "distance · time" chips, indexed by the leg's from-index. Revealed progressively.
  const legLabelMarkers: maplibregl.Marker[] = [];
  let units: DistanceUnit = 'km';
  let currentRoute: Waypoint[] = [];
  // What the camera is currently framed on ('whole' route or a leg index), so we move it once per
  // transition instead of every frame. A manual user pan/zoom clears it so the next state re-frames.
  let framed: 'whole' | number | null = null;

  function ensureSources() {
    if (!map.getSource('full')) {
      map.addSource('full', { type: 'geojson', data: emptyFc() });
      map.addLayer({ id: 'full', type: 'line', source: 'full', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': AHEAD, 'line-width': PATH_WIDTH } });
    }
    if (!map.getSource('trail')) {
      map.addSource('trail', { type: 'geojson', data: emptyFc() });
      map.addLayer({ id: 'trail', type: 'line', source: 'trail', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': BEHIND, 'line-width': PATH_WIDTH } });
    }
    if (!map.getSource('dots')) {
      map.addSource('dots', { type: 'geojson', data: emptyFc() });
      map.addLayer({ id: 'dots', type: 'circle', source: 'dots', paint: { 'circle-radius': 4, 'circle-color': '#fff', 'circle-stroke-color': AHEAD, 'circle-stroke-width': 1.5 } });
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
    // Unwrap each stop's longitude along the route so a Pacific-spanning trip frames the
    // shorter span (centered on the Pacific) instead of the long way around the globe.
    const b = new maplibregl.LngLatBounds();
    let prevLon: number | null = null;
    for (const w of wps) {
      const lon: number = prevLon === null ? w.lon : unwrapLongitude(w.lon, prevLon);
      prevLon = lon;
      b.extend([lon, w.lat]);
    }
    map.fitBounds(b, { padding: 80, duration: 900 });
    framed = 'whole';
  }

  // Midpoint of the bowed great-circle arc (already longitude-unwrapped), where the leg chip sits.
  function arcMidpoint(a: Waypoint, b: Waypoint): [number, number] {
    const arc = arcLine(a, b);
    return arc[Math.floor(arc.length / 2)];
  }

  function legLabelText(wps: Waypoint[], i: number): string {
    const dist = formatDistance(distanceKm(wps[i], wps[i + 1]), units);
    const ms = legFlightMs(wps[i], wps[i + 1]);
    return ms === null ? dist : `${dist} · ${formatDuration(ms)}`;
  }

  function clearLegLabels() {
    legLabelMarkers.forEach((m) => m?.remove());
    legLabelMarkers.length = 0;
  }

  // Frame a single leg so it fills the screen; bounds cover the bowed great-circle arc, not just endpoints.
  function fitLeg(a: Waypoint, b: Waypoint) {
    const bounds = new maplibregl.LngLatBounds();
    arcLine(a, b).forEach((c) => bounds.extend(c));
    map.fitBounds(bounds, { padding: 120, duration: 1400, maxZoom: 6 });
  }

  return {
    onReady(cb) {
      map.on('load', cb);
    },
    onUserInteract(cb) {
      // Only fire for user-driven moves (drag/scroll/pinch) — programmatic eases have no originalEvent.
      map.on('movestart', (e) => {
        if ((e as { originalEvent?: unknown }).originalEvent) {
          framed = null;
          cb();
        }
      });
    },
    setUnits(unit) {
      units = unit;
      // Re-label any leg chips already on the map so the toggle updates live.
      legLabelMarkers.forEach((m, i) => {
        if (m) m.getElement().textContent = legLabelText(currentRoute, i);
      });
    },
    resetView() {
      if (currentRoute.length) fitWhole(currentRoute);
    },
    setRoute(wps) {
      if (!map.isStyleLoaded()) return;
      currentRoute = wps;
      ensureSources();
      (map.getSource('full') as maplibregl.GeoJSONSource).setData(fullRouteFc(wps));
      (map.getSource('dots') as maplibregl.GeoJSONSource).setData(dotsFc(wps));
      (map.getSource('trail') as maplibregl.GeoJSONSource).setData(emptyFc());
      labelMarkers.forEach((m) => m.remove());
      labelMarkers.length = 0;
      clearLegLabels();
      fitWhole(wps);
    },
    renderFrame(frame, wps) {
      if (!map.isStyleLoaded()) return;
      ensureSources();
      // trail: all completed legs solid, plus partial active leg
      const feats: GeoJSON.Feature[] = [];
      const arrived = new Set(frame.arrivedIndices);
      for (let i = 0; i < wps.length - 1; i++) {
        if (arrived.has(i + 1)) {
          feats.push({ type: 'Feature', geometry: { type: 'LineString', coordinates: arcLine(wps[i], wps[i + 1]) }, properties: {} });
        }
      }
      if (frame.activeLegIndex !== null && frame.activeLegFraction !== null) {
        const a = wps[frame.activeLegIndex];
        const b = wps[frame.activeLegIndex + 1];
        feats.push({ type: 'Feature', geometry: { type: 'LineString', coordinates: arcLine(a, b, frame.activeLegFraction) }, properties: {} });
      }
      (map.getSource('trail') as maplibregl.GeoJSONSource).setData({ type: 'FeatureCollection', features: feats });

      // per-leg distance · time chips at the arc midpoint, revealed once a leg is active or flown.
      for (let i = 0; i < wps.length - 1; i++) {
        const revealed = frame.activeLegIndex === i || frame.arrivedIndices.includes(i + 1);
        if (revealed && !legLabelMarkers[i]) {
          const el = document.createElement('div');
          el.className = 'leg-label';
          el.textContent = legLabelText(wps, i);
          legLabelMarkers[i] = new maplibregl.Marker({ element: el, anchor: 'center' })
            .setLngLat(arcMidpoint(wps[i], wps[i + 1])).addTo(map);
        }
      }

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

      // plane marker. MapLibre owns the marker element's transform (translate to position
      // it), so we rotate an inner glyph instead — writing rotate() onto the marker element
      // itself would clobber the translate and the plane would vanish whenever the camera is idle.
      if (frame.plane) {
        if (!planeMarker) {
          planeEl = document.createElement('div');
          planeEl.className = 'plane';
          planeGlyphEl = document.createElement('span');
          planeGlyphEl.className = 'plane-glyph';
          // U+FE0E forces text (monochrome) presentation so our CSS color applies instead of an emoji glyph.
          planeGlyphEl.textContent = '✈︎';
          planeEl.appendChild(planeGlyphEl);
          planeMarker = new maplibregl.Marker({ element: planeEl }).setLngLat([frame.plane.lon, frame.plane.lat]).addTo(map);
        }
        planeMarker.setLngLat([frame.plane.lon, frame.plane.lat]);
        // The ✈ glyph points up (north) at 0°; subtract 90° to align it with the great-circle bearing convention where 0° = east.
        if (planeGlyphEl) planeGlyphEl.style.transform = `rotate(${frame.plane.bearing - 90}deg)`;
      }

      // camera: whole-route view at idle/lead/done; zoom to fill the screen per leg while flying;
      // hold the current framing during dwell and the tail pause. Each move fires once per transition.
      if (frame.state === 'idle' || frame.state === 'lead' || frame.state === 'done') {
        if (framed !== 'whole') fitWhole(wps);
      } else if (frame.state === 'playing' && frame.activeLegIndex !== null) {
        if (framed !== frame.activeLegIndex) {
          framed = frame.activeLegIndex;
          fitLeg(wps[frame.activeLegIndex], wps[frame.activeLegIndex + 1]);
        }
      }
    },
    reset() {
      framed = null;
      if (map.getSource('trail')) (map.getSource('trail') as maplibregl.GeoJSONSource).setData(emptyFc());
      labelMarkers.forEach((m) => m.remove());
      labelMarkers.length = 0;
      clearLegLabels();
      if (planeMarker) { planeMarker.remove(); planeMarker = null; planeEl = null; planeGlyphEl = null; }
    },
    destroy() {
      map.remove();
    },
  };
}

