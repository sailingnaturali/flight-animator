import type { AirportTable } from './types';

export function lookupAirport(table: AirportTable, code: string) {
  const entry = table[code.toUpperCase()];
  return entry ?? null;
}

let cache: Promise<AirportTable> | null = null;

export function loadAirports(): Promise<AirportTable> {
  if (!cache) {
    cache = fetch('/airports.json').then((r) => {
      if (!r.ok) throw new Error('Failed to load airport data');
      return r.json() as Promise<AirportTable>;
    });
  }
  return cache;
}
