import type { Waypoint } from '../route/types';
import { distanceKm } from './greatcircle';

export type DistanceUnit = 'km' | 'mi' | 'nm';

// Per-km conversion factors; km is the source unit the geometry works in.
const PER_KM: Record<DistanceUnit, number> = {
  km: 1,
  mi: 0.621371,
  nm: 0.539957,
};

export function formatDistance(km: number, unit: DistanceUnit): string {
  const factor = PER_KM[unit] ?? 1;
  const label = PER_KM[unit] ? unit : 'km';
  const value = Math.round(km * factor);
  return `${value.toLocaleString('en-US')} ${label}`;
}

export function formatDuration(ms: number): string {
  const totalMin = Math.round(ms / 60_000);
  const days = Math.floor(totalMin / (24 * 60));
  const hours = Math.floor((totalMin - days * 24 * 60) / 60);
  const mins = totalMin - days * 24 * 60 - hours * 60;
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}

// Flight time across a leg, or null when either endpoint lacks a timestamp or the interval is non-positive.
export function legFlightMs(from: Waypoint, to: Waypoint): number | null {
  if (!from.depart || !to.arrive) return null;
  const ms = Date.parse(to.arrive) - Date.parse(from.depart);
  if (!Number.isFinite(ms) || ms <= 0) return null;
  return ms;
}

export interface TripTotals {
  distanceKm: number;
  airMs: number | null;
  elapsedMs: number | null;
}

export function tripTotals(waypoints: Waypoint[]): TripTotals {
  let totalKm = 0;
  let airMs = 0;
  let allLegsTimed = waypoints.length > 1;
  for (let i = 0; i < waypoints.length - 1; i++) {
    totalKm += distanceKm(waypoints[i], waypoints[i + 1]);
    const leg = legFlightMs(waypoints[i], waypoints[i + 1]);
    if (leg === null) allLegsTimed = false;
    else airMs += leg;
  }

  const first = waypoints[0];
  const last = waypoints[waypoints.length - 1];
  let elapsedMs: number | null = null;
  if (first?.depart && last?.arrive) {
    const ms = Date.parse(last.arrive) - Date.parse(first.depart);
    if (Number.isFinite(ms) && ms > 0) elapsedMs = ms;
  }

  return { distanceKm: totalKm, airMs: allLegsTimed ? airMs : null, elapsedMs };
}
