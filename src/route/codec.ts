import type { RawStop } from './types';

const CODE_RE = /^[A-Za-z]{3}$/;
const COORD_RE = /^-?\d+(\.\d+)?,-?\d+(\.\d+)?(\|.+)?$/;

function isCompleteStop(token: string): boolean {
  return CODE_RE.test(token) || COORD_RE.test(token);
}

function parseStop(token: string): RawStop {
  if (CODE_RE.test(token)) return { code: token.toUpperCase() };
  const [coords, label] = token.split('|');
  const [lat, lon] = coords.split(',').map(Number);
  const stop: RawStop = { lat, lon, label: label ?? `${lat},${lon}` };
  return stop;
}

export function extractRoute(input: string): { form: 'simple' | 'rich'; value: string } | null {
  if (!input) return null;
  const q = input.includes('?') ? input.slice(input.indexOf('?') + 1) : input;
  if (q.includes('=')) {
    const params = new URLSearchParams(q);
    const d = params.get('d');
    if (d) return { form: 'rich', value: d };
    const r = params.get('r');
    if (r) return { form: 'simple', value: r };
    return null;
  }
  return { form: 'simple', value: input };
}

export function decodeSimple(value: string): RawStop[] {
  const parts = value.split('-');
  const stops: RawStop[] = [];
  let cur = '';
  for (const part of parts) {
    cur = cur === '' ? part : `${cur}-${part}`;
    if (isCompleteStop(cur)) {
      stops.push(parseStop(cur));
      cur = '';
    }
  }
  if (cur !== '') throw new Error(`Incomplete stop in route: "${cur}"`);
  return stops;
}

export function encodeSimple(stops: RawStop[]): string {
  return stops
    .map((s) =>
      s.code
        ? s.code.toLowerCase()
        : `${s.lat},${s.lon}${s.label ? `|${s.label}` : ''}`,
    )
    .join('-');
}

function b64urlEncode(s: string): string {
  return btoa(unescape(encodeURIComponent(s))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64urlDecode(s: string): string {
  const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - (s.length % 4));
  return decodeURIComponent(escape(atob(s.replace(/-/g, '+').replace(/_/g, '/') + pad)));
}

export function encodeRich(stops: RawStop[]): string {
  return b64urlEncode(JSON.stringify({ v: 1, stops }));
}

export function decodeRich(b64: string): RawStop[] {
  const obj = JSON.parse(b64urlDecode(b64));
  if (!obj || !Array.isArray(obj.stops)) throw new Error('Invalid rich route payload');
  return obj.stops as RawStop[];
}
