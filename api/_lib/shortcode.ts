import { createHash } from 'node:crypto';
import { decodeRich } from '../../src/route/codec.js';
import type { RawStop } from '../../src/route/types.js';

const B62 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
export const MAX_PAYLOAD_BYTES = 4096;
const MIN_STOPS = 2;
const MAX_STOPS = 60;

function toBase62(hex: string): string {
  let n = BigInt('0x' + hex);
  if (n === 0n) return '0';
  let out = '';
  while (n > 0n) {
    out = B62[Number(n % 62n)] + out;
    n /= 62n;
  }
  return out;
}

export function fullCode(d: string): string {
  return toBase62(createHash('sha256').update(d).digest('hex'));
}

export function validate(d: string): boolean {
  if (!d || d.length > MAX_PAYLOAD_BYTES) return false;
  try {
    const stops = decodeRich(d);
    return Array.isArray(stops) && stops.length >= MIN_STOPS && stops.length <= MAX_STOPS;
  } catch {
    return false;
  }
}

function label(s: RawStop): string {
  return s.label ?? s.code ?? `${s.lat},${s.lon}`;
}

export function summarize(d: string): { title: string; description: string } {
  const stops = decodeRich(d);
  const title = `${label(stops[0])} → ${label(stops[stops.length - 1])}`;
  const legs = stops.length - 1;
  const parts: string[] = [];
  const depart = stops[0].depart;
  if (depart) {
    const t = new Date(depart);
    if (!Number.isNaN(t.getTime())) {
      parts.push(t.toLocaleString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' }));
    }
  }
  parts.push(`${legs} leg${legs === 1 ? '' : 's'}`);
  return { title, description: parts.join(' · ') };
}
