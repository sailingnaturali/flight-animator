# Flight-Animator Short Links Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn a ~600-char `?d=` route URL into a short, messaging-safe `flights.sailingnaturali.com/t/<code>` link backed by server-side storage, with a per-trip unfurl card and an owned visit counter.

**Architecture:** The static SPA stays static. We add Vercel Node Functions (`/api/shorten`, `/t/[code]`, `/api/stats`) plus Vercel KV (Upstash Redis) to the existing flight-animator Vercel project. Codes are content-addressed (`base62(sha256(payload))`, idempotent, store-if-absent). Pure logic (hashing, validation, summary, HTML injection, store orchestration) lives in testable `api/_lib/*` modules; handlers are thin wiring. Every writer (app Share button, flighty-mcp) degrades to the long `?d=` URL if the shortener is unreachable.

**Tech Stack:** TypeScript, Vite 8, Vitest 4, `@vercel/node` + `@vercel/kv`, Node `crypto`; Python 3.11 stdlib `urllib` for the MCP.

## Global Constraints

- **DRY decode:** all route decoding reuses `src/route/codec.ts` (`decodeRich`). Never reimplement base64url/JSON parsing.
- **Code length:** content-addressed, default **12 base62 chars**; collision guard lengthens up to 32.
- **Payload cap:** reject payloads `> 4096` bytes; require `2..60` stops.
- **Graceful degradation:** any shorten failure → the caller falls back to the long `?d=` URL. A shortener outage never blocks sharing or animation.
- **No new MCP runtime deps:** `flighty-mcp` stays `dependencies = ["mcp[cli]>=1.6.0"]`; use stdlib `urllib` only.
- **KV keys:** `route:<code>` (string, no TTL), `hits:<code>` (int), `trips` (sorted set, code→hits).
- **Two repos:** Tasks 1–9 are in `flight-animator/`; Tasks 10–11 are in `flighty-mcp/`. Run commands from the respective repo root.

---

### Task 1: `shortcode` module (hash, validate, summarize)

**Files:**
- Create: `flight-animator/api/_lib/shortcode.ts`
- Test: `flight-animator/api/_lib/shortcode.test.ts`

**Interfaces:**
- Consumes: `decodeRich(b64: string): RawStop[]` from `src/route/codec.ts`; `RawStop` from `src/route/types.ts`.
- Produces: `fullCode(d: string): string`, `encode(d: string, len?: number): string`, `validate(d: string): boolean`, `summarize(d: string): { title: string; description: string }`.

(`api/_lib/` is ignored by Vercel routing because of the leading `_`, so these never become endpoints. The module is Node-only — it uses `node:crypto` — and is imported by the functions, never by the browser bundle.)

- [ ] **Step 1: Write the failing test**

```ts
// api/_lib/shortcode.test.ts
import { describe, it, expect } from 'vitest';
import { encode, fullCode, validate, summarize } from './shortcode';
import { encodeRich } from '../../src/route/codec';

const berlin = encodeRich([
  { code: 'YYJ', lat: 48.64, lon: -123.43, label: 'Victoria', depart: '2025-03-23T11:25:00-07:00' },
  { code: 'YYZ', lat: 43.68, lon: -79.61, label: 'Toronto' },
  { code: 'MUC', lat: 48.35, lon: 11.79, label: 'Munich' },
  { code: 'BER', lat: 52.36, lon: 13.51, label: 'Berlin', arrive: '2025-03-24T12:00:00+01:00' },
]);

describe('shortcode', () => {
  it('encode is deterministic and 12 base62 chars', () => {
    expect(encode(berlin)).toBe(encode(berlin));
    expect(encode(berlin)).toMatch(/^[0-9A-Za-z]{12}$/);
  });
  it('encode differs for different payloads', () => {
    const other = encodeRich([{ code: 'SFO' }, { code: 'LHR' }]);
    expect(encode(berlin)).not.toBe(encode(other));
  });
  it('encode(len) is a prefix of fullCode', () => {
    expect(fullCode(berlin).startsWith(encode(berlin, 13))).toBe(true);
    expect(encode(berlin, 13)).toHaveLength(13);
  });
  it('validate accepts a real 2+ stop payload', () => {
    expect(validate(berlin)).toBe(true);
  });
  it('validate rejects oversized, garbage, and single-stop', () => {
    expect(validate('x'.repeat(4097))).toBe(false);
    expect(validate('not-base64!!')).toBe(false);
    expect(validate(encodeRich([{ code: 'SFO' }]))).toBe(false);
  });
  it('summarize yields endpoints + date + leg count', () => {
    expect(summarize(berlin)).toEqual({ title: 'Victoria → Berlin', description: 'Mar 2025 · 3 legs' });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd flight-animator && npx vitest run api/_lib/shortcode.test.ts`
Expected: FAIL — `Cannot find module './shortcode'`.

- [ ] **Step 3: Write minimal implementation**

