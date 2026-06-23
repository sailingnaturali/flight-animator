import { describe, it, expect } from 'vitest';
import { createPlayback } from './controller';
import { buildPlan } from '../geo/timeline';
import type { Waypoint } from '../route/types';

const wps: Waypoint[] = [
  { lat: 37.62, lon: -122.38, label: 'SFO' },
  { lat: 51.47, lon: -0.45, label: 'LHR' },
];

describe('createPlayback', () => {
  it('is idle before start', () => {
    const pb = createPlayback(buildPlan(wps), wps);
    expect(pb.frameAt(1000).state).toBe('idle');
  });
  it('counts down for 3s after start', () => {
    const pb = createPlayback(buildPlan(wps), wps);
    pb.start(0);
    const f = pb.frameAt(1000);
    expect(f.state).toBe('countdown');
    expect(f.countdownRemainingMs).toBe(2000);
  });
  it('plays after the countdown, placing the plane on the first leg', () => {
    const pb = createPlayback(buildPlan(wps), wps);
    pb.start(0);
    const f = pb.frameAt(3000); // start of leg 0
    expect(f.state).toBe('playing');
    expect(f.activeLegIndex).toBe(0);
    expect(f.plane).not.toBeNull();
    expect(f.plane!.lat).toBeCloseTo(37.62, 1);
  });
  it('reaches done at the end with both stops arrived', () => {
    const plan = buildPlan(wps);
    const pb = createPlayback(plan, wps);
    pb.start(0);
    const f = pb.frameAt(3000 + plan.totalMs + 10);
    expect(f.state).toBe('done');
    expect(f.arrivedIndices).toEqual([0, 1]);
  });
  it('reset returns to idle', () => {
    const pb = createPlayback(buildPlan(wps), wps);
    pb.start(0);
    pb.reset();
    expect(pb.frameAt(5000).state).toBe('idle');
  });
});
