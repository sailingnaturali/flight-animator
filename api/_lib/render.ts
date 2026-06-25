function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function injectMeta(
  template: string,
  meta: { title: string; description: string; d: string; image: string },
): string {
  const head = [
    `<meta property="og:title" content="${esc(meta.title)}">`,
    `<meta property="og:description" content="${esc(meta.description)}">`,
    `<meta property="og:image" content="${esc(meta.image)}">`,
    `<meta name="twitter:card" content="summary_large_image">`,
    `<meta name="twitter:title" content="${esc(meta.title)}">`,
    `<meta name="twitter:description" content="${esc(meta.description)}">`,
    `<script>window.__FLIGHT_ROUTE__=${JSON.stringify(meta.d)}</script>`,
  ].join('');
  return template.replace('</head>', `${head}</head>`);
}

export function notFoundHtml(): string {
  return [
    '<!doctype html><html><head><meta charset="utf-8"><title>Link not found</title></head>',
    '<body style="font-family:system-ui;background:#10141c;color:#e8edf4;display:grid;',
    'place-content:center;height:100vh;text-align:center">',
    '<div><h1>That link has expired or never existed.</h1>',
    '<p><a style="color:#7ab7ff" href="https://flights.sailingnaturali.com">Start a new trip →</a></p>',
    '</div></body></html>',
  ].join('');
}