```ts
// api/_lib/shortcode.ts
import { createHash } from 'node:crypto';
import { decodeRich } from '../../src/route/codec';
import type { RawStop } from '../../src/route/types';

const B62 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
const CODE_LEN = 12;
export const MAX_PAYLOAD_BYTES = 4096;
const MIN_STOPS = 2;
const MAX_STOPS = 60;

function toBase62(hex: string): string {
  let n = BigInt('0x' + hex);
  if (n === 0n) return '0';
  let out = '';
  while (n > 0n) {
    out = B62[Number(n % 62n)] + out;
    n /= 62n;
  }
  return out;
}

export function fullCode(d: string): string {
  return toBase62(createHash('sha256').update(d).digest('hex'));
}

export function encode(d: string, len: number = CODE_LEN): string {
  return fullCode(d).slice(0, len);
}

export function validate(d: string): boolean {
  if (!d || d.length > MAX_PAYLOAD_BYTES) return false;
  try {
    const stops = decodeRich(d);
    return Array.isArray(stops) && stops.length >= MIN_STOPS && stops.length <= MAX_STOPS;
  } catch {
    return false;
  }
}

function label(s: RawStop): string {
  return s.label ?? s.code ?? `${s.lat},${s.lon}`;
}

export function summarize(d: string): { title: string; description: string } {
  const stops = decodeRich(d);
  const title = `${label(stops[0])} → ${label(stops[stops.length - 1])}`;
  const legs = stops.length - 1;
  const parts: string[] = [];
  const depart = stops[0].depart;
  if (depart) {
    const t = new Date(depart);
    if (!Number.isNaN(t.getTime())) {
      parts.push(t.toLocaleString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' }));
    }
  }
  parts.push(`${legs} leg${legs === 1 ? '' : 's'}`);
  return { title, description: parts.join(' · ') };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd flight-animator && npx vitest run api/_lib/shortcode.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
cd flight-animator
git add api/_lib/shortcode.ts api/_lib/shortcode.test.ts
git commit -m "feat(shortlink): content-addressed code + validate + summarize"
```

---

### Task 2: `RouteStore` interface + in-memory + KV implementations

**Files:**
- Create: `flight-animator/api/_lib/store.ts`
- Test: `flight-animator/api/_lib/store.test.ts`
- Modify: `flight-animator/package.json` (add `@vercel/kv`, `@vercel/node`)

**Interfaces:**
- Produces:
  - `interface RouteStore { getRoute(code): Promise<string|null>; putRouteIfAbsent(code, d): Promise<boolean>; incrHits(code): Promise<void>; topTrips(n): Promise<Array<{ code: string; hits: number }>> }`
  - `memStore(): RouteStore` (test/in-memory)
  - `kvStore(): RouteStore` (production, `@vercel/kv`)

- [ ] **Step 1: Add dependencies**

Run:
```bash
cd flight-animator
npm install @vercel/kv
npm install -D @vercel/node
```
Expected: both appear in `package.json`; lockfile updates.

- [ ] **Step 2: Write the failing test**

```ts
// api/_lib/store.test.ts
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
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd flight-animator && npx vitest run api/_lib/store.test.ts`
Expected: FAIL — `Cannot find module './store'`.

- [ ] **Step 4: Write minimal implementation**

```ts
// api/_lib/store.ts
import { kv } from '@vercel/kv';

export interface RouteStore {
  getRoute(code: string): Promise<string | null>;
  putRouteIfAbsent(code: string, d: string): Promise<boolean>;
  incrHits(code: string): Promise<void>;
  topTrips(n: number): Promise<Array<{ code: string; hits: number }>>;
}

export function memStore(): RouteStore {
  const routes = new Map<string, string>();
  const hits = new Map<string, number>();
  return {
    async getRoute(code) {
      return routes.has(code) ? routes.get(code)! : null;
    },
    async putRouteIfAbsent(code, d) {
      if (routes.has(code)) return false;
      routes.set(code, d);
      return true;
    },
    async incrHits(code) {
      hits.set(code, (hits.get(code) ?? 0) + 1);
    },
    async topTrips(n) {
      return [...hits.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, n)
        .map(([code, h]) => ({ code, hits: h }));
    },
  };
}

export function kvStore(): RouteStore {
  return {
    async getRoute(code) {
      return await kv.get<string>(`route:${code}`);
    },
    async putRouteIfAbsent(code, d) {
      const res = await kv.set(`route:${code}`, d, { nx: true });
      return res === 'OK';
    },
    async incrHits(code) {
      await kv.incr(`hits:${code}`);
      await kv.zincrby('trips', 1, code);
    },
    async topTrips(n) {
      const flat = await kv.zrange<string[]>('trips', 0, n - 1, { rev: true, withScores: true });
      const out: Array<{ code: string; hits: number }> = [];
      for (let i = 0; i < flat.length; i += 2) out.push({ code: flat[i], hits: Number(flat[i + 1]) });
      return out;
    },
  };
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd flight-animator && npx vitest run api/_lib/store.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
cd flight-animator
git add api/_lib/store.ts api/_lib/store.test.ts package.json package-lock.json
git commit -m "feat(shortlink): RouteStore interface with in-memory + KV impls"
```

