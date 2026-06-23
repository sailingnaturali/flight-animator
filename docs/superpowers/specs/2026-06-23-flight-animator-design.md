# flight-animator — flight travel animation web app

**Date:** 2026-06-23
**Status:** Approved design, pre-implementation
**Author:** Bryan + Claude

## Purpose

A small, standalone web app that animates air travel across a map — a plane flying
along curved (great-circle) arcs from stop to stop, pausing at each to reflect a
layover/stay, with city labels fading in as the plane lands. The "Indiana Jones"
travel-map feel, modernized (clean, not old-timey).

The near-term reason to build it is to **visualize Flighty trip data**: the
`flighty-mcp` server emits geo-ready legs (airport codes, coordinates, dates,
departure/arrival times), and this app turns an ordered list of stops into a
shareable animation. It is also usable on its own by typing a route by hand.

Target devices: desktop, phone, and iPad (responsive, touch-friendly). The app is
fully client-side so it loads anywhere and works offline once cached.

## Non-goals (v1)

- No backend, no server-side rendering, no database, no auth.
- No built-in video export. Recording is done by the user via screen capture (the
  3-second lead-in exists for exactly this). Built-in capture is a clean later add.
- No live Flighty integration in the app itself. The app never calls the MCP or
  reads the Flighty DB; it only consumes a route encoded in a URL or pasted in.
- No free-text place-name geocoding (no Nominatim). Stops are airport codes or
  explicit `lat,lon|Label` coordinates.
- No visible speed control in v1. Pacing uses a tuned default. An adjustable speed
  is a possible later add.
- No airport-picker dropdown in v1 (paste box only). The dropdown is a planned
  later add that reuses the bundled airport table.

## Tech & hosting

- **Vite + TypeScript SPA**, **MapLibre GL JS** for the map (dark minimal style,
  free tiles — e.g. a free vector style; final style source chosen in the plan).
- React for the small UI shell (paste box, buttons, overlays).
- **Static deploy on Vercel**, served from a stable domain (e.g.
  `flights.sailingnaturali.com`) so the MCP can encode links against it. New repo
  `flight-animator` under the `sailingnaturali` org. MIT (no copyrighted data).
- Fully client-side; no backend. Works offline after first load.

## Look & feel (decided)

- **Flat 2D map** (not a 3D globe). Camera pans/zooms to frame the active leg.
- **Dark minimal** base style: near-black land, dim labels, so the arc and plane
  glow. Most cinematic and reads well in screen recordings.
- The flight arc is a **great-circle** curve; the traversed portion fills in behind
  the plane as a solid trail. Past stops stay marked with dots. (Exact arc color /
  width / dot styling is tunable during implementation; a warm red/amber arc on
  dark is the starting point.)

## Input model

A route is an **ordered list of stops**. The plane flies stop→stop and pauses at
each. Two ways a route gets into the app, both decoding to the same waypoint list:

### Stop identity

- **Airport code** — resolved against a bundled IATA table to city, country,
  lat/lon (offline, no network).
- **Coordinate escape hatch** — `lat,lon|Label` for non-airport points (a cabin, a
  port, a marina). Mixed freely with codes.

### Two URL encodings

1. **Simple / human:** `?r=sfo-lhr-cdg`
   - Dash-separated stops; airport codes case-insensitive.
   - A stop may be `48.76,-122.5|Cabin`.
   - Uniform dwell (no per-stop stay), no dates.
   - Easy to hand-type or paste.
2. **Rich / MCP:** `?d=<base64url-json>`
   - Self-contained JSON: an array of stops, each
     `{ code? , lat?, lon?, label, arrive?, depart? }` (ISO 8601).
   - The Flighty MCP produces this. Coordinates can be embedded so the app needs no
     lookup, but a `code` is also accepted (resolved via the table).
   - **Dwell** at a stop is computed from the gap between that stop's `arrive` and
     the next stop's `depart`. **Dates** for label stamps come from these fields.

The paste box accepts either the bare `r=` form (e.g. `sfo-lhr-cdg`) or a full URL
containing `?r=`/`?d=`. On load, the app reads `window.location` for `r`/`d` and
pre-fills.

### Bundled airport table

- `public/airports.json`: compact `IATA → { city, country, lat, lon }`, lazy-loaded
  on first parse. Scoped to airports with scheduled service to keep it small
  (final scope decided in the plan). This same table will back the future dropdown.

## Animation behavior

### Pacing

- Each **leg duration is distance-scaled and clamped** (e.g. ~2–8s): longer flights
  visibly take longer, but nothing drags or blinks past.
- Each **dwell pause is scaled from the `arrive`→`depart` gap and clamped**: a short
  connection ≈ a brief beat, a multi-day stay ≈ a held pause. When no dates are
  present (simple `r=` routes), dwell falls back to a uniform short pause.
- Concrete clamp/scale constants are tuned during implementation; defaults live in
  one place (the timeline module) so they're easy to adjust.

### Labels

