import type { RawStop, Waypoint, AirportTable } from './types';
import { lookupAirport } from './airports';

export function resolveStops(
  raw: RawStop[],
  table: AirportTable,
): { waypoints: Waypoint[]; errors: string[] } {
  const waypoints: Waypoint[] = [];
  const errors: string[] = [];

  for (const s of raw) {
    const hasCoords = typeof s.lat === 'number' && typeof s.lon === 'number';
    if (hasCoords) {
      // Embedded coordinates win (the rich `?d=` form carries authoritative lat/lon, e.g. from
      // flighty-mcp). A code is still used — when it resolves — to enrich the label/country, but a
      // missing or unknown code must NOT drop the stop or raise an error when coordinates are present.
      const a = s.code ? lookupAirport(table, s.code) : null;
      waypoints.push({
        lat: s.lat as number,
        lon: s.lon as number,
        label: s.label ?? a?.city ?? `${s.lat},${s.lon}`,
        code: s.code ? s.code.toUpperCase() : undefined,
        country: a?.country,
        arrive: s.arrive, depart: s.depart,
      });
    } else if (s.code) {
      // No coordinates: resolve the airport by code via the bundled table.
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
    } else {
      errors.push('Stop is missing a code or coordinates');
    }
  }

  return { waypoints, errors };
}

export function isPlayable(r: { waypoints: Waypoint[]; errors: string[] }): boolean {
  return r.errors.length === 0 && r.waypoints.length >= 2;
}
