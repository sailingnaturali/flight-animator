import { useEffect, useRef, useState } from 'react';
import type { Waypoint } from './route/types';
import { buildPlan } from './geo/timeline';
import { createPlayback, type Frame } from './play/controller';

const IDLE_FRAME: Frame = {
  state: 'idle',
  countdownRemainingMs: 0,
  plane: null,
  activeLegIndex: null,
  activeLegFraction: null,
  arrivedIndices: [],
};

export function usePlayback(waypoints: Waypoint[] | null) {
  const [frame, setFrame] = useState<Frame>(IDLE_FRAME);
  const pbRef = useRef<ReturnType<typeof createPlayback> | null>(null);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    pbRef.current = waypoints ? createPlayback(buildPlan(waypoints), waypoints) : null;
    setFrame(IDLE_FRAME);
    return () => cancelAnimationFrame(rafRef.current);
  }, [waypoints]);

  function loop() {
    const pb = pbRef.current;
    if (!pb) return;
    const f = pb.frameAt(performance.now());
    setFrame(f);
    if (f.state !== 'done') rafRef.current = requestAnimationFrame(loop);
  }

  return {
    frame,
    start() {
      pbRef.current?.start(performance.now());
      rafRef.current = requestAnimationFrame(loop);
    },
    reset() {
      cancelAnimationFrame(rafRef.current);
      pbRef.current?.reset();
      setFrame(IDLE_FRAME);
    },
  };
}
