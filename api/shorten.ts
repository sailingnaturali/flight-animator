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
