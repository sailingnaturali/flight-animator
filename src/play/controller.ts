import type { TimedPlan } from '../geo/timeline';
import type { Waypoint } from '../route/types';
import { interpolate, bearing } from '../geo/greatcircle';

export type PlaybackState = 'idle' | 'countdown' | 'playing' | 'done';

export interface Frame {
  state: PlaybackState;
  countdownRemainingMs: number;
  plane: { lat: number; lon: number; bearing: number } | null;
  activeLegIndex: number | null;
  arrivedIndices: number[];
}

export interface Playback {
  start(nowMs: number): void;
  reset(): void;
  frameAt(nowMs: number): Frame;
}

const IDLE: Frame = { state: 'idle', countdownRemainingMs: 0, plane: null, activeLegIndex: null, arrivedIndices: [] };

export function createPlayback(
  plan: TimedPlan,
  waypoints: Waypoint[],
  opts: { countdownMs?: number } = {},
): Playback {
  const countdownMs = opts.countdownMs ?? 3000;
  let startTs: number | null = null;

  // arrival time (ms into playback) for each waypoint index
  const arrivalAt: number[] = [0];
  for (const p of plan.phases) {
    if (p.type === 'leg') arrivalAt[p.toIndex] = p.startMs + p.durMs;
  }

  function arrivedBy(playMs: number): number[] {
    const out: number[] = [];
    for (let i = 0; i < waypoints.length; i++) {
      if (arrivalAt[i] !== undefined && playMs >= arrivalAt[i]) out.push(i);
    }
    return out;
  }

  return {
    start(nowMs: number) {
      startTs = nowMs;
    },
    reset() {
      startTs = null;
    },
    frameAt(nowMs: number): Frame {
      if (startTs === null) return IDLE;
      const elapsed = nowMs - startTs;
      if (elapsed < countdownMs) {
        return { ...IDLE, state: 'countdown', countdownRemainingMs: countdownMs - elapsed };
      }
      const playMs = elapsed - countdownMs;
      if (playMs >= plan.totalMs) {
        const last = waypoints[waypoints.length - 1];
        return {
          state: 'done',
          countdownRemainingMs: 0,
          plane: { lat: last.lat, lon: last.lon, bearing: 0 },
          activeLegIndex: null,
          arrivedIndices: waypoints.map((_, i) => i),
        };
      }
      const phase = plan.phases.find((p) => playMs >= p.startMs && playMs < p.startMs + p.durMs)!;
      if (phase.type === 'leg') {
        const a = waypoints[phase.fromIndex];
        const b = waypoints[phase.toIndex];
        const f = (playMs - phase.startMs) / phase.durMs;
        const pos = interpolate(a, b, f);
        return {
          state: 'playing',
          countdownRemainingMs: 0,
          plane: { lat: pos.lat, lon: pos.lon, bearing: bearing(a, b, f) },
          activeLegIndex: phase.fromIndex,
          arrivedIndices: arrivedBy(playMs),
        };
      }
      // dwell: plane parked at the stop
      const at = waypoints[phase.atIndex];
      return {
        state: 'playing',
        countdownRemainingMs: 0,
        plane: { lat: at.lat, lon: at.lon, bearing: 0 },
        activeLegIndex: null,
        arrivedIndices: arrivedBy(playMs),
      };
    },
  };
}
