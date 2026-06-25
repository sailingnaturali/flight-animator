import { describe, it, expect } from 'vitest';
import { makeShortenHandler } from './shorten';
import { memStore } from './_lib/store';
import { encodeRich } from '../src/route/codec';

function fakeRes() {
  return {
    statusCode: 200,
    body: undefined as unknown,
    status(c: number) { this.statusCode = c; return this; },
    json(b: unknown) { this.body = b; return this; },
  };
}

const d = encodeRich([{ code: 'SFO' }, { code: 'LHR' }]);

describe('POST /api/shorten', () => {
  it('returns 200 with a code and absolute url for a valid payload', async () => {
    const handler = makeShortenHandler(memStore());
    const res = fakeRes();
    await handler({ method: 'POST', body: { d }, headers: { host: 'flights.sailingnaturali.com' } } as any, res as any);
    expect(res.statusCode).toBe(200);
    expect((res.body as any).code).toHaveLength(12);
    expect((res.body as any).url).toBe(`https://flights.sailingnaturali.com/t/${(res.body as any).code}`);
  });
  it('rejects a non-POST with 405', async () => {
    const res = fakeRes();
    await makeShortenHandler(memStore())({ method: 'GET' } as any, res as any);
    expect(res.statusCode).toBe(405);
  });
  it('rejects a missing/invalid payload with 400', async () => {
    const res = fakeRes();
    await makeShortenHandler(memStore())({ method: 'POST', body: {}, headers: {} } as any, res as any);
    expect(res.statusCode).toBe(400);
  });
});
