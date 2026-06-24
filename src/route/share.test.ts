import { describe, it, expect } from 'vitest';
import { buildSharePath } from './share';
import { encodeRich, encodeSimple } from './codec';
import type { RawStop } from './types';

describe('buildSharePath', () => {
  it('encodes a simple route as ?r=', () => {
    expect(buildSharePath(null, 'sfo-lhr-cdg', 'km')).toBe('?r=sfo-lhr-cdg');
  });

  it('normalizes case in the simple form', () => {
    expect(buildSharePath(null, 'SFO-LHR', 'km')).toBe('?r=sfo-lhr');
  });

  it('strips a pasted URL down to its route', () => {
    expect(buildSharePath(null, 'https://flights.example/?r=sfo-lhr', 'km')).toBe('?r=sfo-lhr');
  });

  it('appends &u= only when the unit is not the default km', () => {
    expect(buildSharePath(null, 'sfo-lhr', 'mi')).toBe('?r=sfo-lhr&u=mi');
    expect(buildSharePath(null, 'sfo-lhr', 'nm')).toBe('?r=sfo-lhr&u=nm');
    expect(buildSharePath(null, 'sfo-lhr', 'km')).toBe('?r=sfo-lhr');
  });

  it('re-encodes loaded rich stops as ?d= so dates/coords replay exactly', () => {
    const rich: RawStop[] = [
      { code: 'SFO', depart: '2025-04-15T14:30:00Z' },
      { code: 'LHR', arrive: '2025-04-15T22:15:00Z' },
    ];
    expect(buildSharePath(rich, encodeSimple(rich), 'km')).toBe(`?d=${encodeRich(rich)}`);
    expect(buildSharePath(rich, encodeSimple(rich), 'nm')).toBe(`?d=${encodeRich(rich)}&u=nm`);
  });

  it('passes through a pasted rich URL as ?d=', () => {
    const rich: RawStop[] = [{ code: 'SFO' }, { code: 'LHR' }];
    const d = encodeRich(rich);
    expect(buildSharePath(null, `https://flights.example/?d=${d}`, 'km')).toBe(`?d=${d}`);
  });

  it('falls back to the friendly form once the user edits away from the rich route', () => {
    const rich: RawStop[] = [{ code: 'SFO' }, { code: 'LHR' }];
    // input no longer matches the rich friendly form -> treat as a fresh simple route
    expect(buildSharePath(rich, 'sfo-cdg', 'km')).toBe('?r=sfo-cdg');
  });
});
