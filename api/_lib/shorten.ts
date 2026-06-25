import { fullCode, validate } from './shortcode.js';
import type { RouteStore } from './store.js';

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
