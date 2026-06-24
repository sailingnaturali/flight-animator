import type { RawStop } from './types';
import type { DistanceUnit } from '../geo/legstats';
import { extractRoute, decodeSimple, encodeSimple, encodeRich } from './codec';

// Build the query portion of a shareable link from the current route + units. A rich route that's
// still loaded re-encodes to ?d= (exact replay with coords + dates); anything else normalizes to a
// clean ?r=. The units suffix is omitted for the default (km) so canonical links stay tidy.
export function buildSharePath(richRaw: RawStop[] | null, input: string, units: DistanceUnit): string {
  const trimmed = input.trim();
  let query = '';

  if (richRaw && trimmed === encodeSimple(richRaw)) {
    query = `d=${encodeRich(richRaw)}`;
  } else {
    const r = extractRoute(trimmed);
    if (r?.form === 'rich') {
      query = `d=${r.value}`;
    } else if (r?.form === 'simple') {
      try {
        query = `r=${encodeSimple(decodeSimple(r.value))}`;
      } catch {
        query = `r=${r.value}`;
      }
    }
  }

  if (query && units !== 'km') query += `&u=${units}`;
  return query ? `?${query}` : '';
}
