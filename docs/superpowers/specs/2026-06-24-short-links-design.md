# Flight-Animator Short Links — Design

**Date:** 2026-06-24
**Status:** Approved (brainstorming) — ready for implementation plan
**Repo:** `flight-animator` (static SPA on Vercel, owns `flights.sailingnaturali.com`)

## Problem

A shareable route is encoded entirely in the URL as a base64url `?d=` blob (~600 chars for a
multi-leg trip). Messaging apps mangle URLs that long: iMessage built the link-preview card from
the domain but split the giant query string into the message body as plain text, so the tappable
link was dead. The long URL is fundamentally un-shareable through messaging.

A recorded video was rejected as the fix: large, slow, loses the live interactivity, and — most
importantly — drives no one to the product. **The link itself is the distribution.** A short,
robust link that opens the live animation lets more people see the product without visiting the
site directly. So: keep the link, make it short, store the full payload server-side.

## Goals

- A short, messaging-safe link of the form `https://flights.sailingnaturali.com/t/<code>`.
- Opening it boots the live animation in place (no long URL ever re-surfaces).
- A real unfurl/preview card in iMessage/social that names the route (distribution).
- Exact, owned visit tracking for shared links (the `/t/<code>` endpoint is our chokepoint).
- No new hard dependency on the shortener for existing flows — every writer degrades to the long
  `?d=` URL if the shortener is unreachable.

## Non-goals (explicit follow-ups)

- Dynamic per-trip OG **map image** (text OG card ships now; rendered image is a later pass).
- Custom/vanity codes, link-management UI, expiry.
- Google Search Console / sitemap. GSC measures **organic search** traffic and is blind to
  iMessage/DM/social shares (those are direct/referral). It is a separate, already-pending track
  and is intentionally out of this spec.

## Decisions (from brainstorming)

1. **Hosting:** Vercel Functions + Vercel KV (Upstash Redis) added to the existing flight-animator
   Vercel project. The SPA stays static; we add functions only. Links stay on the product's own
   domain: `flights.sailingnaturali.com/t/<code>`.
2. **Codes:** content-addressed — `code = base62(sha256(d))` truncated. Idempotent, dedupes,
   `store-if-absent`; no collision table, no read-before-write race.
3. **Open behavior:** `/t/[code]` **serves the app HTML** with per-trip Open Graph meta and the
   payload injected as a global (no redirect; URL stays short). Default static OG image for now.
4. **Visit tracking:** built-in per-code counter incremented in the `/t/[code]` function (KV
   `INCR`). In scope for this spec.

## Architecture & data flow

The static SPA is unchanged in how it renders. We add two serverless functions, a KV store, and a
small shared TS module. **Decoding/validation reuses the app's existing `src/route/codec.ts` and
`src/route/parse.ts`** — no duplicated route logic.

```
Create:  client (app Share button OR flighty-mcp)
           └─ POST /api/shorten { d: "<base64url payload>" }
                └─ validate (reuse codec) → code = base62(sha256(d))[:N]
                     └─ KV SETNX route:<code> = d
                          └─ 200 { code, url: "https://flights…/t/<code>" }

Open:    GET /t/<code>
           └─ KV GET route:<code>
                ├─ hit  → KV INCR hits:<code>
                │          200 index.html
                │            + injected <meta og:*>  (title/desc from summarize(d))
                │            + window.__FLIGHT_ROUTE__ = "<d>"
                │            → SPA boots the animation in place (URL stays /t/<code>)
                └─ miss → 404 friendly page (link to home / "start a trip")
```

## Components

### 1. `shortcode` module (new, shared by both functions)
Single purpose: payload ⇄ code, plus a one-line trip summary for OG meta. Independently testable;
depends only on the existing codec/parse for decoding.

- `encode(d: string): string` — `base62(sha256(d))` truncated to the default length.
- `summarize(d: string): { title: string; description: string }` — decode via existing codec,
  derive endpoints + date + leg count, e.g. `{ title: "Victoria → Berlin",
  description: "Mar 2025 · 3 legs" }`.
- `validate(d: string): boolean` — base64url-decodes to valid route JSON within limits.

**Code length & collision guard:** default **12 base62 chars** (≈ 3×10²¹ space — still tiny next
to the 600-char blob). Because codes are content-addressed, the only failure mode is two *different*
payloads hashing to the same truncated code. Guard: on write, if `route:<code>` exists but holds a
*different* payload, lengthen the slice and retry. Astronomically rare; handled, not assumed away.

