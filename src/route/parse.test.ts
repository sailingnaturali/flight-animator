import { describe, it, expect } from 'vitest';
import { resolveStops, isPlayable } from './parse';
import type { AirportTable } from './types';

const table: AirportTable = {
  SFO: { city: 'San Francisco', country: 'US', lat: 37.62, lon: -122.38 },
  LHR: { city: 'London', country: 'GB', lat: 51.47, lon: -0.45 },
};

describe('resolveStops', () => {
  it('resolves airport codes to waypoints with coordinates and label', () => {
    const { waypoints, errors } = resolveStops([{ code: 'SFO' }, { code: 'LHR' }], table);
    expect(errors).toEqual([]);
    expect(waypoints[0]).toMatchObject({ lat: 37.62, lon: -122.38, label: 'San Francisco', code: 'SFO', country: 'US' });
  });
  it('carries arrive/depart and an explicit label through', () => {
    const { waypoints } = resolveStops(
      [{ code: 'LHR', label: 'Home', arrive: '2025-04-15T22:15:00Z' }],
      table,
    );
    expect(waypoints[0].label).toBe('Home');
    expect(waypoints[0].arrive).toBe('2025-04-15T22:15:00Z');
  });
  it('keeps a coordinate stop as-is', () => {
    const { waypoints } = resolveStops([{ lat: 48.76, lon: -122.5, label: 'Cabin' }], table);
    expect(waypoints[0]).toMatchObject({ lat: 48.76, lon: -122.5, label: 'Cabin' });
  });
  it('reports an unknown code and omits it from waypoints', () => {
    const { waypoints, errors } = resolveStops([{ code: 'SFO' }, { code: 'ZZZ' }], table);
    expect(waypoints).toHaveLength(1);
    expect(errors[0]).toContain('ZZZ');
  });
  it('uses embedded coordinates over the table when a stop has both a code and lat/lon', () => {
    const { waypoints, errors } = resolveStops([{ code: 'SFO', lat: 37.0, lon: -122.0 }], table);
    expect(errors).toEqual([]);
    expect(waypoints[0]).toMatchObject({ lat: 37.0, lon: -122.0, code: 'SFO', country: 'US' });
  });
  it('keeps a stop with an unknown code but valid coordinates (no error, not dropped)', () => {
    const { waypoints, errors } = resolveStops([{ code: 'ZZZ', lat: 10, lon: 20, label: 'Mystery' }], table);
    expect(errors).toEqual([]);
    expect(waypoints).toHaveLength(1);
    expect(waypoints[0]).toMatchObject({ lat: 10, lon: 20, code: 'ZZZ', label: 'Mystery' });
  });
  it('labels a code+coords stop from the table city when no label is given and the code is known', () => {
    const { waypoints } = resolveStops([{ code: 'SFO', lat: 37.0, lon: -122.0 }], table);
    expect(waypoints[0].label).toBe('San Francisco');
  });
});

describe('isPlayable', () => {
  it('is false with fewer than two stops', () => {
    expect(isPlayable({ waypoints: [{ lat: 0, lon: 0, label: 'a' }], errors: [] })).toBe(false);
  });
  it('is false when there are errors', () => {
    expect(isPlayable({ waypoints: [{ lat: 0, lon: 0, label: 'a' }, { lat: 1, lon: 1, label: 'b' }], errors: ['x'] })).toBe(false);
  });
  it('is true with two clean stops', () => {
    expect(isPlayable({ waypoints: [{ lat: 0, lon: 0, label: 'a' }, { lat: 1, lon: 1, label: 'b' }], errors: [] })).toBe(true);
  });
});
