import type { VercelRequest, VercelResponse } from '@vercel/node';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { summarize } from '../_lib/shortcode.js';
import { injectMeta, notFoundHtml } from '../_lib/render.js';
import { kvStore, type RouteStore } from '../_lib/store.js';

const OG_IMAGE = 'https://flights.sailingnaturali.com/og-default.png';

export function makeRouteHandler(store: RouteStore, template: string) {
  return async function handler(req: VercelRequest, res: VercelResponse) {
    const code = String(req.query.code ?? '');
    const d = await store.getRoute(code);
    if (!d) return res.status(404).setHeader('content-type', 'text/html').send(notFoundHtml());
    store.incrHits(code).catch(() => {}); // best effort; never blocks the page
    let html: string;
    try {
      const { title, description } = summarize(d);
      html = injectMeta(template, { title, description, d, image: OG_IMAGE });
    } catch {
      // Stored payload failed to decode (corrupt or legacy KV value). Still serve the app shell with
      // the route injected so it can attempt to boot — just without a per-trip OG card.
      html = injectMeta(template, { title: 'Flight Animator', description: 'sailingnaturali.com', d, image: OG_IMAGE });
    }
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
