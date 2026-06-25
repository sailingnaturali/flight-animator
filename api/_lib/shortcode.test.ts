import { describe, it, expect } from 'vitest';
import { encode, fullCode, validate, summarize } from './shortcode';
import { encodeRich } from '../../src/route/codec';

const berlin = encodeRich([
  { code: 'YYJ', lat: 48.64, lon: -123.43, label: 'Victoria', depart: '2025-03-23T11:25:00-07:00' },
  { code: 'YYZ', lat: 43.68, lon: -79.61, label: 'Toronto' },
  { code: 'MUC', lat: 48.35, lon: 11.79, label: 'Munich' },
  { code: 'BER', lat: 52.36, lon: 13.51, label: 'Berlin', arrive: '2025-03-24T12:00:00+01:00' },
]);

describe('shortcode', () => {
  it('encode is deterministic and 12 base62 chars', () => {
    expect(encode(berlin)).toBe(encode(berlin));
    expect(encode(berlin)).toMatch(/^[0-9A-Za-z]{12}$/);
  });
  it('encode differs for different payloads', () => {
    const other = encodeRich([{ code: 'SFO' }, { code: 'LHR' }]);
    expect(encode(berlin)).not.toBe(encode(other));
  });
  it('encode(len) is a prefix of fullCode', () => {
    expect(fullCode(berlin).startsWith(encode(berlin, 13))).toBe(true);
    expect(encode(berlin, 13)).toHaveLength(13);
  });
  it('validate accepts a real 2+ stop payload', () => {
    expect(validate(berlin)).toBe(true);
  });
  it('validate rejects oversized, garbage, and single-stop', () => {
    expect(validate('x'.repeat(4097))).toBe(false);
    expect(validate('not-base64!!')).toBe(false);
    expect(validate(encodeRich([{ code: 'SFO' }]))).toBe(false);
  });
  it('summarize yields endpoints + date + leg count', () => {
    expect(summarize(berlin)).toEqual({ title: 'Victoria → Berlin', description: 'Mar 2025 · 3 legs' });
  });
});