---

### Task 3: `createShortRoute` core (validation + idempotency + collision guard)

**Files:**
- Create: `flight-animator/api/_lib/shorten.ts`
- Test: `flight-animator/api/_lib/shorten.test.ts`

**Interfaces:**
- Consumes: `fullCode`, `validate` (Task 1); `RouteStore`, `memStore` (Task 2).
- Produces: `interface ShortenResult { ok: boolean; status: number; code?: string; error?: string }` and `createShortRoute(d: string, store: RouteStore): Promise<ShortenResult>`.

- [ ] **Step 1: Write the failing test**

```ts
// api/_lib/shorten.test.ts
import { describe, it, expect } from 'vitest';
import { createShortRoute } from './shorten';
import { memStore } from './store';
import { encode, fullCode } from './shortcode';
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
    const taken = encode(d, 12);
    await store.putRouteIfAbsent(taken, 'A DIFFERENT PAYLOAD');
    const res = await createShortRoute(d, store);
    expect(res.code).toBe(fullCode(d).slice(0, 13));
    expect(res.code).toHaveLength(13);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd flight-animator && npx vitest run api/_lib/shorten.test.ts`
Expected: FAIL — `Cannot find module './shorten'`.

- [ ] **Step 3: Write minimal implementation**

```ts
// api/_lib/shorten.ts
import { fullCode, validate } from './shortcode';
import type { RouteStore } from './store';

export interface ShortenResult {
  ok: boolean;
  status: number;
  code?: string;
  error?: string;
}

const MIN_LEN = 12;
const MAX_LEN = 32;

export async function createShortRoute(d: string, store: RouteStore): Promise<ShortenResult> {
  if (!validate(d)) return { ok: false, status: 400, error: 'invalid payload' };
  const full = fullCode(d);
  for (let len = MIN_LEN; len <= MAX_LEN && len <= full.length; len++) {
    const code = full.slice(0, len);
    const existing = await store.getRoute(code);
    if (existing === d) return { ok: true, status: 200, code }; // already stored (idempotent)
    if (existing === null) {
      const wrote = await store.putRouteIfAbsent(code, d);
      if (wrote) return { ok: true, status: 200, code };
      if ((await store.getRoute(code)) === d) return { ok: true, status: 200, code };
      // lost the race to a different payload — fall through and lengthen
    }
    // existing is a different payload — lengthen and retry
  }
  return { ok: false, status: 500, error: 'code space exhausted' };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd flight-animator && npx vitest run api/_lib/shorten.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
cd flight-animator
git add api/_lib/shorten.ts api/_lib/shorten.test.ts
git commit -m "feat(shortlink): createShortRoute with idempotency + collision guard"
```

---

### Task 4: `POST /api/shorten` handler

**Files:**
- Create: `flight-animator/api/shorten.ts`
- Test: `flight-animator/api/shorten.test.ts`

**Interfaces:**
- Consumes: `createShortRoute` (Task 3); `RouteStore`, `kvStore`, `memStore` (Task 2).
- Produces: `makeShortenHandler(store: RouteStore)` returning a `(req, res)` handler; default export uses `kvStore()`. Response body on success: `{ code: string, url: string }`.

- [ ] **Step 1: Write the failing test**

```ts
// api/shorten.test.ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd flight-animator && npx vitest run api/shorten.test.ts`
Expected: FAIL — `Cannot find module './shorten'`.

- [ ] **Step 3: Write minimal implementation**

```ts
// api/shorten.ts
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createShortRoute } from './_lib/shorten';
import { kvStore, type RouteStore } from './_lib/store';

export function makeShortenHandler(store: RouteStore) {
  return async function handler(req: VercelRequest, res: VercelResponse) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'method not allowed' });
    const body = typeof req.body === 'string' ? safeParse(req.body) : req.body;
    const d = body?.d;
    if (typeof d !== 'string') return res.status(400).json({ error: 'missing payload' });
    const result = await createShortRoute(d, store);
    if (!result.ok) return res.status(result.status).json({ error: result.error });
    const host = req.headers.host ?? 'flights.sailingnaturali.com';
    return res.status(200).json({ code: result.code, url: `https://${host}/t/${result.code}` });
  };
}

function safeParse(s: string): { d?: unknown } {
  try {
    return JSON.parse(s);
  } catch {
    return {};
  }
}

