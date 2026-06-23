# Flight Animator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a standalone client-side web app that animates a plane flying along great-circle arcs between an ordered list of stops, driven by a route pasted in or encoded in a URL.

**Architecture:** A Vite + React + TypeScript SPA. All logic lives in small pure modules (URL codec, airport lookup, route parsing, great-circle math, animation timeline, playback state machine) that are unit-tested in isolation. A thin MapLibre renderer and a React shell wire them to the screen. No backend; deployed static on Vercel.

**Tech Stack:** Vite, TypeScript, React 18, MapLibre GL JS, Vitest, ESLint. Node 20+.

## Global Constraints

- **Node:** 20+ (Vite 5 requirement).
- **License:** MIT. No copyrighted data; airport data is from OurAirports (public domain).
- **No backend / no network at runtime** except loading `/airports.json` (same-origin static asset) and map tiles. No geocoding APIs.
- **Pure modules stay DOM-free:** everything under `src/route/`, `src/geo/`, `src/play/` must be testable in Vitest's default (node) environment — no `window`, `document`, or `maplibre-gl` imports.
- **TDD:** every pure module is written test-first.
- **Commit after every passing task.**
- **`?d=` payload schema is a shared contract** with `flighty-mcp`'s `animator-route` spec. The golden vector in Task 3 (`src/route/__fixtures__/golden-d.json`) is canonical; the MCP side must encode byte-identically.

---

### Task 1: Project scaffold

**Files:**
- Create: `package.json`, `vite.config.ts`, `tsconfig.json`, `tsconfig.node.json`, `index.html`, `src/main.tsx`, `src/App.tsx`, `vitest.config.ts`, `.eslintrc.cjs`, `src/smoke.test.ts`, `.github/workflows/ci.yml`, `.github/dependabot.yml`

**Interfaces:**
- Produces: a buildable, testable repo. `npm test`, `npm run build`, `npm run lint` all pass.

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "flight-animator",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "preview": "vite preview",
    "test": "vitest run",
    "test:watch": "vitest",
    "lint": "eslint . --ext .ts,.tsx"
  },
  "dependencies": {
    "maplibre-gl": "^4.7.1",
    "react": "^18.3.1",
    "react-dom": "^18.3.1"
  },
  "devDependencies": {
    "@types/react": "^18.3.12",
    "@types/react-dom": "^18.3.1",
    "@typescript-eslint/eslint-plugin": "^8.15.0",
    "@typescript-eslint/parser": "^8.15.0",
    "@vitejs/plugin-react": "^4.3.3",
    "eslint": "^8.57.1",
    "typescript": "^5.6.3",
    "vite": "^5.4.11",
    "vitest": "^2.1.5"
  }
}
```

- [ ] **Step 2: Create config files**

`vite.config.ts`:
```ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({ plugins: [react()] });
```

`vitest.config.ts`:
```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({ test: { environment: 'node', include: ['src/**/*.test.ts'] } });
```

`tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "useDefineForClassFields": true,
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true
  },
  "include": ["src"],
  "references": [{ "path": "./tsconfig.node.json" }]
}
```

`tsconfig.node.json`:
```json
{
  "compilerOptions": {
    "composite": true,
    "skipLibCheck": true,
    "module": "ESNext",
    "moduleResolution": "bundler",
    "allowSyntheticDefaultImports": true,
    "strict": true
  },
  "include": ["vite.config.ts", "vitest.config.ts"]
}
```

`.eslintrc.cjs`:
```cjs
module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  plugins: ['@typescript-eslint'],
  extends: ['eslint:recommended', 'plugin:@typescript-eslint/recommended'],
  env: { browser: true, es2022: true, node: true },
  ignorePatterns: ['dist', 'node_modules', 'scripts'],
};
```

- [ ] **Step 3: Create entry points**

`index.html`:
```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
    <title>Flight Animator</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

`src/main.tsx`:
```tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
```

`src/App.tsx` (placeholder, replaced in Task 9):
```tsx
export default function App() {
  return <div>Flight Animator</div>;
}
```

- [ ] **Step 4: Write a smoke test**

`src/smoke.test.ts`:
```ts
import { describe, it, expect } from 'vitest';

describe('smoke', () => {
  it('runs', () => {
    expect(1 + 1).toBe(2);
  });
});
```

- [ ] **Step 5: Create CI workflow**

`.github/workflows/ci.yml`:
```yaml
name: CI
on:
  push:
    branches: [main]
  pull_request:
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
      - uses: actions/setup-node@v6
        with:
          node-version: '20'
          cache: 'npm'
      - run: npm ci
      - run: npm run lint
      - run: npm test
      - run: npm run build
```

> Action versions match the signalk-plugin repos (`checkout@v7`, `setup-node@v6`); Dependabot (next step) keeps them current.

- [ ] **Step 6: Add the GitHub Actions updater**

