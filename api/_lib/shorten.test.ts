import { describe, it, expect } from 'vitest';
import { createShortRoute } from './shorten';
import { memStore } from './store';
import { fullCode } from './shortcode';
import { encodeRich } from '../../src/route/codec';

const d = encodeRich([{ code: 'SFO' }, { code: 'LHR' }, { code: 'CDG' }]);

describe('createShortRoute', () => {
  it('stores a valid payload and returns a 12-char code', async () => {
    const store = memStore();
    const res = await createShortRoute(d, store);
    expect(res).toMatchObject({ ok: true, status: 200 });
    expect(res.code).toHaveLength(12);
    expect(await store.getRoute(res.code!)).toBe(d);
  });
  it('is idempotent: same payload twice → same code, one entry', async () => {
    const store = memStore();
    const a = await createShortRoute(d, store);
    const b = await createShortRoute(d, store);
    expect(a.code).toBe(b.code);
  });
  it('rejects an invalid payload with 400', async () => {
    const res = await createShortRoute('garbage!!', memStore());
    expect(res).toMatchObject({ ok: false, status: 400 });
  });
  it('lengthens the code when a different payload already occupies it', async () => {
    const store = memStore();
    const taken = fullCode(d).slice(0, 12);
    await store.putRouteIfAbsent(taken, 'A DIFFERENT PAYLOAD');
    const res = await createShortRoute(d, store);
    expect(res.code).toBe(fullCode(d).slice(0, 13));
    expect(res.code).toHaveLength(13);
  });
});
