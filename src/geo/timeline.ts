import type { Waypoint } from '../route/types';
import { distanceKm } from './greatcircle';

export type Phase =
  | { type: 'leg'; fromIndex: number; toIndex: number; startMs: number; durMs: number; distanceKm: number }
  | { type: 'dwell'; atIndex: number; startMs: number; durMs: number };

export interface TimedPlan {
  totalMs: number;
  phases: Phase[];
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

export function legDurationMs(km: number): number {
  const MIN = 2000, MAX = 8000;
  const f = clamp(Math.log10(km + 1) / Math.log10(20000), 0, 1);
  return clamp(MIN + (MAX - MIN) * f, MIN, MAX);
}

export function dwellDurationMs(arrive?: string, depart?: string): number {
  if (!arrive || !depart) return 800;
  const hours = (Date.parse(depart) - Date.parse(arrive)) / 3_600_000;
  if (!Number.isFinite(hours) || hours <= 0) return 800;
  return clamp(600 + 1500 * Math.log10(hours + 1), 600, 4000);
}

export function buildPlan(waypoints: Waypoint[]): TimedPlan {
  const phases: Phase[] = [];
  let t = 0;
  for (let i = 0; i < waypoints.length - 1; i++) {
    const km = distanceKm(waypoints[i], waypoints[i + 1]);
    const durMs = legDurationMs(km);
    phases.push({ type: 'leg', fromIndex: i, toIndex: i + 1, startMs: t, durMs, distanceKm: km });
    t += durMs;
    const isIntermediate = i < waypoints.length - 2;
    if (isIntermediate) {
      const at = waypoints[i + 1];
      const durDwell = dwellDurationMs(at.arrive, at.depart);
      phases.push({ type: 'dwell', atIndex: i + 1, startMs: t, durMs: durDwell });
      t += durDwell;
    }
  }
  return { totalMs: t, phases };
}
