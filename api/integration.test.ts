import { describe, it, expect } from 'vitest';
import { makeShortenHandler } from './shorten';
import { makeRouteHandler } from './t/[code]';
import { memStore } from './_lib/store';
import { encodeRich, decodeRich } from '../src/route/codec';
import type { RawStop } from '../src/route/types';

const TEMPLATE = '<!doctype html><html><head><title>x</title></head><body></body></html>';

function fakeShortenRes() {
  return {
    statusCode: 200,
    body: undefined as unknown,
    status(c: number) { this.statusCode = c; return this; },
    json(b: unknown) { this.body = b; return this; },
  };
}

function fakeRouteRes() {
  return {
    statusCode: 200,
    headers: {} as Record<string, string>,
    body: '' as string,
    status(c: number) { this.statusCode = c; return this; },
    setHeader(k: string, v: string) { this.headers[k] = v; return this; },
    send(b: string) { this.body = b; return this; },
  };
}

describe('shorten → serve round-trip', () => {
  it('GET /t/<code> injects a payload that decodes back to the original stops', async () => {
    const stops: RawStop[] = [
      { code: 'YVR', label: 'Vancouver' },
      { code: 'AMS', label: 'Amsterdam' },
      { code: 'BER', label: 'Berlin' },
    ];
    const d = encodeRich(stops);

    // POST to shorten
    const store = memStore();
    const shortenRes = fakeShortenRes();
    await makeShortenHandler(store)(
      { method: 'POST', body: { d }, headers: { host: 'flights.sailingnaturali.com' } } as any,
      shortenRes as any,
    );
    expect(shortenRes.statusCode).toBe(200);
    const code = (shortenRes.body as any).code as string;
    expect(typeof code).toBe('string');

    // GET /t/<code>
    const routeRes = fakeRouteRes();
    await makeRouteHandler(store, TEMPLATE)({ query: { code } } as any, routeRes as any);
    expect(routeRes.statusCode).toBe(200);

    // Extract the injected __FLIGHT_ROUTE__ payload from the HTML
    const match = routeRes.body.match(/window\.__FLIGHT_ROUTE__=("(?:[^"\\]|\\.)*")/);
    expect(match).not.toBeNull();
    const injectedD = JSON.parse(match![1]) as string;

    // Decode back to stops and verify they match
    const decoded = decodeRich(injectedD);
    expect(decoded).toEqual(stops);
  });
});