- As the plane reaches a stop, the stop's **city/name label fades in** next to its
  dot and stays. Past stops remain labeled.
- A **date stamp** is shown per stop **when the route carries dates** (rich `d=`
  routes), and omitted when it doesn't (simple `r=` routes).
- No trip title in v1 (easy later add).

### Camera

- **idle:** framed to the whole route (all arcs faintly drawn, all dots placed).
- **playing:** pans/zooms to keep the active leg framed.
- **done:** eases back to show the full completed route.

## Playback flow & controls

State machine (`controller`):

1. **idle** — whole route shown faintly. Visible controls: the **route input**,
   **Start** (enabled only when the route parses to ≥2 valid stops), and a
   **Fullscreen** toggle.
2. **countdown** — pressing Start **hides all controls** and runs a **3-second**
   countdown, giving time to begin a screen recording.
3. **playing** — plane flies each leg; arc trail fills in; labels (+ date stamps
   when present) fade in on arrival; dwell pause holds before the next leg. No UI
   chrome on screen — only map, arcs, dots, labels, plane.
4. **done** — plane rests at the final stop, full route shown; **Replay** and
   **New trip** controls fade in. Replay re-runs the same route; New trip returns
   to idle with the input focused.

**The three idle controls (input, Start, Fullscreen) all disappear during
countdown and playing**, so screen recordings are clean.

## Responsive / devices

- Single full-bleed map. Controls overlay (bottom-center), sized for touch.
- Works portrait (phone) and landscape (iPad/desktop). Fullscreen toggle helps on
  all three. No layout that depends on hover.

## Module layout

```
flight-animator/
  src/
    route/
      codec.ts        # encode/decode route <-> URL params (?r= simple, ?d= rich base64)
      parse.ts        # tokens -> resolved waypoints (codes, lat,lon|Label, dwell, dates)
      airports.ts     # lookup over the bundled IATA table
    geo/
      greatcircle.ts  # interpolate point + bearing along a great-circle arc
      timeline.ts     # waypoints -> timed plan (distance-scaled legs clamped; dwell pauses)
    map/
      mapview.ts      # MapLibre setup, dark style, draw arcs/dots/labels, plane marker
    play/
      controller.ts   # state machine: idle -> countdown(3s) -> playing -> done
    ui/
      App.tsx         # responsive shell: input, Start, Fullscreen; hide-during-play; Replay/New
  public/
    airports.json     # compact IATA -> {city, country, lat, lon}, lazy-loaded
  index.html
  package.json
  vite.config.ts
  .github/workflows/ci.yml
  README.md
```

**Data flow:** URL or paste box → `codec`/`parse` → resolved waypoints (coords,
label, optional date, optional dwell) → `timeline` builds a timed plan →
`controller` drives the clock → `mapview` renders each frame (plane
position/bearing via `greatcircle`, labels on arrival). The pure units (`codec`,
`parse`, `airports`, `greatcircle`, `timeline`) hold the logic; `mapview` stays a
thin renderer.

## Error handling

- **Unknown airport code:** the offending token is reported in the input UI; Start
  stays disabled until the route resolves.
- **Malformed `lat,lon|Label`:** clear inline message naming the bad stop.
- **Fewer than 2 stops:** Start disabled with a hint ("add at least two stops").
- **Bad `?d=` payload (not valid base64/JSON):** fall back to an empty input with a
  non-blocking notice rather than a blank crash.
- **Missing dates in a rich route:** dwell/labels degrade gracefully (uniform dwell,
  no date stamp) instead of erroring.

## Testing & CI

- **TDD with vitest.** The pure units carry coverage:
  - `codec`: round-trip encode/decode for both `?r=` and `?d=`, the
    `lat,lon|Label` escape, malformed input → clear errors.
  - `parse` / `airports`: code resolution, unknown-code handling, dwell derived
    from date gaps, coordinate escape hatch.
  - `greatcircle`: known great-circle waypoints (e.g. SFO→LHR midpoint) and bearing
    at sample fractions.
  - `timeline`: leg-duration clamping, dwell scaling, total-duration math, uniform
    fallback when dateless.
  - `controller`: state transitions (idle→countdown→playing→done; Replay; New
    trip), Start-enabled gating.
- `mapview` is kept thin and verified by hand; an optional Playwright smoke test
  (loads a `?r=` route, presses Start, asserts it reaches `done`) is a later add.
- **CI:** GitHub Actions — install, `vitest`, lint, `build`.

## MCP coupling (informative — not built here)

`flighty-mcp` should gain a way to emit a `?d=` URL (or the bare encoded payload)
for a set of flights, encoding each leg's airport/coords, label, and
arrive/depart times. That work lives in the `flighty-mcp` repo and is out of scope
for this spec; this app only defines and consumes the encoding.

## Open items resolved in implementation

- Final dark map style source and exact arc/dot/plane styling constants.
- Pacing constants (leg clamp range, dwell scale/clamp, countdown easing).
- Scope and size of the bundled `airports.json`.
- Exact domain / Vercel project wiring.
