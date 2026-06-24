import { useEffect, useMemo, useRef, useState } from 'react';
import './styles.css';
import { extractRoute, decodeSimple, decodeRich, encodeSimple } from './route/codec';
import { resolveStops, isPlayable } from './route/parse';
import { loadAirports } from './route/airports';
import type { AirportTable, Waypoint, RawStop } from './route/types';
import { createMapView, type MapView } from './map/mapview';
import { usePlayback } from './usePlayback';
import { tripTotals, formatDistance, formatDuration, type DistanceUnit } from './geo/legstats';
import { buildSharePath } from './route/share';

const UNITS: DistanceUnit[] = ['km', 'mi', 'nm'];
const isUnit = (v: string): v is DistanceUnit => (UNITS as string[]).includes(v);

// "19,432 km · 38h 10m flying · 6d 4h total" — distance always; times only when the route carries
// them. The elapsed "total" is dropped when it adds nothing over the flying time (no real layovers).
function totalSummary(waypoints: Waypoint[], units: DistanceUnit): string {
  const { distanceKm, airMs, elapsedMs } = tripTotals(waypoints);
  const parts = [formatDistance(distanceKm, units)];
  if (airMs !== null) parts.push(`${formatDuration(airMs)} flying`);
  if (elapsedMs !== null && (airMs === null || elapsedMs - airMs > 60_000)) {
    parts.push(`${formatDuration(elapsedMs)} total`);
  }
  return parts.join(' · ');
}

