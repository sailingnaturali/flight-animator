import { describe, it, expect } from 'vitest';
import { createPlayback } from './controller';
import { buildPlan } from '../geo/timeline';
import type { Waypoint } from '../route/types';

const wps: Waypoint[] = [
  { lat: 37.62, lon: -122.38, label: 'SFO' },
  { lat: 51.47, lon: -0.45, label: 'LHR' },
];

// Default timeline: countdown 3000 -> lead hold 2000 -> legs -> tail hold 3000 -> done.
const LEG_START = 5000; // countdownMs (3000) + leadHoldMs (2000)

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
  it('holds on the whole route (plane at origin) after the countdown, before the first leg', () => {
    const pb = createPlayback(buildPlan(wps), wps);
    pb.start(0);
    const f = pb.frameAt(3000 + 1000); // 1s into the 2s lead hold
    expect(f.state).toBe('lead');
    expect(f.activeLegIndex).toBeNull();
    expect(f.arrivedIndices).toEqual([]);
    expect(f.plane).toMatchObject({ lat: wps[0].lat, lon: wps[0].lon });
  });
  it('plays after countdown + lead hold, placing the plane on the first leg', () => {
    const pb = createPlayback(buildPlan(wps), wps);
    pb.start(0);
    const f = pb.frameAt(LEG_START); // start of leg 0
    expect(f.state).toBe('playing');
    expect(f.activeLegIndex).toBe(0);
    expect(f.plane).not.toBeNull();
    expect(f.plane!.lat).toBeCloseTo(37.62, 1);
  });
  it('holds on the final leg (tail) after landing, then reaches done', () => {
    const plan = buildPlan(wps);
    const pb = createPlayback(plan, wps);
    pb.start(0);
    const tail = pb.frameAt(LEG_START + plan.totalMs + 10);
    expect(tail.state).toBe('tail');
    expect(tail.arrivedIndices).toEqual([0, 1]);
    expect(tail.plane).toMatchObject({ lat: wps[1].lat, lon: wps[1].lon });
    const done = pb.frameAt(LEG_START + plan.totalMs + 3000 + 10);
    expect(done.state).toBe('done');
    expect(done.arrivedIndices).toEqual([0, 1]);
  });
  it('reset returns to idle', () => {
    const pb = createPlayback(buildPlan(wps), wps);
    pb.start(0);
    pb.reset();
    expect(pb.frameAt(5000).state).toBe('idle');
  });
  it('parks at the intermediate stop during its dwell with no active leg', () => {
    const three: Waypoint[] = [
      { lat: 37.62, lon: -122.38, label: 'SFO' },
      { lat: 41.97, lon: -87.90, label: 'ORD' },
      { lat: 51.47, lon: -0.45, label: 'LHR' },
    ];
    const plan = buildPlan(three);
    const dwell = plan.phases.find((p) => p.type === 'dwell');
    if (!dwell || dwell.type !== 'dwell') throw new Error('expected a dwell phase');
    const pb = createPlayback(plan, three);
    pb.start(0);
    const f = pb.frameAt(LEG_START + dwell.startMs + dwell.durMs / 2);
    expect(f.state).toBe('playing');
    expect(f.activeLegIndex).toBeNull();
    expect(f.arrivedIndices).toContain(1);
    expect(f.plane).toMatchObject({ lat: three[1].lat, lon: three[1].lon });
  });

  it('honors a custom countdownMs', () => {
    const pb = createPlayback(buildPlan(wps), wps, { countdownMs: 1000, leadHoldMs: 0 });
    pb.start(0);
    expect(pb.frameAt(500).state).toBe('countdown');
    expect(pb.frameAt(1000).state).toBe('playing');
  });

  it('exposes the active-leg fraction while flying', () => {
    const plan = buildPlan(wps);
    const pb = createPlayback(plan, wps);
    pb.start(0);
    const f = pb.frameAt(LEG_START + plan.phases[0].durMs / 2);
    expect(f.activeLegFraction).toBeCloseTo(0.5, 5);
  });
});
