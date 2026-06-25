import { describe, it, expect, vi } from 'vitest';
import { shortenShareUrl } from './shareClient';

const LONG = 'https://flights.sailingnaturali.com/?d=eyJ2IjoxfQ';

describe('shortenShareUrl', () => {
  it('returns the short url when /api/shorten succeeds', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ url: 'https://flights.sailingnaturali.com/t/abc123def456' }),
    });
    const out = await shortenShareUrl(LONG, '?d=eyJ2IjoxfQ', fetchImpl as any);
    expect(out).toBe('https://flights.sailingnaturali.com/t/abc123def456');
    expect(fetchImpl).toHaveBeenCalledWith('/api/shorten', expect.objectContaining({ method: 'POST' }));
  });
  it('falls back to the long url when the response is not ok', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, json: async () => ({}) });
    expect(await shortenShareUrl(LONG, '?d=eyJ2IjoxfQ', fetchImpl as any)).toBe(LONG);
  });
  it('falls back to the long url when fetch throws', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error('offline'));
    expect(await shortenShareUrl(LONG, '?d=eyJ2IjoxfQ', fetchImpl as any)).toBe(LONG);
  });
  it('does not call the network for a non-rich (?r=) path', async () => {
    const fetchImpl = vi.fn();
    const longR = 'https://flights.sailingnaturali.com/?r=sfo-lhr';
    expect(await shortenShareUrl(longR, '?r=sfo-lhr', fetchImpl as any)).toBe(longR);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
