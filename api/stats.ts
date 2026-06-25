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
