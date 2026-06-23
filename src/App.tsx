import { useEffect, useMemo, useRef, useState } from 'react';
import './styles.css';
import { extractRoute, decodeSimple, decodeRich } from './route/codec';
import { resolveStops, isPlayable } from './route/parse';
import { loadAirports } from './route/airports';
import type { AirportTable, Waypoint, RawStop } from './route/types';
import { createMapView, type MapView } from './map/mapview';
import { usePlayback } from './usePlayback';

export default function App() {
  const mapRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<MapView | null>(null);
  const [table, setTable] = useState<AirportTable | null>(null);
  const [input, setInput] = useState('');
  const [waypoints, setWaypoints] = useState<Waypoint[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { frame, start, reset } = usePlayback(waypoints);

  // load airport table + map once
  useEffect(() => {
    loadAirports().then(setTable).catch(() => setError('Could not load airport data.'));
    if (mapRef.current && !viewRef.current) {
      viewRef.current = createMapView(mapRef.current);
    }
  }, []);

  // pre-fill from the URL once the table is ready
  useEffect(() => {
    if (!table) return;
    const r = extractRoute(window.location.search || window.location.hash.replace('#', ''));
    if (r) setInput(r.form === 'rich' ? `?d=${r.value}` : r.value);
  }, [table]);

  // resolve input -> waypoints whenever input or table changes
  const resolved = useMemo(() => {
    if (!table || !input.trim()) return null;
    try {
      const r = extractRoute(input.trim());
      if (!r) return null;
      const raw: RawStop[] = r.form === 'rich' ? decodeRich(r.value) : decodeSimple(r.value);
      return resolveStops(raw, table);
    } catch (e) {
      return { waypoints: [], errors: [(e as Error).message] };
    }
  }, [input, table]);

  useEffect(() => {
    if (resolved && isPlayable(resolved)) {
      setWaypoints(resolved.waypoints);
      setError(null);
      viewRef.current?.onReady(() => viewRef.current?.setRoute(resolved.waypoints));
      viewRef.current?.setRoute(resolved.waypoints);
    } else {
      setWaypoints(null);
      setError(resolved?.errors[0] ?? null);
    }
  }, [resolved]);

  // push frames to the map
  useEffect(() => {
    if (waypoints) viewRef.current?.renderFrame(frame, waypoints);
  }, [frame, waypoints]);

  const playing = frame.state === 'countdown' || frame.state === 'playing';
  const canStart = !!resolved && isPlayable(resolved);

  function onStart() {
    viewRef.current?.reset();
    if (waypoints) viewRef.current?.setRoute(waypoints);
    start();
  }
  function onNewTrip() {
    reset();
    viewRef.current?.reset();
    setInput('');
  }
  function onReplay() {
    onStart();
  }
  function toggleFullscreen() {
    if (!document.fullscreenElement) document.documentElement.requestFullscreen?.();
    else document.exitFullscreen?.();
  }

  return (
    <div className="app">
      <div className="map" ref={mapRef} />

      {!playing && frame.state !== 'done' && (
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
        </div>
      )}
    </div>
  );
}