export default makeShortenHandler(kvStore());
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd flight-animator && npx vitest run api/shorten.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
cd flight-animator
git add api/shorten.ts api/shorten.test.ts
git commit -m "feat(shortlink): POST /api/shorten endpoint"
```

---

### Task 5: HTML render helpers (`injectMeta`, `notFoundHtml`)

**Files:**
- Create: `flight-animator/api/_lib/render.ts`
- Test: `flight-animator/api/_lib/render.test.ts`

**Interfaces:**
- Produces: `injectMeta(template: string, meta: { title: string; description: string; d: string; image: string }): string` and `notFoundHtml(): string`. Pure string functions — no KV, no fs.

- [ ] **Step 1: Write the failing test**

```ts
// api/_lib/render.test.ts
import { describe, it, expect } from 'vitest';
import { injectMeta, notFoundHtml } from './render';

const TEMPLATE = '<!doctype html><html><head><title>x</title></head><body></body></html>';

describe('injectMeta', () => {
  it('injects OG meta and the route global before </head>', () => {
    const out = injectMeta(TEMPLATE, {
      title: 'Victoria → Berlin',
      description: 'Mar 2025 · 3 legs',
      d: 'eyJ2IjoxfQ',
      image: 'https://flights.sailingnaturali.com/og-default.png',
    });
    expect(out).toContain('<meta property="og:title" content="Victoria → Berlin">');
    expect(out).toContain('<meta property="og:description" content="Mar 2025 · 3 legs">');
    expect(out).toContain('window.__FLIGHT_ROUTE__="eyJ2IjoxfQ"');
    expect(out.indexOf('og:title')).toBeLessThan(out.indexOf('</head>'));
  });
  it('HTML-escapes the title/description content', () => {
    const out = injectMeta(TEMPLATE, { title: 'A & B "<x>"', description: 'd', d: 'z', image: 'i' });
    expect(out).toContain('content="A &amp; B &quot;&lt;x&gt;&quot;"');
  });
});

