import type { TimedPlan } from '../geo/timeline';
import type { Waypoint } from '../route/types';
import { interpolate, bearing } from '../geo/greatcircle';

export type PlaybackState = 'idle' | 'countdown' | 'lead' | 'playing' | 'tail' | 'done';

export interface Frame {
  state: PlaybackState;
  countdownRemainingMs: number;
  plane: { lat: number; lon: number; bearing: number } | null;
  activeLegIndex: number | null;
  activeLegFraction: number | null;
  arrivedIndices: number[];
}

export interface Playback {
  start(nowMs: number): void;
  reset(): void;
  frameAt(nowMs: number): Frame;
}

function idleFrame(): Frame {
  return {
    state: 'idle',
    countdownRemainingMs: 0,
    plane: null,
    activeLegIndex: null,
    activeLegFraction: null,
    arrivedIndices: [],
  };
}

export function createPlayback(
  plan: TimedPlan,
  waypoints: Waypoint[],
  opts: { countdownMs?: number; leadHoldMs?: number; tailHoldMs?: number } = {},
): Playback {
  const countdownMs = opts.countdownMs ?? 3000;
  // Quiet beat at the whole-route view after the countdown, before the first leg zooms in.
  const leadHoldMs = opts.leadHoldMs ?? 2000;
  // Hold on the final leg after the plane lands, before zooming back out to the whole route.
  const tailHoldMs = opts.tailHoldMs ?? 3000;
  let startTs: number | null = null;

  // arrival time (ms into leg playback) for each waypoint index
  const arrivalAt: number[] = [0];
  for (const p of plan.phases) {
    if (p.type === 'leg') arrivalAt[p.toIndex] = p.startMs + p.durMs;
  }

  function arrivedBy(legMs: number): number[] {
    const out: number[] = [];
    for (let i = 0; i < waypoints.length; i++) {
      if (arrivalAt[i] !== undefined && legMs >= arrivalAt[i]) out.push(i);
    }
    return out;
  }

  const allArrived = () => waypoints.map((_, i) => i);

  return {
    start(nowMs: number) {
      startTs = nowMs;
    },
    reset() {
      startTs = null;
    },
    frameAt(nowMs: number): Frame {
      if (startTs === null) return idleFrame();
      const elapsed = nowMs - startTs;
      if (elapsed < countdownMs) {
        return { ...idleFrame(), state: 'countdown', countdownRemainingMs: countdownMs - elapsed };
      }
      const playMs = elapsed - countdownMs;

      // lead hold: whole-route view, plane parked at the origin, no labels yet
      if (playMs < leadHoldMs) {
        const first = waypoints[0];
        return { ...idleFrame(), state: 'lead', plane: { lat: first.lat, lon: first.lon, bearing: 0 } };
      }

      const legMs = playMs - leadHoldMs;
      if (legMs >= plan.totalMs) {
        const last = waypoints[waypoints.length - 1];
        const tailMs = legMs - plan.totalMs;
        // tail hold: keep the final leg framed before zooming out
        const state: PlaybackState = tailMs < tailHoldMs ? 'tail' : 'done';
        return {
          state,
          countdownRemainingMs: 0,
          plane: { lat: last.lat, lon: last.lon, bearing: 0 },
          activeLegIndex: null,
          activeLegFraction: null,
          arrivedIndices: allArrived(),
        };
      }

      const phase = plan.phases.find((p) => legMs >= p.startMs && legMs < p.startMs + p.durMs)!;
      if (phase.type === 'leg') {
        const a = waypoints[phase.fromIndex];
        const b = waypoints[phase.toIndex];
        const f = (legMs - phase.startMs) / phase.durMs;
        const pos = interpolate(a, b, f);
        return {
          state: 'playing',
          countdownRemainingMs: 0,
          plane: { lat: pos.lat, lon: pos.lon, bearing: bearing(a, b, f) },
          activeLegIndex: phase.fromIndex,
          activeLegFraction: f,
          arrivedIndices: arrivedBy(legMs),
        };
      }
      // dwell: plane parked at the stop
      const at = waypoints[phase.atIndex];
      return {
        state: 'playing',
        countdownRemainingMs: 0,
        plane: { lat: at.lat, lon: at.lon, bearing: 0 },
        activeLegIndex: null,
        activeLegFraction: null,
        arrivedIndices: arrivedBy(legMs),
      };
    },
  };
}
