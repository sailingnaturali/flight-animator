# flight-animator

A standalone static single-page app that animates multi-stop flight routes on a dark
MapLibre GL map. Great-circle arcs, animated trail, stop-label markers with optional date
stamps. No server, no sign-in — just a URL.

## URL formats

Two interchangeable query-string formats drive the animation. Either can be pasted into the
input box or linked directly.

### `?r=` — simple route (airport codes or coordinates)

Dash-separated IATA codes:

```
https://flight-animator.vercel.app/?r=sfo-lhr-cdg-nrt
```

Coordinate stops use `lat,lon` (and optionally `|Label`) in place of an airport code:

```
https://flight-animator.vercel.app/?r=sfo-48.76,-122.5|Cabin-sea
```

Any stop that isn't a known IATA code and matches `lat,lon` (or `-lat,lon` for negative
latitudes) is treated as a raw coordinate. This is the lat,lon|Label escape hatch for
locations that don't have an airport code. Generated and shared simple-form URLs
percent-encode the label automatically; a hand-typed label containing `-` or `|` should
be percent-encoded (e.g. `Port%2Dau%2DPrince`) or use the richer `?d=` form instead.

### `?d=` — rich route (base64-encoded JSON, with dates and labels)

Carries full metadata — departure/arrival timestamps and per-stop labels — in a compact
base64 blob. The [Flighty MCP](https://github.com/sailingnaturali/flighty-mcp) emits `?d=`
links directly from your Flighty flight history so you can share or replay real itineraries.

```
https://flight-animator.vercel.app/?d=eyJ2IjoxLCJzdG9wcyI6W3siY29kZSI6IlNGTyIsImxhYmVsIjoiU2FuIEZyYW5jaXNjbyIsImRlcGFydCI6IjIwMjUtMDQtMTVUMTQ6MzA6MDBaIn0seyJjb2RlIjoiTEhSIiwibGFiZWwiOiJMb25kb24iLCJhcnJpdmUiOiIyMDI1LTA0LTE1VDIyOjE1OjAwWiIsImRlcGFydCI6IjIwMjUtMDQtMThUMDk6MDA6MDBaIn0seyJjb2RlIjoiQ0RHIiwibGFiZWwiOiJQYXJpcyIsImFycml2ZSI6IjIwMjUtMDQtMThUMTA6MjA6MDBaIn1dfQ
```

When both `?r=` and `?d=` are present, `?d=` takes precedence.

## Local development

```bash
npm install
npm run dev        # Vite dev server at http://localhost:5173
npm run build      # TypeScript check + Vite production build → dist/
npm run test       # Vitest unit tests
npm run lint       # ESLint
```

## Refreshing the airport data

`public/airports.json` is generated from the
[OurAirports public-domain dataset](https://ourairports.com/data/) and committed to the
repo so the app works offline and the build is hermetic. To regenerate it:

```bash
node scripts/build-airports.mjs
```

This downloads `airports.csv` from
[davidmegginson/ourairports-data](https://github.com/davidmegginson/ourairports-data),
keeps only airports with an IATA code and scheduled service, and writes the compact
`{IATA: {city, country, lat, lon}}` table. Commit the result alongside any script changes.

## Deploy

Configured for [Vercel](https://vercel.com) via `vercel.json`. `vercel --prod` or connect
the repo — no environment variables required. All assets are static; the SPA rewrite
handles deep-linked `?r=`/`?d=` URLs.

## License and data credits

MIT — see [LICENSE](LICENSE).

Airport geodata from [OurAirports](https://ourairports.com) /
[davidmegginson/ourairports-data](https://github.com/davidmegginson/ourairports-data),
released to the public domain (CC0).
Map tiles from [MapLibre GL JS](https://maplibre.org).
