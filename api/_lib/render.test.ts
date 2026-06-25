import { describe, it, expect } from 'vitest';
import { injectMeta, notFoundHtml } from './render';

const TEMPLATE = '<!doctype html><html><head><title>x</title></head><body></body></html>';

describe('injectMeta', () => {
  it('injects OG meta and the route global before </head>', () => {
    const out = injectMeta(TEMPLATE, {
      title: 'Victoria → Berlin',
      description: 'Mar 2025 · 3 legs',
      d: 'eyJ2IjoxfQ',
      image: 'https://flights.sailingnaturali.com/og-default.png',
    });
    expect(out).toContain('<meta property="og:title" content="Victoria → Berlin">');
    expect(out).toContain('<meta property="og:description" content="Mar 2025 · 3 legs">');
    expect(out).toContain('window.__FLIGHT_ROUTE__="eyJ2IjoxfQ"');
    expect(out.indexOf('og:title')).toBeLessThan(out.indexOf('</head>'));
  });
  it('HTML-escapes the title/description content', () => {
    const out = injectMeta(TEMPLATE, { title: 'A & B "<x>"', description: 'd', d: 'z', image: 'i' });
    expect(out).toContain('content="A &amp; B &quot;&lt;x&gt;&quot;"');
  });
});

describe('notFoundHtml', () => {
  it('returns a friendly 404 page linking home', () => {
    expect(notFoundHtml()).toContain('https://flights.sailingnaturali.com');
  });
});
