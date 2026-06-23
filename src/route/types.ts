export interface RawStop {
  code?: string;
  lat?: number;
  lon?: number;
  label?: string;
  arrive?: string; // ISO 8601
  depart?: string; // ISO 8601
}

export interface Waypoint {
  lat: number;
  lon: number;
  label: string;
  code?: string;
  country?: string;
  arrive?: string;
  depart?: string;
}

export type AirportTable = Record<string, { city: string; country: string; lat: number; lon: number }>;
