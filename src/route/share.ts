import type { DistanceUnit } from '../geo/legstats';
import { extractRoute, decodeSimple, encodeSimple } from './codec';

// Build the query portion of a shareable link from the current route + units. Everything normalizes
// to a clean ?r= of airport codes — the only form a static host can serve. A pasted ?d= blob has no
// friendly equivalent here (App downgrades decodable rich routes to the code form before this runs,
// so what's left is undecodable), and yields no link rather than one that outlives the shortener.
// ponytail: ?d= stays readable inbound so old long links keep working; we just never emit one.
export function buildSharePath(input: string, units: DistanceUnit): string {
  const r = extractRoute(input.trim());
  let query = '';

  if (r?.form === 'simple') {
    try {
      query = `r=${encodeSimple(decodeSimple(r.value))}`;
    } catch {
      query = `r=${r.value}`;
    }
  }

  if (query && units !== 'km') query += `&u=${units}`;
  return query ? `?${query}` : '';
}
