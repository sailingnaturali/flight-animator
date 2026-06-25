import { describe, it, expect } from 'vitest';
import { memStore } from './store';

describe('memStore', () => {
  it('putRouteIfAbsent writes once; second write is a no-op', async () => {
    const s = memStore();
    expect(await s.putRouteIfAbsent('abc', 'PAYLOAD')).toBe(true);
    expect(await s.putRouteIfAbsent('abc', 'OTHER')).toBe(false);
    expect(await s.getRoute('abc')).toBe('PAYLOAD');
  });
  it('getRoute returns null for unknown code', async () => {
    expect(await memStore().getRoute('nope')).toBeNull();
  });
  it('incrHits accumulates and topTrips ranks by hits', async () => {
    const s = memStore();
    await s.putRouteIfAbsent('a', 'A');
    await s.putRouteIfAbsent('b', 'B');
    await s.incrHits('a');
    await s.incrHits('a');
    await s.incrHits('b');
    expect(await s.topTrips(2)).toEqual([
      { code: 'a', hits: 2 },
      { code: 'b', hits: 1 },
    ]);
  });
});