export default function App() {
  const mapRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<MapView | null>(null);
  const [table, setTable] = useState<AirportTable | null>(null);
  const [input, setInput] = useState('');
  const [waypoints, setWaypoints] = useState<Waypoint[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const [userMoved, setUserMoved] = useState(false);
  // Stops decoded from a rich `?d=` link. We show the friendly code form in the input but keep the
  // rich payload (embedded coords + dates for dwell) as the route source until the user edits it.
  const [richRaw, setRichRaw] = useState<RawStop[] | null>(null);
  const [units, setUnits] = useState<DistanceUnit>('km');
  const [copied, setCopied] = useState(false);
  const { frame, start, reset } = usePlayback(waypoints);

  // load airport table + map once
  useEffect(() => {
    loadAirports().then(setTable).catch(() => setError('Could not load airport data.'));
    if (mapRef.current && !viewRef.current) {
      viewRef.current = createMapView(mapRef.current);
      viewRef.current.onReady(() => setMapReady(true));
      viewRef.current.onUserInteract(() => setUserMoved(true));
    }
    return () => {
      viewRef.current?.destroy();
      viewRef.current = null;
    };
  }, []);

  // pre-fill from the URL once the table is ready
  useEffect(() => {
    if (!table) return;
    const search = window.location.search || window.location.hash.replace('#', '');
    // Honor a units preference from the link (e.g. &u=mi) so a shared/recorded route reproduces it.
    const u = new URLSearchParams(search).get('u');
    if (u && isUnit(u)) setUnits(u);
    const r = extractRoute(search);
    if (!r) return;
    if (r.form === 'rich') {
      // Show the friendly code form (e.g. "yyj-yvr-den") instead of the raw base64 blob, but keep
      // the decoded rich stops so the animation still uses the embedded coords + dwell dates.
      try {
        const raw = decodeRich(r.value);
        setRichRaw(raw);
        setInput(encodeSimple(raw));
      } catch {
        setInput(`?d=${r.value}`);
      }
    } else {
      setInput(r.value);
    }
  }, [table]);

  // resolve input -> waypoints whenever input or table changes
  const resolved = useMemo(() => {
    if (!table) return null;
    // While the input still matches the friendly form of a loaded rich route, resolve the rich
    // stops (embedded coords + dates) rather than re-parsing the lossy simple text.
    if (richRaw && input.trim() === encodeSimple(richRaw)) {
      return resolveStops(richRaw, table);
    }
    if (!input.trim()) return null;
    try {
      const r = extractRoute(input.trim());
      if (!r) return null;
      const raw: RawStop[] = r.form === 'rich' ? decodeRich(r.value) : decodeSimple(r.value);
      return resolveStops(raw, table);
    } catch (e) {
      return { waypoints: [], errors: [(e as Error).message] };
    }
  }, [input, table, richRaw]);

  useEffect(() => {
    if (resolved && isPlayable(resolved)) {
      setWaypoints(resolved.waypoints);
      setError(null);
      if (mapReady) viewRef.current?.setRoute(resolved.waypoints);
    } else {
      setWaypoints(null);
      setError(resolved?.errors[0] ?? null);
    }
  }, [resolved, mapReady]);

  // push frames to the map
  useEffect(() => {
    if (waypoints) viewRef.current?.renderFrame(frame, waypoints);
  }, [frame, waypoints]);

  // keep the map's leg chips in the chosen units
  useEffect(() => {
    if (mapReady) viewRef.current?.setUnits(units);
  }, [units, mapReady]);

  // Esc stops playback and returns to the input; the route stays drawn for a fresh start.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== 'Escape') return;
      reset();
      viewRef.current?.reset();
      setUserMoved(false);
      if (waypoints) viewRef.current?.setRoute(waypoints);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [waypoints, reset]);

  // States where the UI chrome hides for a clean recording.
  const recording = frame.state === 'countdown' || frame.state === 'lead'
    || frame.state === 'playing' || frame.state === 'tail';
  const canStart = !!resolved && isPlayable(resolved);
  // Offer a reset only when the user has manually panned/zoomed and we're not mid-recording.
  const showResetZoom = userMoved && (frame.state === 'idle' || frame.state === 'done');
  // Whole-trip total bookends the animation: shown on the intro/outro holds, hidden while flying.
  const showTotal = !!waypoints
    && (frame.state === 'idle' || frame.state === 'lead' || frame.state === 'tail' || frame.state === 'done');
  const total = useMemo(() => (waypoints ? totalSummary(waypoints, units) : ''), [waypoints, units]);

  function onStart() {
    viewRef.current?.reset();
    setUserMoved(false);
    if (waypoints) viewRef.current?.setRoute(waypoints);
    start();
  }
  function onNewTrip() {
    reset();
    viewRef.current?.reset();
    setUserMoved(false);
    setInput('');
  }
  function onReplay() {
    onStart();
  }
  function onResetZoom() {
    viewRef.current?.resetView();
    setUserMoved(false);
  }
  function toggleFullscreen() {
    if (!document.fullscreenElement) document.documentElement.requestFullscreen?.();
    else document.exitFullscreen?.();
  }
  function onShare() {
    const path = buildSharePath(richRaw, input, units);
    if (!path) return;
    const url = `${window.location.origin}${window.location.pathname}${path}`;
    navigator.clipboard?.writeText(url).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    });
  }

  return (
    <div className="app">
      <div className="map" ref={mapRef} />

      <a className="watermark" href="https://sailingnaturali.com" target="_blank" rel="noopener noreferrer">sailingnaturali.com</a>

      {showTotal && (
        <button
          className="trip-total"
          title="Click to change units (km / mi / nm)"
          onClick={() => setUnits((u) => UNITS[(UNITS.indexOf(u) + 1) % UNITS.length])}
        >
          {total}
        </button>
      )}

      {showResetZoom && (
        <button className="reset-zoom" onClick={onResetZoom}>Reset zoom</button>
      )}

      {!recording && frame.state !== 'done' && (
        <div className="controls">
          <input
            className="route-input"
            placeholder="sfo-lhr-cdg  (or paste a flight-animator URL)"
            value={input}
            onChange={(e) => setInput(e.target.value)}
          />
          <button className="btn primary" disabled={!canStart} onClick={onStart}>Start</button>
          <button className="btn" onClick={toggleFullscreen} aria-label="Fullscreen">⛶</button>
          {error && <div className="error">{error}</div>}
        </div>
      )}

      {frame.state === 'countdown' && (
        <div className="countdown">{Math.ceil(frame.countdownRemainingMs / 1000)}</div>
      )}

      {frame.state === 'done' && (
        <div className="controls done">
          <button className="btn primary" onClick={onReplay}>Replay</button>
          <button className="btn" onClick={onNewTrip}>New trip</button>
          <button className="btn" onClick={onShare}>{copied ? 'Copied!' : 'Share'}</button>
        </div>
      )}
    </div>
  );
}
