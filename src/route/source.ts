// A short link (/t/<code>) is served with the route payload injected as window.__FLIGHT_ROUTE__.
// When present it wins over the URL; otherwise we read the query string (or hash) as before.
export function routeSearch(injected: string | undefined, locationSearch: string, locationHash: string): string {
  if (injected) return `?d=${injected}`;
  return locationSearch || locationHash.replace('#', '');
}