describe('notFoundHtml', () => {
  it('returns a friendly 404 page linking home', () => {
    expect(notFoundHtml()).toContain('https://flights.sailingnaturali.com');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd flight-animator && npx vitest run api/_lib/render.test.ts`
Expected: FAIL — `Cannot find module './render'`.

- [ ] **Step 3: Write minimal implementation**

```ts
// api/_lib/render.ts
function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function injectMeta(
  template: string,
  meta: { title: string; description: string; d: string; image: string },
): string {
  const head = [
    `<meta property="og:title" content="${esc(meta.title)}">`,
    `<meta property="og:description" content="${esc(meta.description)}">`,
    `<meta property="og:image" content="${esc(meta.image)}">`,
    `<meta name="twitter:card" content="summary_large_image">`,
    `<meta name="twitter:title" content="${esc(meta.title)}">`,
    `<meta name="twitter:description" content="${esc(meta.description)}">`,
    `<script>window.__FLIGHT_ROUTE__=${JSON.stringify(meta.d)}</script>`,
  ].join('');
  return template.replace('</head>', `${head}</head>`);
}

export function notFoundHtml(): string {
  return [
    '<!doctype html><html><head><meta charset="utf-8"><title>Link not found</title></head>',
    '<body style="font-family:system-ui;background:#10141c;color:#e8edf4;display:grid;',
    'place-content:center;height:100vh;text-align:center">',
    '<div><h1>That link has expired or never existed.</h1>',
    '<p><a style="color:#7ab7ff" href="https://flights.sailingnaturali.com">Start a new trip →</a></p>',
    '</div></body></html>',
  ].join('');
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd flight-animator && npx vitest run api/_lib/render.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
cd flight-animator
git add api/_lib/render.ts api/_lib/render.test.ts
git commit -m "feat(shortlink): OG meta injection + 404 render helpers"
```

---

### Task 6: `GET /t/[code]` handler + Vercel routing

**Files:**
- Create: `flight-animator/api/t/[code].ts`
- Test: `flight-animator/api/t/code.test.ts`
- Create: `flight-animator/public/og-default.png` (placeholder static OG image)
- Modify: `flight-animator/vercel.json`

**Interfaces:**
- Consumes: `summarize` (Task 1); `RouteStore`, `kvStore`, `memStore` (Task 2); `injectMeta`, `notFoundHtml` (Task 5).
- Produces: `makeRouteHandler(store: RouteStore, template: string)` returning a `(req, res)` handler; default export uses `kvStore()` + the built `dist/index.html`.

- [ ] **Step 1: Write the failing test**

```ts
// api/t/code.test.ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd flight-animator && npx vitest run api/t/code.test.ts`
Expected: FAIL — `Cannot find module './[code]'`.

- [ ] **Step 3: Write minimal implementation**

```ts
// api/t/[code].ts
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { summarize } from '../_lib/shortcode';
import { injectMeta, notFoundHtml } from '../_lib/render';
import { kvStore, type RouteStore } from '../_lib/store';

const OG_IMAGE = 'https://flights.sailingnaturali.com/og-default.png';

export function makeRouteHandler(store: RouteStore, template: string) {
  return async function handler(req: VercelRequest, res: VercelResponse) {
    const code = String(req.query.code ?? '');
    const d = await store.getRoute(code);
    if (!d) return res.status(404).setHeader('content-type', 'text/html').send(notFoundHtml());
    store.incrHits(code).catch(() => {}); // best effort; never blocks the page
    const { title, description } = summarize(d);
    const html = injectMeta(template, { title, description, d, image: OG_IMAGE });
    return res.status(200).setHeader('content-type', 'text/html').send(html);
  };
}

// Read the built template lazily (first request), NOT at import time — unit tests import this
// module before `dist/` exists, so a top-level readFileSync would crash the test run.
let cachedTemplate: string | null = null;
function template(): string {
  if (cachedTemplate === null) cachedTemplate = readFileSync(join(process.cwd(), 'dist/index.html'), 'utf8');
  return cachedTemplate;
}
export default function handler(req: VercelRequest, res: VercelResponse) {
  return makeRouteHandler(kvStore(), template())(req, res);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd flight-animator && npx vitest run api/t/code.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Add the placeholder OG image and wire Vercel routing**

Create a 1200×630 placeholder so `og-default.png` resolves (replace with branded art later):
```bash
cd flight-animator
printf '' > public/og-default.png   # placeholder; swap for real 1200x630 art before launch
```

Replace `vercel.json` with:
```json
{
  "buildCommand": "npm run build",
  "outputDirectory": "dist",
  "functions": {
    "api/t/[code].ts": { "includeFiles": "dist/index.html" }
  },
  "rewrites": [
    { "source": "/t/:code", "destination": "/api/t/:code" },
    { "source": "/(.*)", "destination": "/index.html" }
  ]
}
```
The `/t/:code` rewrite must precede the SPA catch-all. `includeFiles` bundles the built `dist/index.html` into the function's filesystem so `readFileSync` works at runtime.

- [ ] **Step 6: Run the full suite + build to confirm nothing regressed**

Run: `cd flight-animator && npm test && npm run build`
Expected: all vitest pass; `tsc -b && vite build` completes (this produces `dist/index.html` the function reads).

- [ ] **Step 7: Commit**

```bash
cd flight-animator
git add api/t/[code].ts api/t/code.test.ts public/og-default.png vercel.json
git commit -m "feat(shortlink): GET /t/[code] serves app with OG card + visit count"
```

---

### Task 7: `GET /api/stats` (token-guarded)

**Files:**
- Create: `flight-animator/api/stats.ts`
- Test: `flight-animator/api/stats.test.ts`

**Interfaces:**
- Consumes: `RouteStore`, `kvStore`, `memStore` (Task 2).
- Produces: `makeStatsHandler(store: RouteStore, token: string)`; default export uses `kvStore()` + `process.env.STATS_TOKEN`. Success body: `{ top: Array<{ code: string; hits: number }> }`.

- [ ] **Step 1: Write the failing test**

```ts
// api/stats.test.ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd flight-animator && npx vitest run api/stats.test.ts`
Expected: FAIL — `Cannot find module './stats'`.

- [ ] **Step 3: Write minimal implementation**

```ts
// api/stats.ts
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { kvStore, type RouteStore } from './_lib/store';

export function makeStatsHandler(store: RouteStore, token: string) {
  return async function handler(req: VercelRequest, res: VercelResponse) {
    const auth = req.headers.authorization ?? '';
    if (!token || auth !== `Bearer ${token}`) return res.status(401).json({ error: 'unauthorized' });
    const n = Number(req.query.n ?? 50) || 50;
    return res.status(200).json({ top: await store.topTrips(n) });
  };
}

export default makeStatsHandler(kvStore(), process.env.STATS_TOKEN ?? '');
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd flight-animator && npx vitest run api/stats.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
cd flight-animator
git add api/stats.ts api/stats.test.ts
git commit -m "feat(shortlink): token-guarded GET /api/stats"
```

---

### Task 8: App bootstrap reads `window.__FLIGHT_ROUTE__`

**Files:**
- Create: `flight-animator/src/route/source.ts`
- Test: `flight-animator/src/route/source.test.ts`
- Modify: `flight-animator/src/App.tsx:60`

**Interfaces:**
- Produces: `routeSearch(injected: string | undefined, locationSearch: string, locationHash: string): string`.
- Consumes (in App): existing `extractRoute` (unchanged) now fed by `routeSearch(...)`.

- [ ] **Step 1: Write the failing test**

```ts
// src/route/source.test.ts
import { describe, it, expect } from 'vitest';
import { routeSearch } from './source';

describe('routeSearch', () => {
  it('prefers the injected route global as a ?d= search', () => {
    expect(routeSearch('eyJ2IjoxfQ', '?r=sfo-lhr', '')).toBe('?d=eyJ2IjoxfQ');
  });
  it('falls back to location.search when no global', () => {
    expect(routeSearch(undefined, '?r=sfo-lhr', '')).toBe('?r=sfo-lhr');
  });
  it('falls back to the hash when search is empty', () => {
    expect(routeSearch(undefined, '', '#r=sfo-lhr')).toBe('r=sfo-lhr');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd flight-animator && npx vitest run src/route/source.test.ts`
Expected: FAIL — `Cannot find module './source'`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/route/source.ts
// A short link (/t/<code>) is served with the route payload injected as window.__FLIGHT_ROUTE__.
// When present it wins over the URL; otherwise we read the query string (or hash) as before.
export function routeSearch(injected: string | undefined, locationSearch: string, locationHash: string): string {
  if (injected) return `?d=${injected}`;
  return locationSearch || locationHash.replace('#', '');
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd flight-animator && npx vitest run src/route/source.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Wire it into App.tsx**

In `src/App.tsx`, add the import near the other `./route/*` imports:
```ts
import { routeSearch } from './route/source';
```
Then replace the line at `src/App.tsx:60`:
```ts
    const search = window.location.search || window.location.hash.replace('#', '');
```
with:
```ts
    const injected = (window as Window & { __FLIGHT_ROUTE__?: string }).__FLIGHT_ROUTE__;
    const search = routeSearch(injected, window.location.search, window.location.hash);
```

- [ ] **Step 6: Verify build + full suite**

Run: `cd flight-animator && npm test && npm run build`
Expected: all pass; build succeeds.

- [ ] **Step 7: Commit**

```bash
cd flight-animator
git add src/route/source.ts src/route/source.test.ts src/App.tsx
git commit -m "feat(shortlink): boot app from injected __FLIGHT_ROUTE__ on /t/<code>"
```

---

### Task 9: App Share button shortens with long-URL fallback

**Files:**
- Create: `flight-animator/src/route/shareClient.ts`
- Test: `flight-animator/src/route/shareClient.test.ts`
- Modify: `flight-animator/src/App.tsx:168` (`onShare`)

**Interfaces:**
- Consumes: nothing new; uses global `fetch` (injectable for tests).
- Produces: `shortenShareUrl(longUrl: string, sharePath: string, fetchImpl?: typeof fetch): Promise<string>`.

- [ ] **Step 1: Write the failing test**

```ts
// src/route/shareClient.test.ts
import { describe, it, expect, vi } from 'vitest';
import { shortenShareUrl } from './shareClient';

const LONG = 'https://flights.sailingnaturali.com/?d=eyJ2IjoxfQ';

describe('shortenShareUrl', () => {
  it('returns the short url when /api/shorten succeeds', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ url: 'https://flights.sailingnaturali.com/t/abc123def456' }),
    });
    const out = await shortenShareUrl(LONG, '?d=eyJ2IjoxfQ', fetchImpl as any);
    expect(out).toBe('https://flights.sailingnaturali.com/t/abc123def456');
    expect(fetchImpl).toHaveBeenCalledWith('/api/shorten', expect.objectContaining({ method: 'POST' }));
  });
  it('falls back to the long url when the response is not ok', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, json: async () => ({}) });
    expect(await shortenShareUrl(LONG, '?d=eyJ2IjoxfQ', fetchImpl as any)).toBe(LONG);
  });
  it('falls back to the long url when fetch throws', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error('offline'));
    expect(await shortenShareUrl(LONG, '?d=eyJ2IjoxfQ', fetchImpl as any)).toBe(LONG);
  });
  it('does not call the network for a non-rich (?r=) path', async () => {
    const fetchImpl = vi.fn();
    const longR = 'https://flights.sailingnaturali.com/?r=sfo-lhr';
    expect(await shortenShareUrl(longR, '?r=sfo-lhr', fetchImpl as any)).toBe(longR);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd flight-animator && npx vitest run src/route/shareClient.test.ts`
Expected: FAIL — `Cannot find module './shareClient'`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/route/shareClient.ts
// Trade the long ?d= URL for a short /t/<code> link via /api/shorten. Only rich (?d=) routes are
// shortened — ?r= links are already short. Any failure falls back to the long URL so sharing never
// breaks when the shortener is down or offline.
export async function shortenShareUrl(
  longUrl: string,
  sharePath: string,
  fetchImpl: typeof fetch = fetch,
): Promise<string> {
  const d = new URLSearchParams(sharePath.replace(/^\?/, '')).get('d');
  if (!d) return longUrl;
  try {
    const res = await fetchImpl('/api/shorten', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ d }),
    });
    if (!res.ok) return longUrl;
    const body = (await res.json()) as { url?: string };
    return body.url ?? longUrl;
  } catch {
    return longUrl;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd flight-animator && npx vitest run src/route/shareClient.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Wire it into App.tsx**

In `src/App.tsx`, add the import:
```ts
import { shortenShareUrl } from './route/shareClient';
```
Replace the `onShare` function at `src/App.tsx:168`:
```ts
  function onShare() {
    const path = buildSharePath(richRaw, input, units);
    if (!path) return;
    const url = `${window.location.origin}${window.location.pathname}${path}`;
    navigator.clipboard?.writeText(url).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    });
  }
```
with:
```ts
  async function onShare() {
    const path = buildSharePath(richRaw, input, units);
    if (!path) return;
    const longUrl = `${window.location.origin}${window.location.pathname}${path}`;
    const url = await shortenShareUrl(longUrl, path);
    await navigator.clipboard?.writeText(url);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  }
```

- [ ] **Step 6: Verify build + full suite**

Run: `cd flight-animator && npm test && npm run build`
Expected: all pass; build succeeds.

- [ ] **Step 7: Commit**

```bash
cd flight-animator
git add src/route/shareClient.ts src/route/shareClient.test.ts src/App.tsx
git commit -m "feat(shortlink): Share button copies short link, falls back to long URL"
```

---

### Task 10: MCP `shorten_url` helper (stdlib, fallback)

**Files:**
- Modify: `flighty-mcp/flighty_mcp/animator.py`
- Test: `flighty-mcp/tests/test_shorten.py`

**Interfaces:**
- Produces: `shorten_url(long_url: str, *, timeout: float = 3.0) -> str` — POSTs the `?d=` payload to `{base}/api/shorten`, returns `{base}/t/<code>`; returns `long_url` unchanged on any failure or for non-`?d=` URLs.

- [ ] **Step 1: Write the failing test**

```python
# tests/test_shorten.py
import json
from unittest.mock import patch, MagicMock

from flighty_mcp.animator import shorten_url

LONG = "https://flights.sailingnaturali.com/?d=eyJ2IjoxfQ"


def _resp(status, body):
    m = MagicMock()
    m.status = status
    m.read.return_value = json.dumps(body).encode()
    m.__enter__.return_value = m
    m.__exit__.return_value = False
    return m


def test_returns_short_url_on_success():
    short = "https://flights.sailingnaturali.com/t/abc123def456"
    with patch("urllib.request.urlopen", return_value=_resp(200, {"url": short})):
        assert shorten_url(LONG) == short


def test_falls_back_on_non_200():
    with patch("urllib.request.urlopen", return_value=_resp(500, {})):
        assert shorten_url(LONG) == LONG


def test_falls_back_on_exception():
    with patch("urllib.request.urlopen", side_effect=OSError("offline")):
        assert shorten_url(LONG) == LONG


def test_passes_through_url_without_d():
    plain = "https://flights.sailingnaturali.com/?r=sfo-lhr"
    with patch("urllib.request.urlopen") as m:
        assert shorten_url(plain) == plain
        m.assert_not_called()
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd flighty-mcp && uv run pytest tests/test_shorten.py -q`
Expected: FAIL — `ImportError: cannot import name 'shorten_url'`.

- [ ] **Step 3: Write minimal implementation**

Append to `flighty_mcp/animator.py` (the `import json` / `import os` lines already exist at the top; add `urllib.request`):
```python
import urllib.request  # add alongside the existing `import base64/json/os` at the top of the file


def shorten_url(long_url: str, *, timeout: float = 3.0) -> str:
    """Trade a `{base}/?d=<payload>` URL for a short `{base}/t/<code>` link via the shortener.

    Returns the original URL unchanged on any failure, or when there's no `?d=` payload to shorten,
    so a shortener outage never blocks the animate_trip response.
    """
    marker = "/?d="
    if marker not in long_url:
        return long_url
    base, payload = long_url.split(marker, 1)
    try:
        req = urllib.request.Request(
            f"{base}/api/shorten",
            data=json.dumps({"d": payload}).encode("utf-8"),
            headers={"content-type": "application/json"},
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            if resp.status != 200:
                return long_url
            body = json.loads(resp.read())
        return body.get("url") or long_url
    except Exception:
        return long_url
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd flighty-mcp && uv run pytest tests/test_shorten.py -q`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
cd flighty-mcp
git add flighty_mcp/animator.py tests/test_shorten.py
git commit -m "feat: shorten_url helper with long-URL fallback"
```

---

### Task 11: MCP `apply_shortening` + wire into `animate_trip`

**Files:**
- Modify: `flighty-mcp/flighty_mcp/animator.py` (add `apply_shortening`)
- Modify: `flighty-mcp/flighty_mcp/server.py:animate_trip`
- Test: `flighty-mcp/tests/test_shorten.py` (extend)

**Interfaces:**
- Consumes: `shorten_url` (Task 10).
- Produces: `apply_shortening(result: dict, *, enabled: bool, shorten=shorten_url) -> dict` — when `result["status"] == "ok"` and `enabled`, replaces `url` and (if present) `round_trip_url` with shortened versions; otherwise returns `result` untouched.

- [ ] **Step 1: Write the failing test (append to tests/test_shorten.py)**

```python
from flighty_mcp.animator import apply_shortening


def test_apply_shortening_replaces_urls_when_enabled():
    result = {"status": "ok", "url": "L1", "round_trip_url": "L2"}
    out = apply_shortening(result, enabled=True, shorten=lambda u: f"short:{u}")
    assert out["url"] == "short:L1"
    assert out["round_trip_url"] == "short:L2"


def test_apply_shortening_noop_when_disabled():
    result = {"status": "ok", "url": "L1", "round_trip_url": None}
    out = apply_shortening(result, enabled=False, shorten=lambda u: "NOPE")
    assert out["url"] == "L1"


def test_apply_shortening_skips_non_ok_status():
    result = {"status": "confirm_home", "inferred_home": "YVR"}
    out = apply_shortening(result, enabled=True, shorten=lambda u: "NOPE")
    assert out == {"status": "confirm_home", "inferred_home": "YVR"}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd flighty-mcp && uv run pytest tests/test_shorten.py -q`
Expected: FAIL — `ImportError: cannot import name 'apply_shortening'`.

- [ ] **Step 3: Write minimal implementation**

Append to `flighty_mcp/animator.py`:
```python
def apply_shortening(result: dict, *, enabled: bool, shorten=shorten_url) -> dict:
    """Replace the long share URLs in an animate_trip result with short links, in place.

    No-op unless the result is a successful trip and shortening is enabled. `round_trip_url` may be
    None (one-way trip) and is left as-is in that case.
    """
    if result.get("status") != "ok" or not enabled:
        return result
    result["url"] = shorten(result["url"])
    if result.get("round_trip_url"):
        result["round_trip_url"] = shorten(result["round_trip_url"])
    return result
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd flighty-mcp && uv run pytest tests/test_shorten.py -q`
Expected: PASS (7 tests total).

- [ ] **Step 5: Wire into the tool boundary**

In `flighty_mcp/server.py`, add imports near the top:
```python
import os

from flighty_mcp.animator import apply_shortening
```
Replace the body of `animate_trip` (currently `return trips.find_trip(...)`):
```python
    result = trips.find_trip(destination, origin=origin, after=after, before=before)
    enabled = os.environ.get("FLIGHT_ANIMATOR_SHORTEN", "1") not in ("0", "false", "")
    return apply_shortening(result, enabled=enabled)
```

- [ ] **Step 6: Run the full MCP suite to confirm no regression**

Run: `cd flighty-mcp && uv run pytest -q`
Expected: all pass. The pure `trips.find_trip` tests are unaffected (shortening is applied only at the `server.py` tool boundary, which they don't exercise).

- [ ] **Step 7: Commit**

```bash
cd flighty-mcp
git add flighty_mcp/animator.py flighty_mcp/server.py tests/test_shorten.py
git commit -m "feat: animate_trip returns short links (env-gated, fallback to long ?d=)"
```

---

## Deployment & manual verification (after all tasks)

These are operator steps, not code — run once the branch is merged/previewed.

1. **Provision Vercel KV** on the flight-animator project (Vercel dashboard → Storage → KV/Upstash). It injects `KV_*` env vars automatically.
2. **Set `STATS_TOKEN`** env var (a random secret) on the project for `/api/stats`.
3. **Replace `public/og-default.png`** with real branded 1200×630 art.
4. Deploy a preview: `cd flight-animator && npx vercel` (or push the branch if Git-connected).
5. **End-to-end check** on the preview URL with a real multi-leg payload:
   - `curl -sX POST $PREVIEW/api/shorten -H 'content-type: application/json' -d '{"d":"<rich payload>"}'` → returns `{code,url}`.
   - Open the returned `/t/<code>` → the animation boots; View Source shows the `og:title`/`og:description` for the trip and `window.__FLIGHT_ROUTE__`.
   - Send the `/t/<code>` link in iMessage → a titled unfurl card appears naming the route.
   - `curl -s $PREVIEW/api/stats -H "Authorization: Bearer $STATS_TOKEN"` → shows the code with `hits >= 1`.
6. Point `FLIGHT_ANIMATOR_BASE_URL` (MCP) at production once live; confirm `animate_trip` returns a `/t/<code>` URL and still returns the long `?d=` URL if the shortener is unreachable.

## Self-Review notes (coverage vs. spec)

- Shortener endpoint, content-addressed codes, idempotency, collision guard → Tasks 1, 3, 4.
- KV storage (`route:`/`hits:`/`trips`), no TTL → Task 2.
- `/t/[code]` serves app + OG meta + injected payload, no redirect → Tasks 5, 6.
- Built-in visit counter + token-guarded stats → Tasks 2, 6, 7.
- App boots from `__FLIGHT_ROUTE__`; Share button shortens with fallback → Tasks 8, 9.
- MCP emits short links with graceful fallback, no new runtime deps → Tasks 10, 11.
- Out of scope (dynamic OG image, vanity codes, GSC) → intentionally omitted.
