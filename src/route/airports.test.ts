import { describe, it, expect } from 'vitest';
import { lookupAirport } from './airports';
import type { AirportTable } from './types';

const table: AirportTable = {
  SFO: { city: 'San Francisco', country: 'US', lat: 37.62, lon: -122.38 },
  LHR: { city: 'London', country: 'GB', lat: 51.47, lon: -0.45 },
};

describe('lookupAirport', () => {
  it('finds a code case-insensitively', () => {
    expect(lookupAirport(table, 'sfo')?.city).toBe('San Francisco');
  });
  it('returns null for an unknown code', () => {
    expect(lookupAirport(table, 'ZZZ')).toBeNull();
  });
});
