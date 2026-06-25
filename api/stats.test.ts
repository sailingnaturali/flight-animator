import { describe, it, expect } from 'vitest';
import { makeStatsHandler } from './stats';
import { memStore } from './_lib/store';

function fakeRes() {
  return {
    statusCode: 200,
    body: undefined as unknown,
    status(c: number) { this.statusCode = c; return this; },
    json(b: unknown) { this.body = b; return this; },
  };
}

describe('GET /api/stats', () => {
  it('returns top trips when the bearer token matches', async () => {
    const store = memStore();
    await store.putRouteIfAbsent('a', 'A');
    await store.incrHits('a');
    const res = fakeRes();
    await makeStatsHandler(store, 'secret')(
      { headers: { authorization: 'Bearer secret' }, query: {} } as any,
      res as any,
    );
    expect(res.statusCode).toBe(200);
    expect((res.body as any).top).toEqual([{ code: 'a', hits: 1 }]);
  });
  it('rejects a missing/wrong token with 401', async () => {
    const res = fakeRes();
    await makeStatsHandler(memStore(), 'secret')({ headers: {}, query: {} } as any, res as any);
    expect(res.statusCode).toBe(401);
  });
});
