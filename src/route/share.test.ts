import { describe, it, expect } from 'vitest';
import { buildSharePath } from './share';
import { encodeRich } from './codec';
import type { RawStop } from './types';

describe('buildSharePath', () => {
  it('encodes a simple route as ?r=', () => {
    expect(buildSharePath('sfo-lhr-cdg', 'km')).toBe('?r=sfo-lhr-cdg');
  });

  it('normalizes case in the simple form', () => {
    expect(buildSharePath('SFO-LHR', 'km')).toBe('?r=sfo-lhr');
  });

  it('strips a pasted URL down to its route', () => {
    expect(buildSharePath('https://flights.example/?r=sfo-lhr', 'km')).toBe('?r=sfo-lhr');
  });

  it('appends &u= only when the unit is not the default km', () => {
    expect(buildSharePath('sfo-lhr', 'mi')).toBe('?r=sfo-lhr&u=mi');
    expect(buildSharePath('sfo-lhr', 'nm')).toBe('?r=sfo-lhr&u=nm');
    expect(buildSharePath('sfo-lhr', 'km')).toBe('?r=sfo-lhr');
  });

  it('never emits ?d= — a loaded rich route shares as the friendly code form', () => {
    // App downgrades a decodable ?d= link to the code form before this runs, so this is the input.
    expect(buildSharePath('sfo-lhr', 'km')).toBe('?r=sfo-lhr');
  });

  it('yields no link for a ?d= blob left in the box', () => {
    const rich: RawStop[] = [{ code: 'SFO' }, { code: 'LHR' }];
    expect(buildSharePath(`https://flights.example/?d=${encodeRich(rich)}`, 'km')).toBe('');
  });

  it('returns no link for empty input', () => {
    expect(buildSharePath('', 'km')).toBe('');
  });
});