`.github/dependabot.yml` — mirrors the signalk-plugin repos: one grouped weekly PR that bumps every action we use. (Adds an `npm` group too, since this repo carries app dependencies the plugin repos don't.)
```yaml
version: 2
updates:
  # Keeps every GitHub Action we use current in a single grouped weekly PR.
  - package-ecosystem: github-actions
    directory: /
    schedule:
      interval: weekly
    groups:
      github-actions:
        patterns:
          - "*"
  - package-ecosystem: npm
    directory: /
    schedule:
      interval: weekly
    groups:
      npm:
        patterns:
          - "*"
```

- [ ] **Step 7: Install and verify**

Run: `npm install && npm test && npm run build`
Expected: test passes (1 file, 1 test), build produces `dist/`.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "chore: scaffold Vite + React + TS + Vitest project + CI + dependabot"
```

---

### Task 2: Great-circle geometry

**Files:**
- Create: `src/geo/types.ts`, `src/geo/greatcircle.ts`, `src/geo/greatcircle.test.ts`

**Interfaces:**
- Produces:
  - `interface LngLat { lat: number; lon: number }`
  - `distanceKm(a: LngLat, b: LngLat): number`
  - `interpolate(a: LngLat, b: LngLat, f: number): LngLat` — point at fraction `f` (0..1) along the great circle (spherical slerp).
  - `bearing(a: LngLat, b: LngLat, f: number): number` — forward bearing in degrees (0..360) at fraction `f`.

- [ ] **Step 1: Write the failing test**

`src/geo/greatcircle.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { distanceKm, interpolate, bearing } from './greatcircle';

const SFO = { lat: 37.62, lon: -122.38 };
const LHR = { lat: 51.47, lon: -0.45 };

describe('distanceKm', () => {
  it('matches the known SFO->LHR great-circle distance (~8600 km)', () => {
    expect(distanceKm(SFO, LHR)).toBeGreaterThan(8500);
    expect(distanceKm(SFO, LHR)).toBeLessThan(8700);
  });
  it('is zero for identical points', () => {
    expect(distanceKm(SFO, SFO)).toBeCloseTo(0, 5);
  });
});

describe('interpolate', () => {
  it('returns endpoints at f=0 and f=1', () => {
    expect(interpolate(SFO, LHR, 0).lat).toBeCloseTo(SFO.lat, 4);
    expect(interpolate(SFO, LHR, 1).lon).toBeCloseTo(LHR.lon, 4);
  });
  it('midpoint lies between the endpoints in latitude', () => {
    const mid = interpolate(SFO, LHR, 0.5);
    expect(mid.lat).toBeGreaterThan(50); // great circle bows north
  });
});

describe('bearing', () => {
  it('initial SFO->LHR heading is north-easterly (~30-50 deg)', () => {
    const b = bearing(SFO, LHR, 0);
    expect(b).toBeGreaterThan(20);
    expect(b).toBeLessThan(60);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- greatcircle`
Expected: FAIL (module not found).

- [ ] **Step 3: Write the implementation**

`src/geo/types.ts`:
```ts
export interface LngLat {
  lat: number;
  lon: number;
}
```

`src/geo/greatcircle.ts`:
```ts
import type { LngLat } from './types';

const R = 6371; // km
const toRad = (d: number) => (d * Math.PI) / 180;
const toDeg = (r: number) => (r * 180) / Math.PI;

export function distanceKm(a: LngLat, b: LngLat): number {
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const la1 = toRad(a.lat);
  const la2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(la1) * Math.cos(la2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function interpolate(a: LngLat, b: LngLat, f: number): LngLat {
  const la1 = toRad(a.lat), lo1 = toRad(a.lon);
  const la2 = toRad(b.lat), lo2 = toRad(b.lon);
  const d = distanceKm(a, b) / R; // angular distance (radians)
  if (d === 0) return { lat: a.lat, lon: a.lon };
  const A = Math.sin((1 - f) * d) / Math.sin(d);
  const B = Math.sin(f * d) / Math.sin(d);
  const x = A * Math.cos(la1) * Math.cos(lo1) + B * Math.cos(la2) * Math.cos(lo2);
  const y = A * Math.cos(la1) * Math.sin(lo1) + B * Math.cos(la2) * Math.sin(lo2);
  const z = A * Math.sin(la1) + B * Math.sin(la2);
  return {
    lat: toDeg(Math.atan2(z, Math.sqrt(x * x + y * y))),
    lon: toDeg(Math.atan2(y, x)),
  };
}

export function bearing(a: LngLat, b: LngLat, f: number): number {
  // bearing from the interpolated point toward a slightly-further point
  const p = interpolate(a, b, f);
  const q = interpolate(a, b, Math.min(1, f + 0.001));
  const la1 = toRad(p.lat), la2 = toRad(q.lat);
  const dLon = toRad(q.lon - p.lon);
  const y = Math.sin(dLon) * Math.cos(la2);
  const x = Math.cos(la1) * Math.sin(la2) - Math.sin(la1) * Math.cos(la2) * Math.cos(dLon);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- greatcircle`
Expected: PASS (all cases).

- [ ] **Step 5: Commit**

```bash
git add src/geo
git commit -m "feat: great-circle distance, interpolation, and bearing"
```

---

### Task 3: Route URL codec

**Files:**
- Create: `src/route/types.ts`, `src/route/codec.ts`, `src/route/codec.test.ts`, `src/route/__fixtures__/golden-d.json`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `interface RawStop { code?: string; lat?: number; lon?: number; label?: string; arrive?: string; depart?: string }`
  - `extractRoute(input: string): { form: 'simple' | 'rich'; value: string } | null` — accepts a full URL, a `?…` query, or a bare value; returns the route param (`d` wins over `r`).
  - `decodeSimple(value: string): RawStop[]` / `encodeSimple(stops: RawStop[]): string`
  - `decodeRich(b64: string): RawStop[]` / `encodeRich(stops: RawStop[]): string`

- [ ] **Step 1: Write the failing test**

`src/route/codec.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { extractRoute, decodeSimple, encodeSimple, decodeRich, encodeRich } from './codec';
import type { RawStop } from './types';
import golden from './__fixtures__/golden-d.json';

describe('extractRoute', () => {
  it('reads ?r= from a full URL', () => {
    expect(extractRoute('https://x.dev/?r=sfo-lhr-cdg')).toEqual({ form: 'simple', value: 'sfo-lhr-cdg' });
  });
  it('prefers ?d= over ?r=', () => {
    expect(extractRoute('?r=sfo-lhr&d=ABC')).toEqual({ form: 'rich', value: 'ABC' });
  });
  it('treats a bare value as simple', () => {
    expect(extractRoute('sfo-lhr-cdg')).toEqual({ form: 'simple', value: 'sfo-lhr-cdg' });
  });
  it('returns null for empty input', () => {
    expect(extractRoute('')).toBeNull();
  });
});

describe('decodeSimple', () => {
  it('decodes airport codes', () => {
    expect(decodeSimple('sfo-lhr-cdg')).toEqual([
      { code: 'SFO' }, { code: 'LHR' }, { code: 'CDG' },
    ]);
  });
  it('decodes a coordinate stop with a negative longitude and label', () => {
    expect(decodeSimple('sfo-48.76,-122.5|Cabin')).toEqual([
      { code: 'SFO' },
      { lat: 48.76, lon: -122.5, label: 'Cabin' },
    ]);
  });
  it('round-trips through encodeSimple', () => {
    const stops: RawStop[] = [{ code: 'SFO' }, { lat: 48.76, lon: -122.5, label: 'Cabin' }];
    expect(decodeSimple(encodeSimple(stops))).toEqual(stops);
  });
  it('throws on an incomplete coordinate token', () => {
    expect(() => decodeSimple('48.76,')).toThrow();
  });
});

describe('decodeRich', () => {
  it('decodes the golden vector', () => {
    expect(decodeRich(golden.encoded)).toEqual(golden.stops);
  });
  it('round-trips through encodeRich', () => {
    expect(decodeRich(encodeRich(golden.stops as RawStop[]))).toEqual(golden.stops);
  });
});
```

- [ ] **Step 2: Create the golden fixture**

`src/route/__fixtures__/golden-d.json` — generate `encoded` as base64url of `JSON.stringify({ v: 1, stops })` with this exact `stops` array (compute the string once during Step 4 and paste it back here so the test is pinned):
```json
{
  "stops": [
    { "code": "SFO", "label": "San Francisco", "depart": "2025-04-15T14:30:00Z" },
    { "code": "LHR", "label": "London", "arrive": "2025-04-15T22:15:00Z", "depart": "2025-04-18T09:00:00Z" },
    { "code": "CDG", "label": "Paris", "arrive": "2025-04-18T10:20:00Z" }
  ],
  "encoded": "PASTE_AFTER_FIRST_RUN"
}
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm test -- codec`
Expected: FAIL (module not found).

- [ ] **Step 4: Write the implementation**

`src/route/types.ts`:
```ts
export interface RawStop {
  code?: string;
  lat?: number;
  lon?: number;
  label?: string;
  arrive?: string; // ISO 8601
  depart?: string; // ISO 8601
}

export interface Waypoint {
  lat: number;
  lon: number;
  label: string;
  code?: string;
  country?: string;
  arrive?: string;
  depart?: string;
}

export type AirportTable = Record<string, { city: string; country: string; lat: number; lon: number }>;
```

`src/route/codec.ts`:
```ts
import type { RawStop } from './types';

const CODE_RE = /^[A-Za-z]{3}$/;
const COORD_RE = /^-?\d+(\.\d+)?,-?\d+(\.\d+)?(\|.+)?$/;

function isCompleteStop(token: string): boolean {
  return CODE_RE.test(token) || COORD_RE.test(token);
}

function parseStop(token: string): RawStop {
  if (CODE_RE.test(token)) return { code: token.toUpperCase() };
  const [coords, label] = token.split('|');
  const [lat, lon] = coords.split(',').map(Number);
  const stop: RawStop = { lat, lon, label: label ?? `${lat},${lon}` };
  return stop;
}

export function extractRoute(input: string): { form: 'simple' | 'rich'; value: string } | null {
  if (!input) return null;
  const q = input.includes('?') ? input.slice(input.indexOf('?') + 1) : input;
  if (q.includes('=')) {
    const params = new URLSearchParams(q);
    const d = params.get('d');
    if (d) return { form: 'rich', value: d };
    const r = params.get('r');
    if (r) return { form: 'simple', value: r };
    return null;
  }
  return { form: 'simple', value: input };
}

export function decodeSimple(value: string): RawStop[] {
  const parts = value.split('-');
  const stops: RawStop[] = [];
  let cur = '';
  for (const part of parts) {
    cur = cur === '' ? part : `${cur}-${part}`;
    if (isCompleteStop(cur)) {
      stops.push(parseStop(cur));
      cur = '';
    }
  }
  if (cur !== '') throw new Error(`Incomplete stop in route: "${cur}"`);
  return stops;
}

export function encodeSimple(stops: RawStop[]): string {
  return stops
    .map((s) =>
      s.code
        ? s.code.toLowerCase()
        : `${s.lat},${s.lon}${s.label ? `|${s.label}` : ''}`,
    )
    .join('-');
}

function b64urlEncode(s: string): string {
  return btoa(unescape(encodeURIComponent(s))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64urlDecode(s: string): string {
  const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - (s.length % 4));
  return decodeURIComponent(escape(atob(s.replace(/-/g, '+').replace(/_/g, '/') + pad)));
}

export function encodeRich(stops: RawStop[]): string {
  return b64urlEncode(JSON.stringify({ v: 1, stops }));
}

export function decodeRich(b64: string): RawStop[] {
  const obj = JSON.parse(b64urlDecode(b64));
  if (!obj || !Array.isArray(obj.stops)) throw new Error('Invalid rich route payload');
  return obj.stops as RawStop[];
}
```

> Note: `btoa`/`atob` exist in browsers and modern Node (18+). Vitest's node env provides them.

- [ ] **Step 5: Pin the golden `encoded` value**

Run this once to print the canonical string, then paste it into `golden-d.json`'s `encoded` field:
```bash
node -e "const{encodeRich}=await import('./src/route/codec.ts').catch(()=>({}));" 2>/dev/null; \
node --input-type=module -e "
const stops=[{code:'SFO',label:'San Francisco',depart:'2025-04-15T14:30:00Z'},{code:'LHR',label:'London',arrive:'2025-04-15T22:15:00Z',depart:'2025-04-18T09:00:00Z'},{code:'CDG',label:'Paris',arrive:'2025-04-18T10:20:00Z'}];
const s=JSON.stringify({v:1,stops});
console.log(Buffer.from(s).toString('base64url'));
"
```
Paste the printed value into `golden-d.json`. (Node's `base64url` matches the codec's `b64urlEncode` output for this ASCII payload.)

- [ ] **Step 6: Run test to verify it passes**

Run: `npm test -- codec`
Expected: PASS (all cases, including the golden vector).

- [ ] **Step 7: Commit**

```bash
git add src/route/types.ts src/route/codec.ts src/route/codec.test.ts src/route/__fixtures__
git commit -m "feat: route URL codec (simple ?r= and rich ?d=) with golden vector"
```

---

### Task 4: Airport lookup

**Files:**
- Create: `src/route/airports.ts`, `src/route/airports.test.ts`

**Interfaces:**
- Consumes: `AirportTable` from `src/route/types.ts`.
- Produces:
  - `lookupAirport(table: AirportTable, code: string): { lat: number; lon: number; city: string; country: string } | null` (case-insensitive)
  - `loadAirports(): Promise<AirportTable>` — fetches `/airports.json`, memoized.

- [ ] **Step 1: Write the failing test**

`src/route/airports.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { lookupAirport } from './airports';
import type { AirportTable } from './types';

const table: AirportTable = {
  SFO: { city: 'San Francisco', country: 'US', lat: 37.62, lon: -122.38 },
  LHR: { city: 'London', country: 'GB', lat: 51.47, lon: -0.45 },
};

describe('lookupAirport', () => {
  it('finds a code case-insensitively', () => {
    expect(lookupAirport(table, 'sfo')?.city).toBe('San Francisco');
  });
  it('returns null for an unknown code', () => {
    expect(lookupAirport(table, 'ZZZ')).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- airports`
Expected: FAIL (module not found).

- [ ] **Step 3: Write the implementation**

`src/route/airports.ts`:
```ts
import type { AirportTable } from './types';

export function lookupAirport(table: AirportTable, code: string) {
  const entry = table[code.toUpperCase()];
  return entry ?? null;
}

let cache: Promise<AirportTable> | null = null;

export function loadAirports(): Promise<AirportTable> {
  if (!cache) {
    cache = fetch('/airports.json').then((r) => {
      if (!r.ok) throw new Error('Failed to load airport data');
      return r.json() as Promise<AirportTable>;
    });
  }
  return cache;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- airports`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/route/airports.ts src/route/airports.test.ts
git commit -m "feat: airport table lookup + lazy loader"
```

---

### Task 5: Route parsing & resolution

**Files:**
- Create: `src/route/parse.ts`, `src/route/parse.test.ts`

**Interfaces:**
- Consumes: `RawStop`, `Waypoint`, `AirportTable` (`src/route/types.ts`); `lookupAirport` (Task 4).
- Produces:
  - `resolveStops(raw: RawStop[], table: AirportTable): { waypoints: Waypoint[]; errors: string[] }`
  - `isPlayable(r: { waypoints: Waypoint[]; errors: string[] }): boolean` — true iff no errors and ≥2 waypoints.

- [ ] **Step 1: Write the failing test**

`src/route/parse.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { resolveStops, isPlayable } from './parse';
import type { AirportTable } from './types';

const table: AirportTable = {
  SFO: { city: 'San Francisco', country: 'US', lat: 37.62, lon: -122.38 },
  LHR: { city: 'London', country: 'GB', lat: 51.47, lon: -0.45 },
};

describe('resolveStops', () => {
  it('resolves airport codes to waypoints with coordinates and label', () => {
    const { waypoints, errors } = resolveStops([{ code: 'SFO' }, { code: 'LHR' }], table);
    expect(errors).toEqual([]);
    expect(waypoints[0]).toMatchObject({ lat: 37.62, lon: -122.38, label: 'San Francisco', code: 'SFO', country: 'US' });
  });
  it('carries arrive/depart and an explicit label through', () => {
    const { waypoints } = resolveStops(
      [{ code: 'LHR', label: 'Home', arrive: '2025-04-15T22:15:00Z' }],
      table,
    );
    expect(waypoints[0].label).toBe('Home');
    expect(waypoints[0].arrive).toBe('2025-04-15T22:15:00Z');
  });
  it('keeps a coordinate stop as-is', () => {
    const { waypoints } = resolveStops([{ lat: 48.76, lon: -122.5, label: 'Cabin' }], table);
    expect(waypoints[0]).toMatchObject({ lat: 48.76, lon: -122.5, label: 'Cabin' });
  });
  it('reports an unknown code and omits it from waypoints', () => {
    const { waypoints, errors } = resolveStops([{ code: 'SFO' }, { code: 'ZZZ' }], table);
    expect(waypoints).toHaveLength(1);
    expect(errors[0]).toContain('ZZZ');
  });
});

describe('isPlayable', () => {
  it('is false with fewer than two stops', () => {
    expect(isPlayable({ waypoints: [{ lat: 0, lon: 0, label: 'a' }], errors: [] })).toBe(false);
  });
  it('is false when there are errors', () => {
    expect(isPlayable({ waypoints: [{ lat: 0, lon: 0, label: 'a' }, { lat: 1, lon: 1, label: 'b' }], errors: ['x'] })).toBe(false);
  });
  it('is true with two clean stops', () => {
    expect(isPlayable({ waypoints: [{ lat: 0, lon: 0, label: 'a' }, { lat: 1, lon: 1, label: 'b' }], errors: [] })).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- parse`
Expected: FAIL (module not found).

- [ ] **Step 3: Write the implementation**

`src/route/parse.ts`:
```ts
import type { RawStop, Waypoint, AirportTable } from './types';
import { lookupAirport } from './airports';

export function resolveStops(
  raw: RawStop[],
  table: AirportTable,
): { waypoints: Waypoint[]; errors: string[] } {
  const waypoints: Waypoint[] = [];
  const errors: string[] = [];

  for (const s of raw) {
    if (s.code) {
      const a = lookupAirport(table, s.code);
      if (!a) {
        errors.push(`Unknown airport code: ${s.code}`);
        continue;
      }
      waypoints.push({
        lat: a.lat, lon: a.lon,
        label: s.label ?? a.city,
        code: s.code.toUpperCase(),
        country: a.country,
        arrive: s.arrive, depart: s.depart,
      });
    } else if (typeof s.lat === 'number' && typeof s.lon === 'number') {
      waypoints.push({
        lat: s.lat, lon: s.lon,
        label: s.label ?? `${s.lat},${s.lon}`,
        arrive: s.arrive, depart: s.depart,
      });
    } else {
      errors.push('Stop is missing a code or coordinates');
    }
  }

  return { waypoints, errors };
}

export function isPlayable(r: { waypoints: Waypoint[]; errors: string[] }): boolean {
  return r.errors.length === 0 && r.waypoints.length >= 2;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- parse`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/route/parse.ts src/route/parse.test.ts
git commit -m "feat: resolve raw stops into validated waypoints"
```

---

### Task 6: Animation timeline

**Files:**
- Create: `src/geo/timeline.ts`, `src/geo/timeline.test.ts`

**Interfaces:**
- Consumes: `Waypoint` (`src/route/types.ts`); `distanceKm` (Task 2).
- Produces:
  - ```ts
    type Phase =
      | { type: 'leg'; fromIndex: number; toIndex: number; startMs: number; durMs: number; distanceKm: number }
      | { type: 'dwell'; atIndex: number; startMs: number; durMs: number };
    interface TimedPlan { totalMs: number; phases: Phase[] }
    ```
  - `legDurationMs(distanceKm: number): number` — distance-scaled, clamped 2000..8000.
  - `dwellDurationMs(arrive?: string, depart?: string): number` — date-scaled clamped 600..4000; uniform 800 when dateless.
  - `buildPlan(waypoints: Waypoint[]): TimedPlan`

- [ ] **Step 1: Write the failing test**

`src/geo/timeline.test.ts`:
```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- timeline`
Expected: FAIL (module not found).

- [ ] **Step 3: Write the implementation**

`src/geo/timeline.ts`:
```ts
import type { Waypoint } from '../route/types';
import { distanceKm } from './greatcircle';

export type Phase =
  | { type: 'leg'; fromIndex: number; toIndex: number; startMs: number; durMs: number; distanceKm: number }
  | { type: 'dwell'; atIndex: number; startMs: number; durMs: number };

export interface TimedPlan {
  totalMs: number;
  phases: Phase[];
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

export function legDurationMs(km: number): number {
  const MIN = 2000, MAX = 8000;
  const f = clamp(Math.log10(km + 1) / Math.log10(20000), 0, 1);
  return clamp(MIN + (MAX - MIN) * f, MIN, MAX);
}

export function dwellDurationMs(arrive?: string, depart?: string): number {
  if (!arrive || !depart) return 800;
  const hours = (Date.parse(depart) - Date.parse(arrive)) / 3_600_000;
  if (!Number.isFinite(hours) || hours <= 0) return 800;
  return clamp(600 + 1500 * Math.log10(hours + 1), 600, 4000);
}

export function buildPlan(waypoints: Waypoint[]): TimedPlan {
  const phases: Phase[] = [];
  let t = 0;
  for (let i = 0; i < waypoints.length - 1; i++) {
    const km = distanceKm(waypoints[i], waypoints[i + 1]);
    const durMs = legDurationMs(km);
    phases.push({ type: 'leg', fromIndex: i, toIndex: i + 1, startMs: t, durMs, distanceKm: km });
    t += durMs;
    const isIntermediate = i < waypoints.length - 2;
    if (isIntermediate) {
      const at = waypoints[i + 1];
      const durDwell = dwellDurationMs(at.arrive, at.depart);
      phases.push({ type: 'dwell', atIndex: i + 1, startMs: t, durMs: durDwell });
      t += durDwell;
    }
  }
  return { totalMs: t, phases };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- timeline`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/geo/timeline.ts src/geo/timeline.test.ts
git commit -m "feat: build a timed animation plan from waypoints"
```

---

### Task 7: Playback controller

**Files:**
- Create: `src/play/controller.ts`, `src/play/controller.test.ts`

**Interfaces:**
- Consumes: `TimedPlan`, `Phase` (Task 6); `Waypoint` (`src/route/types.ts`); `interpolate`, `bearing` (Task 2).
- Produces:
  - ```ts
    type PlaybackState = 'idle' | 'countdown' | 'playing' | 'done';
    interface Frame {
      state: PlaybackState;
      countdownRemainingMs: number;
      plane: { lat: number; lon: number; bearing: number } | null;
      activeLegIndex: number | null;
      arrivedIndices: number[];
    }
    interface Playback {
      start(nowMs: number): void;
      reset(): void;
      frameAt(nowMs: number): Frame;
    }
    createPlayback(plan: TimedPlan, waypoints: Waypoint[], opts?: { countdownMs?: number }): Playback;
    ```

- [ ] **Step 1: Write the failing test**

`src/play/controller.test.ts`:
```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- controller`
Expected: FAIL (module not found).

- [ ] **Step 3: Write the implementation**

`src/play/controller.ts`:
```ts
import type { TimedPlan } from '../geo/timeline';
import type { Waypoint } from '../route/types';
import { interpolate, bearing } from '../geo/greatcircle';

export type PlaybackState = 'idle' | 'countdown' | 'playing' | 'done';

export interface Frame {
  state: PlaybackState;
  countdownRemainingMs: number;
  plane: { lat: number; lon: number; bearing: number } | null;
  activeLegIndex: number | null;
  arrivedIndices: number[];
}

export interface Playback {
  start(nowMs: number): void;
  reset(): void;
  frameAt(nowMs: number): Frame;
}

const IDLE: Frame = { state: 'idle', countdownRemainingMs: 0, plane: null, activeLegIndex: null, arrivedIndices: [] };

export function createPlayback(
  plan: TimedPlan,
  waypoints: Waypoint[],
  opts: { countdownMs?: number } = {},
): Playback {
  const countdownMs = opts.countdownMs ?? 3000;
  let startTs: number | null = null;

  // arrival time (ms into playback) for each waypoint index
  const arrivalAt: number[] = [0];
  for (const p of plan.phases) {
    if (p.type === 'leg') arrivalAt[p.toIndex] = p.startMs + p.durMs;
  }

  function arrivedBy(playMs: number): number[] {
    const out: number[] = [];
    for (let i = 0; i < waypoints.length; i++) {
      if (arrivalAt[i] !== undefined && playMs >= arrivalAt[i]) out.push(i);
    }
    return out;
  }

  return {
    start(nowMs: number) {
      startTs = nowMs;
    },
    reset() {
      startTs = null;
    },
    frameAt(nowMs: number): Frame {
      if (startTs === null) return IDLE;
      const elapsed = nowMs - startTs;
      if (elapsed < countdownMs) {
        return { ...IDLE, state: 'countdown', countdownRemainingMs: countdownMs - elapsed };
      }
      const playMs = elapsed - countdownMs;
      if (playMs >= plan.totalMs) {
        const last = waypoints[waypoints.length - 1];
        return {
          state: 'done',
          countdownRemainingMs: 0,
          plane: { lat: last.lat, lon: last.lon, bearing: 0 },
          activeLegIndex: null,
          arrivedIndices: waypoints.map((_, i) => i),
        };
      }
      const phase = plan.phases.find((p) => playMs >= p.startMs && playMs < p.startMs + p.durMs)!;
      if (phase.type === 'leg') {
        const a = waypoints[phase.fromIndex];
        const b = waypoints[phase.toIndex];
        const f = (playMs - phase.startMs) / phase.durMs;
        const pos = interpolate(a, b, f);
        return {
          state: 'playing',
          countdownRemainingMs: 0,
          plane: { lat: pos.lat, lon: pos.lon, bearing: bearing(a, b, f) },
          activeLegIndex: phase.fromIndex,
          arrivedIndices: arrivedBy(playMs),
        };
      }
      // dwell: plane parked at the stop
      const at = waypoints[phase.atIndex];
      return {
        state: 'playing',
        countdownRemainingMs: 0,
        plane: { lat: at.lat, lon: at.lon, bearing: 0 },
        activeLegIndex: null,
        arrivedIndices: arrivedBy(playMs),
      };
    },
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- controller`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/play/controller.ts src/play/controller.test.ts
git commit -m "feat: time-driven playback controller (idle/countdown/playing/done)"
```

---

### Task 8: Map renderer

**Files:**
- Create: `src/map/mapview.ts`

**Interfaces:**
- Consumes: `Waypoint` (`src/route/types.ts`); `Frame` (Task 7); `interpolate` (Task 2).
- Produces:
  - `createMapView(container: HTMLElement): MapView`
  - ```ts
    interface MapView {
      onReady(cb: () => void): void;
      setRoute(waypoints: Waypoint[]): void;       // draw faint full route + dots
      renderFrame(frame: Frame, waypoints: Waypoint[]): void; // trail, plane, labels, camera
      reset(): void;
      destroy(): void;
    }
    ```

This module is a thin renderer (no unit test; verified by hand in Task 9). Keep all math in the imported pure modules.

- [ ] **Step 1: Implement the renderer**

`src/map/mapview.ts`:
```ts
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import type { Waypoint } from '../route/types';
import type { Frame } from '../play/controller';
import { interpolate } from '../geo/greatcircle';

const DARK_STYLE = 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json';
const ARC = '#ff5a4d';

function arcLine(a: Waypoint, b: Waypoint, upTo = 1): [number, number][] {
  const pts: [number, number][] = [];
  const steps = 64;
  for (let i = 0; i <= steps; i++) {
    const f = (i / steps) * upTo;
    const p = interpolate(a, b, f);
    pts.push([p.lon, p.lat]);
  }
  return pts;
}

export interface MapView {
  onReady(cb: () => void): void;
  setRoute(waypoints: Waypoint[]): void;
  renderFrame(frame: Frame, waypoints: Waypoint[]): void;
  reset(): void;
  destroy(): void;
}

export function createMapView(container: HTMLElement): MapView {
  const map = new maplibregl.Map({
    container,
    style: DARK_STYLE,
    center: [0, 20],
    zoom: 1.4,
    attributionControl: { compact: true },
  });

  let planeEl: HTMLDivElement | null = null;
  let planeMarker: maplibregl.Marker | null = null;
  const labelMarkers: maplibregl.Marker[] = [];

  function ensureSources() {
    if (!map.getSource('full')) {
      map.addSource('full', { type: 'geojson', data: emptyFc() });
      map.addLayer({ id: 'full', type: 'line', source: 'full', paint: { 'line-color': ARC, 'line-opacity': 0.25, 'line-width': 1.5 } });
    }
    if (!map.getSource('trail')) {
      map.addSource('trail', { type: 'geojson', data: emptyFc() });
      map.addLayer({ id: 'trail', type: 'line', source: 'trail', paint: { 'line-color': ARC, 'line-width': 2.5 } });
    }
    if (!map.getSource('dots')) {
      map.addSource('dots', { type: 'geojson', data: emptyFc() });
      map.addLayer({ id: 'dots', type: 'circle', source: 'dots', paint: { 'circle-radius': 4, 'circle-color': '#fff', 'circle-stroke-color': ARC, 'circle-stroke-width': 1.5 } });
    }
  }

  function emptyFc(): GeoJSON.FeatureCollection {
    return { type: 'FeatureCollection', features: [] };
  }

  function fullRouteFc(wps: Waypoint[]): GeoJSON.FeatureCollection {
    const features = wps.slice(0, -1).map((a, i) => ({
      type: 'Feature' as const,
      geometry: { type: 'LineString' as const, coordinates: arcLine(a, wps[i + 1]) },
      properties: {},
    }));
    return { type: 'FeatureCollection', features };
  }

  function dotsFc(wps: Waypoint[]): GeoJSON.FeatureCollection {
    return {
      type: 'FeatureCollection',
      features: wps.map((w) => ({
        type: 'Feature' as const,
        geometry: { type: 'Point' as const, coordinates: [w.lon, w.lat] },
        properties: {},
      })),
    };
  }

  function fitWhole(wps: Waypoint[]) {
    const b = new maplibregl.LngLatBounds();
    wps.forEach((w) => b.extend([w.lon, w.lat]));
    map.fitBounds(b, { padding: 80, duration: 600 });
  }

  return {
    onReady(cb) {
      map.on('load', cb);
    },
    setRoute(wps) {
      ensureSources();
      (map.getSource('full') as maplibregl.GeoJSONSource).setData(fullRouteFc(wps));
      (map.getSource('dots') as maplibregl.GeoJSONSource).setData(dotsFc(wps));
      (map.getSource('trail') as maplibregl.GeoJSONSource).setData(emptyFc());
      labelMarkers.forEach((m) => m.remove());
      labelMarkers.length = 0;
      fitWhole(wps);
    },
    renderFrame(frame, wps) {
      ensureSources();
      // trail: all completed legs solid, plus partial active leg
      const feats: GeoJSON.Feature[] = [];
      const arrived = new Set(frame.arrivedIndices);
      for (let i = 0; i < wps.length - 1; i++) {
        if (arrived.has(i + 1)) {
          feats.push({ type: 'Feature', geometry: { type: 'LineString', coordinates: arcLine(wps[i], wps[i + 1]) }, properties: {} });
        }
      }
      if (frame.activeLegIndex !== null && frame.plane) {
        const a = wps[frame.activeLegIndex];
        const b = wps[frame.activeLegIndex + 1];
        // approximate fraction from plane distance is unnecessary; redraw whole arc faintly handled by 'full'
        feats.push({ type: 'Feature', geometry: { type: 'LineString', coordinates: arcLineToPlane(a, b, frame.plane) }, properties: {} });
      }
      (map.getSource('trail') as maplibregl.GeoJSONSource).setData({ type: 'FeatureCollection', features: feats });

      // labels for arrived stops
      for (const i of frame.arrivedIndices) {
        if (!labelMarkers[i]) {
          const el = document.createElement('div');
          el.className = 'stop-label';
          el.textContent = wps[i].label + (wps[i].arrive ? ` · ${wps[i].arrive.slice(0, 10)}` : '');
          labelMarkers[i] = new maplibregl.Marker({ element: el, anchor: 'left', offset: [8, 0] })
            .setLngLat([wps[i].lon, wps[i].lat]).addTo(map);
        }
      }

      // plane marker
      if (frame.plane) {
        if (!planeMarker) {
          planeEl = document.createElement('div');
          planeEl.className = 'plane';
          planeEl.textContent = '✈';
          planeMarker = new maplibregl.Marker({ element: planeEl }).setLngLat([frame.plane.lon, frame.plane.lat]).addTo(map);
        }
        planeMarker.setLngLat([frame.plane.lon, frame.plane.lat]);
        if (planeEl) planeEl.style.transform = `rotate(${frame.plane.bearing - 90}deg)`;
      }

      // camera follow the active leg
      if (frame.state === 'playing' && frame.activeLegIndex !== null) {
        const a = wps[frame.activeLegIndex];
        const b = wps[frame.activeLegIndex + 1];
        const mid = interpolate(a, b, 0.5);
        map.easeTo({ center: [mid.lon, mid.lat], duration: 300 });
      }
      if (frame.state === 'done') fitWhole(wps);
    },
    reset() {
      ensureSources();
      (map.getSource('trail') as maplibregl.GeoJSONSource).setData(emptyFc());
      labelMarkers.forEach((m) => m.remove());
      labelMarkers.length = 0;
      if (planeMarker) { planeMarker.remove(); planeMarker = null; planeEl = null; }
    },
    destroy() {
      map.remove();
    },
  };
}

function arcLineToPlane(a: Waypoint, b: Waypoint, plane: { lat: number; lon: number }): [number, number][] {
  // draw the arc and append the plane position as the live endpoint
  const pts = arcLine(a, b);
  pts.push([plane.lon, plane.lat]);
  return pts;
}
```

> The `'full'` layer already shows every leg faintly; `'trail'` overlays completed legs solid plus the in-progress arc to the plane.

- [ ] **Step 2: Verify it type-checks**

Run: `npx tsc -b --noEmit` (or `npm run build` after Task 9 wires it in).
Expected: no type errors.

- [ ] **Step 3: Commit**

```bash
git add src/map/mapview.ts
git commit -m "feat: MapLibre renderer (faint route, trail, plane, labels, camera)"
```

---

### Task 9: App shell & wiring

**Files:**
- Modify: `src/App.tsx`
- Create: `src/styles.css`, `src/usePlayback.ts`

**Interfaces:**
- Consumes: everything from Tasks 2–8.
- Produces: the running app — paste box, Start (gated by `isPlayable`), Fullscreen, hide-during-play, 3-2-1 countdown, Replay / New trip.

- [ ] **Step 1: Create the animation-loop hook**

`src/usePlayback.ts`:
```tsx
import { useEffect, useRef, useState } from 'react';
import type { Waypoint } from './route/types';
import { buildPlan } from './geo/timeline';
import { createPlayback, type Frame } from './play/controller';

const IDLE_FRAME: Frame = { state: 'idle', countdownRemainingMs: 0, plane: null, activeLegIndex: null, arrivedIndices: [] };

export function usePlayback(waypoints: Waypoint[] | null) {
  const [frame, setFrame] = useState<Frame>(IDLE_FRAME);
  const pbRef = useRef<ReturnType<typeof createPlayback> | null>(null);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    pbRef.current = waypoints ? createPlayback(buildPlan(waypoints), waypoints) : null;
    setFrame(IDLE_FRAME);
    return () => cancelAnimationFrame(rafRef.current);
  }, [waypoints]);

  function loop() {
    const pb = pbRef.current;
    if (!pb) return;
    const f = pb.frameAt(performance.now());
    setFrame(f);
    if (f.state !== 'done') rafRef.current = requestAnimationFrame(loop);
  }

  return {
    frame,
    start() {
      pbRef.current?.start(performance.now());
      rafRef.current = requestAnimationFrame(loop);
    },
    reset() {
      cancelAnimationFrame(rafRef.current);
      pbRef.current?.reset();
      setFrame(IDLE_FRAME);
    },
  };
}
```

- [ ] **Step 2: Write the App shell**

`src/App.tsx`:
```tsx
import { useEffect, useMemo, useRef, useState } from 'react';
import './styles.css';
import { extractRoute, decodeSimple, decodeRich } from './route/codec';
import { resolveStops, isPlayable } from './route/parse';
import { loadAirports } from './route/airports';
import type { AirportTable, Waypoint, RawStop } from './route/types';
import { createMapView, type MapView } from './map/mapview';
import { usePlayback } from './usePlayback';

export default function App() {
  const mapRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<MapView | null>(null);
  const [table, setTable] = useState<AirportTable | null>(null);
  const [input, setInput] = useState('');
  const [waypoints, setWaypoints] = useState<Waypoint[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { frame, start, reset } = usePlayback(waypoints);

  // load airport table + map once
  useEffect(() => {
    loadAirports().then(setTable).catch(() => setError('Could not load airport data.'));
    if (mapRef.current && !viewRef.current) {
      viewRef.current = createMapView(mapRef.current);
    }
  }, []);

  // pre-fill from the URL once the table is ready
  useEffect(() => {
    if (!table) return;
    const r = extractRoute(window.location.search || window.location.hash.replace('#', ''));
    if (r) setInput(r.form === 'rich' ? `?d=${r.value}` : r.value);
  }, [table]);

  // resolve input -> waypoints whenever input or table changes
  const resolved = useMemo(() => {
    if (!table || !input.trim()) return null;
    try {
      const r = extractRoute(input.trim());
      if (!r) return null;
      const raw: RawStop[] = r.form === 'rich' ? decodeRich(r.value) : decodeSimple(r.value);
      return resolveStops(raw, table);
    } catch (e) {
      return { waypoints: [], errors: [(e as Error).message] };
    }
  }, [input, table]);

  useEffect(() => {
    if (resolved && isPlayable(resolved)) {
      setWaypoints(resolved.waypoints);
      setError(null);
      viewRef.current?.onReady(() => viewRef.current?.setRoute(resolved.waypoints));
      viewRef.current?.setRoute(resolved.waypoints);
    } else {
      setWaypoints(null);
      setError(resolved?.errors[0] ?? null);
    }
  }, [resolved]);

  // push frames to the map
  useEffect(() => {
    if (waypoints) viewRef.current?.renderFrame(frame, waypoints);
  }, [frame, waypoints]);

  const playing = frame.state === 'countdown' || frame.state === 'playing';
  const canStart = !!resolved && isPlayable(resolved);

  function onStart() {
    viewRef.current?.reset();
    if (waypoints) viewRef.current?.setRoute(waypoints);
    start();
  }
  function onNewTrip() {
    reset();
    viewRef.current?.reset();
    setInput('');
  }
  function onReplay() {
    onStart();
  }
  function toggleFullscreen() {
    if (!document.fullscreenElement) document.documentElement.requestFullscreen?.();
    else document.exitFullscreen?.();
  }

  return (
    <div className="app">
      <div className="map" ref={mapRef} />

      {!playing && frame.state !== 'done' && (
        <div className="controls">
          <input
            className="route-input"
            placeholder="sfo-lhr-cdg  (or paste a flight-animator URL)"
            value={input}
            onChange={(e) => setInput(e.target.value)}
          />
          <button className="btn primary" disabled={!canStart} onClick={onStart}>Start</button>
          <button className="btn" onClick={toggleFullscreen} aria-label="Fullscreen">⛶</button>
          {error && <div className="error">{error}</div>}
        </div>
      )}

      {frame.state === 'countdown' && (
        <div className="countdown">{Math.ceil(frame.countdownRemainingMs / 1000)}</div>
      )}

      {frame.state === 'done' && (
        <div className="controls done">
          <button className="btn primary" onClick={onReplay}>Replay</button>
          <button className="btn" onClick={onNewTrip}>New trip</button>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Write styles**

`src/styles.css`:
```css
* { box-sizing: border-box; }
html, body, #root { margin: 0; height: 100%; background: #0b0e14; }
.app { position: fixed; inset: 0; }
.map { position: absolute; inset: 0; }

.controls {
  position: absolute; left: 50%; bottom: 24px; transform: translateX(-50%);
  display: flex; gap: 8px; align-items: center; flex-wrap: wrap; justify-content: center;
  padding: 10px; background: rgba(12,16,24,.8); border-radius: 12px; backdrop-filter: blur(6px);
  max-width: 92vw;
}
.controls.done { gap: 12px; }
.route-input {
  min-width: 260px; padding: 10px 12px; border-radius: 8px; border: 1px solid #2a3550;
  background: #0e1422; color: #e8eef7; font-size: 16px;
}
.btn {
  padding: 10px 16px; border-radius: 8px; border: 1px solid #2a3550;
  background: #16203a; color: #e8eef7; font-size: 16px; cursor: pointer;
}
.btn.primary { background: #ff5a4d; border-color: #ff5a4d; color: #1a0f0e; font-weight: 600; }
.btn:disabled { opacity: .4; cursor: not-allowed; }
.error { width: 100%; text-align: center; color: #ff9a90; font-size: 13px; }

.countdown {
  position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
  font-size: 22vmin; color: #fff; text-shadow: 0 0 30px rgba(255,90,77,.6); pointer-events: none;
}

.plane { font-size: 22px; line-height: 1; filter: drop-shadow(0 0 6px rgba(255,90,77,.8)); }
.stop-label {
  color: #fff; font: 600 13px system-ui, sans-serif; white-space: nowrap;
  text-shadow: 0 1px 4px #000, 0 0 8px #000; pointer-events: none;
}
```

- [ ] **Step 4: Provide a dev airport table**

So the app runs before Task 10 builds the real file, create a small `public/airports.json` (replaced in Task 10):
```json
{
  "SFO": { "city": "San Francisco", "country": "US", "lat": 37.6213, "lon": -122.379 },
  "LHR": { "city": "London", "country": "GB", "lat": 51.4700, "lon": -0.4543 },
  "CDG": { "city": "Paris", "country": "FR", "lat": 49.0097, "lon": 2.5479 },
  "JFK": { "city": "New York", "country": "US", "lat": 40.6413, "lon": -73.7781 },
  "NRT": { "city": "Tokyo", "country": "JP", "lat": 35.7720, "lon": 140.3929 },
  "SEA": { "city": "Seattle", "country": "US", "lat": 47.4502, "lon": -122.3088 }
}
```

- [ ] **Step 5: Manual verification**

Run: `npm run dev`, open the printed URL.
- Type `sea-sfo-jfk-lhr-cdg`; Start enables; press it; a 3-2-1 countdown runs, the controls vanish, the plane flies leg by leg with labels appearing, and Replay / New trip appear at the end.
- Append `?r=sea-nrt` to the URL and reload; the input pre-fills.
- Type a bad code (`sea-zzz`); Start stays disabled and the error shows.
- Resize to a narrow (phone) width; controls stay reachable and tappable.

- [ ] **Step 6: Verify build & lint**

Run: `npm run lint && npm run build`
Expected: both pass.

- [ ] **Step 7: Commit**

```bash
git add src/App.tsx src/styles.css src/usePlayback.ts public/airports.json
git commit -m "feat: app shell — input, gated Start, countdown, playback, replay/new"
```

---

### Task 10: Real airport data, README, and deploy config

**Files:**
- Create: `scripts/build-airports.mjs`, `README.md`, `vercel.json`
- Modify/replace: `public/airports.json`

**Interfaces:**
- Consumes: nothing at runtime; the script is a build-time data tool.

- [ ] **Step 1: Write the airport-data build script**

`scripts/build-airports.mjs` — downloads the public-domain OurAirports dataset, keeps airports that have an IATA code and scheduled service, and writes a compact table:
```js
// Usage: node scripts/build-airports.mjs
// Produces public/airports.json from OurAirports (public domain).
import { writeFileSync } from 'node:fs';

const URL = 'https://davidmegginson.github.io/ourairports-data/airports.csv';

function parseCsv(text) {
  const rows = [];
  let row = [], field = '', inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') inQ = false;
      else field += c;
    } else if (c === '"') inQ = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (c !== '\r') field += c;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows;
}

const res = await fetch(URL);
if (!res.ok) throw new Error(`Download failed: ${res.status}`);
const rows = parseCsv(await res.text());
const header = rows[0];
const idx = (name) => header.indexOf(name);
const iIata = idx('iata_code'), iLat = idx('latitude_deg'), iLon = idx('longitude_deg');
const iCity = idx('municipality'), iCountry = idx('iso_country'), iSched = idx('scheduled_service');

const table = {};
for (const r of rows.slice(1)) {
  const iata = r[iIata]?.trim();
  if (!iata || iata.length !== 3) continue;
  if (r[iSched]?.trim() !== 'yes') continue;
  const lat = Number(r[iLat]), lon = Number(r[iLon]);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
  table[iata.toUpperCase()] = {
    city: r[iCity]?.trim() || iata.toUpperCase(),
    country: r[iCountry]?.trim() || '',
    lat: Number(lat.toFixed(4)),
    lon: Number(lon.toFixed(4)),
  };
}

writeFileSync('public/airports.json', JSON.stringify(table));
console.log(`Wrote ${Object.keys(table).length} airports to public/airports.json`);
```

- [ ] **Step 2: Run it and sanity-check**

Run: `node scripts/build-airports.mjs`
Expected: prints a count in the few-thousands range; `public/airports.json` exists. Spot-check that `SFO`, `LHR`, `NRT` are present:
```bash
node --input-type=module -e "import fs from 'node:fs'; const t=JSON.parse(fs.readFileSync('public/airports.json')); console.log(t.SFO, t.LHR, t.NRT);"
```

- [ ] **Step 3: Re-run the app against real data**

Run: `npm run dev` and confirm a multi-stop route still animates (the dev table is now replaced by the full one). Then `npm run build`.

- [ ] **Step 4: Add Vercel config**

`vercel.json`:
```json
{
  "buildCommand": "npm run build",
  "outputDirectory": "dist",
  "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }]
}
```

- [ ] **Step 5: Write the README**

`README.md` — cover: what it is; the `?r=` and `?d=` URL forms with examples; the `lat,lon|Label` escape hatch; that the Flighty MCP emits `?d=` links (link to `flighty-mcp`); local dev (`npm install`, `npm run dev`); `node scripts/build-airports.mjs` to refresh airport data; MIT license + OurAirports/data credit. Keep any "why" section ≤8 lines.

- [ ] **Step 6: Commit**

```bash
git add scripts/build-airports.mjs vercel.json README.md public/airports.json
git commit -m "feat: real airport dataset build, README, and Vercel deploy config"
```

---

## Self-Review

**Spec coverage:**
- Standalone static SPA on Vercel → Tasks 1, 10. ✓
- Flat dark MapLibre map, great-circle arcs, trail, dots → Tasks 2, 8. ✓
- Airport-code input + `lat,lon|Label` escape hatch → Tasks 3, 5. ✓
- Two URL encodings (`?r=`, `?d=`) + golden vector contract with flighty-mcp → Task 3. ✓
- Bundled airport table (lazy-loaded), future-dropdown reuse → Tasks 4, 10. ✓
- Distance-scaled clamped legs + dwell from a stop's own arrive→depart, uniform fallback → Task 6. ✓
- Stop labels with date stamp when present → Task 8 (`renderFrame` label markers). ✓
- Playback flow idle→countdown(3s)→playing→done, controls hide during play, Replay / New trip → Tasks 7, 9. ✓
- Three idle controls: input, gated Start, Fullscreen → Task 9. ✓
- Responsive / touch → Task 9 styles + manual verify. ✓
- Vitest + CI (lint, test, build) → Tasks 1–7 tests, Task 1 CI. ✓
- No visible speed control, no geocoding, no export, no dropdown (v1 non-goals) → honored throughout. ✓

**Placeholder scan:** The only intentional fill-in is the golden `encoded` string (Task 3 Step 5 generates and pins it) and the README prose (Task 10 Step 5 enumerates required content). No "TBD"/"handle edge cases" placeholders.

**Type consistency:** `RawStop`/`Waypoint`/`AirportTable` defined once in `src/route/types.ts` (Task 3) and consumed unchanged in Tasks 4–9. `Phase`/`TimedPlan` defined in Task 6, consumed in Task 7. `Frame`/`Playback` defined in Task 7, consumed in Tasks 8–9. `LngLat` defined in Task 2, consumed in `interpolate`/`bearing`/`distanceKm`. Names match across tasks (`buildPlan`, `createPlayback`, `frameAt`, `setRoute`, `renderFrame`, `isPlayable`).
