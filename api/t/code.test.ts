import { describe, it, expect } from 'vitest';
import { makeRouteHandler } from './[code]';
import { memStore } from '../_lib/store';
import { createShortRoute } from '../_lib/shorten';
import { encodeRich } from '../../src/route/codec';

const TEMPLATE = '<!doctype html><html><head><title>x</title></head><body></body></html>';

function fakeRes() {
  return {
    statusCode: 200,
    headers: {} as Record<string, string>,
    body: '' as string,
    status(c: number) { this.statusCode = c; return this; },
    setHeader(k: string, v: string) { this.headers[k] = v; return this; },
    send(b: string) { this.body = b; return this; },
  };
}

const d = encodeRich([
  { code: 'YYJ', label: 'Victoria', depart: '2025-03-23T11:25:00-07:00' },
  { code: 'BER', label: 'Berlin' },
]);

describe('GET /t/[code]', () => {
  it('serves the app with OG meta + route global and increments hits', async () => {
    const store = memStore();
    const { code } = await createShortRoute(d, store);
    const handler = makeRouteHandler(store, TEMPLATE);
    const res = fakeRes();
    await handler({ query: { code } } as any, res as any);
    expect(res.statusCode).toBe(200);
    expect(res.body).toContain('og:title');
    expect(res.body).toContain(`window.__FLIGHT_ROUTE__=${JSON.stringify(d)}`);
    expect(await store.topTrips(1)).toEqual([{ code, hits: 1 }]);
  });
  it('returns 404 for an unknown code', async () => {
    const res = fakeRes();
    await makeRouteHandler(memStore(), TEMPLATE)({ query: { code: 'nope' } } as any, res as any);
    expect(res.statusCode).toBe(404);
  });
});
