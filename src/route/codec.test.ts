import { describe, it, expect } from 'vitest';
import { extractRoute, decodeSimple, encodeSimple, decodeRich, encodeRich } from './codec';
import type { RawStop } from './types';
import golden from './__fixtures__/golden-d.json';

describe('extractRoute', () => {
  it('reads ?r= from a full URL', () => {
    expect(extractRoute('https://x.dev/?r=sfo-lhr-cdg')).toEqual({ form: 'simple', value: 'sfo-lhr-cdg' });
  });
  it('prefers ?d= over ?r=', () => {
    expect(extractRoute('?r=sfo-lhr&d=ABC')).toEqual({ form: 'rich', value: 'ABC' });
  });
  it('treats a bare value as simple', () => {
    expect(extractRoute('sfo-lhr-cdg')).toEqual({ form: 'simple', value: 'sfo-lhr-cdg' });
  });
  it('returns null for empty input', () => {
    expect(extractRoute('')).toBeNull();
  });
});

describe('decodeSimple', () => {
  it('decodes airport codes', () => {
    expect(decodeSimple('sfo-lhr-cdg')).toEqual([
      { code: 'SFO' }, { code: 'LHR' }, { code: 'CDG' },
    ]);
  });
  it('decodes a coordinate stop with a negative longitude and label', () => {
    expect(decodeSimple('sfo-48.76,-122.5|Cabin')).toEqual([
      { code: 'SFO' },
      { lat: 48.76, lon: -122.5, label: 'Cabin' },
    ]);
  });
  it('round-trips through encodeSimple', () => {
    const stops: RawStop[] = [{ code: 'SFO' }, { lat: 48.76, lon: -122.5, label: 'Cabin' }];
    expect(decodeSimple(encodeSimple(stops))).toEqual(stops);
  });
  it('throws on an incomplete coordinate token', () => {
    expect(() => decodeSimple('48.76,')).toThrow();
  });
});

describe('decodeRich', () => {
  it('decodes the golden vector', () => {
    expect(decodeRich(golden.encoded)).toEqual(golden.stops);
  });
  it('round-trips through encodeRich', () => {
    expect(decodeRich(encodeRich(golden.stops as RawStop[]))).toEqual(golden.stops);
  });
});
