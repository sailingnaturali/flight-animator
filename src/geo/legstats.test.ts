import { describe, it, expect } from 'vitest';
import { formatDistance, formatDuration, legFlightMs, tripTotals } from './legstats';
import type { Waypoint } from '../route/types';

const wp = (lat: number, lon: number, extra: Partial<Waypoint> = {}): Waypoint => ({
  lat, lon, label: extra.label ?? 'x', ...extra,
});

describe('formatDistance', () => {
  it('formats km with a thousands separator', () => {
    expect(formatDistance(8615, 'km')).toBe('8,615 km');
  });
  it('converts to miles', () => {
    expect(formatDistance(1000, 'mi')).toBe('621 mi');
  });
  it('converts to nautical miles', () => {
    expect(formatDistance(1000, 'nm')).toBe('540 nm');
  });
  it('rounds to a whole unit', () => {
    expect(formatDistance(8614.7, 'km')).toBe('8,615 km');
  });
});

describe('formatDuration', () => {
  it('shows hours and minutes under a day', () => {
    expect(formatDuration(11 * 3_600_000 + 20 * 60_000)).toBe('11h 20m');
  });
  it('shows minutes only when under an hour', () => {
    expect(formatDuration(45 * 60_000)).toBe('45m');
  });
  it('shows days and hours past 24h', () => {
    expect(formatDuration((6 * 24 + 4) * 3_600_000)).toBe('6d 4h');
  });
  it('rounds to the nearest minute', () => {
    expect(formatDuration(20 * 60_000 + 40_000)).toBe('21m');
  });
});

describe('legFlightMs', () => {
  it('returns depart->arrive across the leg', () => {
    const from = wp(0, 0, { depart: '2025-04-15T14:30:00Z' });
    const to = wp(1, 1, { arrive: '2025-04-15T22:15:00Z' });
    expect(legFlightMs(from, to)).toBe((7 * 60 + 45) * 60_000);
  });
  it('returns null when the departure is missing', () => {
    expect(legFlightMs(wp(0, 0), wp(1, 1, { arrive: '2025-04-15T22:15:00Z' }))).toBeNull();
  });
  it('returns null when the arrival is missing', () => {
    expect(legFlightMs(wp(0, 0, { depart: '2025-04-15T14:30:00Z' }), wp(1, 1))).toBeNull();
  });
  it('returns null for a non-positive interval', () => {
    const from = wp(0, 0, { depart: '2025-04-15T22:00:00Z' });
    const to = wp(1, 1, { arrive: '2025-04-15T14:00:00Z' });
    expect(legFlightMs(from, to)).toBeNull();
  });
});

describe('tripTotals', () => {
  it('sums leg distances', () => {
    const t = tripTotals([wp(0, 0), wp(0, 10), wp(0, 20)]);
    expect(t.distanceKm).toBeGreaterThan(0);
    // two equal-length 10°-of-longitude legs at the equator (spherical R=6371)
    expect(t.distanceKm).toBeCloseTo(2224, 0);
  });
  it('returns null air time when any leg lacks timestamps', () => {
    const t = tripTotals([
      wp(0, 0, { depart: '2025-04-15T14:30:00Z' }),
      wp(0, 10, { arrive: '2025-04-15T16:30:00Z' }), // no depart -> next leg unknown
      wp(0, 20, { arrive: '2025-04-15T18:30:00Z' }),
    ]);
    expect(t.airMs).toBeNull();
  });
  it('sums air time when every leg has timestamps', () => {
    const t = tripTotals([
      wp(0, 0, { depart: '2025-04-15T14:00:00Z' }),
      wp(0, 10, { arrive: '2025-04-15T16:00:00Z', depart: '2025-04-15T18:00:00Z' }),
      wp(0, 20, { arrive: '2025-04-15T21:00:00Z' }),
    ]);
    expect(t.airMs).toBe((2 + 3) * 3_600_000);
  });
  it('computes elapsed from first departure to final arrival', () => {
    const t = tripTotals([
      wp(0, 0, { depart: '2025-04-15T14:00:00Z' }),
      wp(0, 10, { arrive: '2025-04-15T16:00:00Z', depart: '2025-04-18T09:00:00Z' }),
      wp(0, 20, { arrive: '2025-04-18T11:00:00Z' }),
    ]);
    expect(t.elapsedMs).toBe(Date.parse('2025-04-18T11:00:00Z') - Date.parse('2025-04-15T14:00:00Z'));
  });
  it('returns null elapsed when the endpoints lack timestamps', () => {
    const t = tripTotals([wp(0, 0), wp(0, 10), wp(0, 20)]);
    expect(t.elapsedMs).toBeNull();
  });
});
