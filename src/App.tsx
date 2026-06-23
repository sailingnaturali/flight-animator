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
  const [mapReady, setMapReady] = useState(false);
  const [userMoved, setUserMoved] = useState(false);
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

  // States where the UI chrome hides for a clean recording.
  const recording = frame.state === 'countdown' || frame.state === 'lead'
    || frame.state === 'playing' || frame.state === 'tail';
  const canStart = !!resolved && isPlayable(resolved);
  // Offer a reset only when the user has manually panned/zoomed and we're not mid-recording.
  const showResetZoom = userMoved && (frame.state === 'idle' || frame.state === 'done');

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

  return (
    <div className="app">
      <div className="map" ref={mapRef} />

      <div className="watermark">sailingnaturali.com</div>

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
        </div>
      )}
    </div>
  );
}