### 2. `POST /api/shorten` (new function)
- Body: `{ d: "<base64url payload>" }`.
- Validation (reuse codec): decodes to valid route JSON; stop count sane; **size cap ≤ 4 KB**.
  Invalid → `400`.
- `code = encode(d)`; write `route:<code> = d` with `SETNX` (idempotent). Apply collision guard.
- Response: `200 { code, url }`. No TTL — shared links must not rot; content-addressing bounds
  storage growth to unique trips.

### 3. `GET /t/[code]` (new function)
- `KV GET route:<code>`. Miss → `404` friendly page.
- Hit → `KV INCR hits:<code>` (fire-and-forget; a failed counter never blocks the page).
- Serve `index.html` with: injected `<meta property="og:title|og:description|og:image …>` from
  `summarize(d)` + default static `/public` OG image; and `window.__FLIGHT_ROUTE__ = "<d>"` so the
  app boots without a second round-trip. URL stays `/t/<code>`.

### 4. `GET /api/stats` (new function, token-guarded)
- Requires a shared-secret token (env var) so counts aren't public.
- Returns per-code hits and totals (top trips). Keeps tracking owned and simple; no third-party
  analytics. (Reading via the Vercel KV CLI is the fallback if we skip the endpoint.)

### 5. App changes (`flight-animator/src`)
- **Bootstrap** (`src/App.tsx` ~line 60, where it reads `window.location.search`/hash): if
  `window.__FLIGHT_ROUTE__` is present, use it as the route source; else parse the query string as
  today. One small branch.
- **Share button** (`src/App.tsx` `onShare`, ~line 168): make it `async` — POST the current `?d=`
  payload to `/api/shorten`, copy the returned `/t/<code>`. **On any error/offline, fall back to
  copying the long URL** (current behavior). The long `?d=`/`?r=` forms remain fully valid input.

### 6. flighty-mcp changes (`flighty-mcp/flighty_mcp`)
- `animator.py` / `trips.py`: after building the `?d=` URL, call `/api/shorten` and return the
  short `url` / `round_trip_url`. **Fall back to the long `?d=` URL if the shortener is
  unreachable** — no new hard dependency on the MCP's critical path. Base URL from the existing
  `DEFAULT_BASE_URL` / env.

## Storage (Vercel KV / Upstash Redis)

| Key            | Value                  | Notes                                  |
|----------------|------------------------|----------------------------------------|
| `route:<code>` | the raw `d` payload    | `SETNX`, no TTL, permanent             |
| `hits:<code>`  | integer                | `INCR` per open; best-effort           |

Content-addressing bounds `route:*` growth to the number of unique trips — cheap and predictable.

## Error handling

- `/api/shorten`: invalid/oversized payload → `400`; KV write failure → `500` and the **client
  falls back to the long URL**, so a shortener outage never blocks sharing.
- `/t/[code]`: unknown code → `404` friendly page; counter failure is swallowed (never blocks the
  animation).
- App Share button & MCP: any shorten failure → long-`?d=` fallback. Degradation is the default.

## Testing

- **`shortcode`:** `encode` is deterministic (same payload → same code); `summarize` produces the
  expected title/description for a known multi-leg payload; `validate` rejects oversized/garbage.
- **`/api/shorten`:** valid payload → `{code,url}` + stored; oversized/garbage → `400`; idempotent
  (same payload twice → same code, single entry); collision guard lengthens on synthetic clash.
- **`/t/[code]`:** known code → `200` with OG meta + injected `__FLIGHT_ROUTE__`; unknown → `404`;
  `hits:<code>` increments on open.
- **`/api/stats`:** returns counts with token; `401`/`403` without.
- **App:** boots from `window.__FLIGHT_ROUTE__` when present; Share button copies the short link
  and falls back to the long URL on a simulated shorten error.
- **MCP:** returns the short url; falls back to the long `?d=` URL on a simulated shorten failure.

## Rollout

1. Provision Vercel KV on the flight-animator project; wire env (KV creds, stats token).
2. Ship `shortcode` + the three functions + the static OG image; verify end-to-end on a preview
   deploy with a real multi-leg payload.
3. App Share button + bootstrap branch.
4. flighty-mcp short-url emission with fallback.
5. Confirm an iMessage send of a `/t/<code>` link shows a titled unfurl card and opens the live
   animation; confirm `hits:<code>` increments.
