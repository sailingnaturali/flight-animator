import { describe, it, expect } from 'vitest';
import { distanceKm, interpolate, bearing } from './greatcircle';

const SFO = { lat: 37.62, lon: -122.38 };
const LHR = { lat: 51.47, lon: -0.45 };

describe('distanceKm', () => {
  it('matches the known SFO->LHR great-circle distance (~8600 km)', () => {
    expect(distanceKm(SFO, LHR)).toBeGreaterThan(8500);
    expect(distanceKm(SFO, LHR)).toBeLessThan(8700);
  });
  it('is zero for identical points', () => {
    expect(distanceKm(SFO, SFO)).toBeCloseTo(0, 5);
  });
});

describe('interpolate', () => {
  it('returns endpoints at f=0 and f=1', () => {
    expect(interpolate(SFO, LHR, 0).lat).toBeCloseTo(SFO.lat, 4);
    expect(interpolate(SFO, LHR, 1).lon).toBeCloseTo(LHR.lon, 4);
  });
  it('midpoint lies between the endpoints in latitude', () => {
    const mid = interpolate(SFO, LHR, 0.5);
    expect(mid.lat).toBeGreaterThan(50); // great circle bows north
  });
});

describe('bearing', () => {
  it('initial SFO->LHR heading is north-easterly (~30-50 deg)', () => {
    const b = bearing(SFO, LHR, 0);
    expect(b).toBeGreaterThan(20);
    expect(b).toBeLessThan(60);
  });
});
