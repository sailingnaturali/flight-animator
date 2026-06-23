import type { LngLat } from './types';

const R = 6371; // km
const toRad = (d: number) => (d * Math.PI) / 180;
const toDeg = (r: number) => (r * 180) / Math.PI;

export function distanceKm(a: LngLat, b: LngLat): number {
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const la1 = toRad(a.lat);
  const la2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(la1) * Math.cos(la2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function interpolate(a: LngLat, b: LngLat, f: number): LngLat {
  const la1 = toRad(a.lat), lo1 = toRad(a.lon);
  const la2 = toRad(b.lat), lo2 = toRad(b.lon);
  const d = distanceKm(a, b) / R; // angular distance (radians)
  if (d === 0) return { lat: a.lat, lon: a.lon };
  const A = Math.sin((1 - f) * d) / Math.sin(d);
  const B = Math.sin(f * d) / Math.sin(d);
  const x = A * Math.cos(la1) * Math.cos(lo1) + B * Math.cos(la2) * Math.cos(lo2);
  const y = A * Math.cos(la1) * Math.sin(lo1) + B * Math.cos(la2) * Math.sin(lo2);
  const z = A * Math.sin(la1) + B * Math.sin(la2);
  return {
    lat: toDeg(Math.atan2(z, Math.sqrt(x * x + y * y))),
    lon: toDeg(Math.atan2(y, x)),
  };
}

/**
 * Shift `lon` by whole turns of 360° until it is within 180° of `refLon`. Keeps a polyline
 * (or a set of bounds) continuous across the ±180° antimeridian instead of jumping ~360°
 * between consecutive points. The result may fall outside [-180, 180]; MapLibre renders such
 * longitudes correctly across the seam, and fitBounds then centers on the shorter span.
 */
export function unwrapLongitude(lon: number, refLon: number): number {
  while (lon - refLon > 180) lon -= 360;
  while (lon - refLon < -180) lon += 360;
  return lon;
}

export function bearing(a: LngLat, b: LngLat, f: number): number {
  // bearing from the interpolated point toward a slightly-further point
  const p = interpolate(a, b, f);
  const q = interpolate(a, b, Math.min(1, f + 0.001));
  const la1 = toRad(p.lat), la2 = toRad(q.lat);
  const dLon = toRad(q.lon - p.lon);
  const y = Math.sin(dLon) * Math.cos(la2);
  const x = Math.cos(la1) * Math.sin(la2) - Math.sin(la1) * Math.cos(la2) * Math.cos(dLon);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}
