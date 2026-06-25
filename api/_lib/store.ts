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
