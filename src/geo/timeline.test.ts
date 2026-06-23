import { describe, it, expect } from 'vitest';
import { legDurationMs, dwellDurationMs, buildPlan } from './timeline';
import type { Waypoint } from '../route/types';

describe('legDurationMs', () => {
  it('clamps short hops to the 2000ms floor', () => {
    expect(legDurationMs(0)).toBe(2000);
  });
  it('clamps very long hauls to the 8000ms ceiling', () => {
    expect(legDurationMs(20000)).toBeLessThanOrEqual(8000);
    expect(legDurationMs(20000)).toBeGreaterThan(7000);
  });
  it('is monotonic in distance', () => {
    expect(legDurationMs(5000)).toBeGreaterThan(legDurationMs(500));
  });
});

describe('dwellDurationMs', () => {
  it('returns the uniform fallback when dateless', () => {
    expect(dwellDurationMs(undefined, undefined)).toBe(800);
  });
  it('scales with the arrive->depart gap and clamps', () => {
    const short = dwellDurationMs('2025-01-01T00:00:00Z', '2025-01-01T02:00:00Z'); // 2h
    const long = dwellDurationMs('2025-01-01T00:00:00Z', '2025-01-06T00:00:00Z'); // 5d
    expect(long).toBeGreaterThan(short);
    expect(long).toBeLessThanOrEqual(4000);
    expect(short).toBeGreaterThanOrEqual(600);
  });
});

describe('buildPlan', () => {
  const wps: Waypoint[] = [
    { lat: 37.62, lon: -122.38, label: 'SFO', depart: '2025-04-15T14:30:00Z' },
    { lat: 51.47, lon: -0.45, label: 'LHR', arrive: '2025-04-15T22:15:00Z', depart: '2025-04-18T09:00:00Z' },
    { lat: 48.85, lon: 2.35, label: 'CDG', arrive: '2025-04-18T10:20:00Z' },
  ];
  it('produces leg/dwell/leg phases for three stops', () => {
    const plan = buildPlan(wps);
    expect(plan.phases.map((p) => p.type)).toEqual(['leg', 'dwell', 'leg']);
  });
  it('phases are contiguous and totalMs is their sum', () => {
    const plan = buildPlan(wps);
    let t = 0;
    for (const p of plan.phases) {
      expect(p.startMs).toBe(t);
      t += p.durMs;
    }
    expect(plan.totalMs).toBe(t);
  });
  it('the dwell sits at the middle waypoint', () => {
    const plan = buildPlan(wps);
    const dwell = plan.phases.find((p) => p.type === 'dwell');
    expect(dwell && dwell.type === 'dwell' && dwell.atIndex).toBe(1);
  });
});
