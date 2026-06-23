import type { RawStop, Waypoint, AirportTable } from './types';
import { lookupAirport } from './airports';

export function resolveStops(
  raw: RawStop[],
  table: AirportTable,
): { waypoints: Waypoint[]; errors: string[] } {
  const waypoints: Waypoint[] = [];
  const errors: string[] = [];

  for (const s of raw) {
    if (s.code) {
      const a = lookupAirport(table, s.code);
      if (!a) {
        errors.push(`Unknown airport code: ${s.code}`);
        continue;
      }
      waypoints.push({
        lat: a.lat, lon: a.lon,
        label: s.label ?? a.city,
        code: s.code.toUpperCase(),
        country: a.country,
        arrive: s.arrive, depart: s.depart,
      });
    } else if (typeof s.lat === 'number' && typeof s.lon === 'number') {
      waypoints.push({
        lat: s.lat, lon: s.lon,
        label: s.label ?? `${s.lat},${s.lon}`,
        arrive: s.arrive, depart: s.depart,
      });
    } else {
      errors.push('Stop is missing a code or coordinates');
    }
  }

  return { waypoints, errors };
}

export function isPlayable(r: { waypoints: Waypoint[]; errors: string[] }): boolean {
  return r.errors.length === 0 && r.waypoints.length >= 2;
}
