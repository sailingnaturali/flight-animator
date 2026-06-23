// Usage: node scripts/build-airports.mjs
// Produces public/airports.json from OurAirports (public domain).
// Dev/CI data-refresh script — run manually to regenerate the committed public/airports.json.
// NOT part of the Vercel build; the committed file is used directly.
import { writeFileSync } from 'node:fs';

const URL = 'https://davidmegginson.github.io/ourairports-data/airports.csv';

function parseCsv(text) {
  const rows = [];
  let row = [], field = '', inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') inQ = false;
      else field += c;
    } else if (c === '"') inQ = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (c !== '\r') field += c;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows;
}

const res = await fetch(URL);
if (!res.ok) throw new Error(`Download failed: ${res.status}`);
const rows = parseCsv(await res.text());
const header = rows[0];
const idx = (name) => header.indexOf(name);
const iIata = idx('iata_code'), iLat = idx('latitude_deg'), iLon = idx('longitude_deg');
const iCity = idx('municipality'), iCountry = idx('iso_country'), iSched = idx('scheduled_service');

const table = {};
for (const r of rows.slice(1)) {
  const iata = r[iIata]?.trim();
  if (!iata || iata.length !== 3) continue;
  if (r[iSched]?.trim() !== 'yes') continue;
  const lat = Number(r[iLat]), lon = Number(r[iLon]);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
  table[iata.toUpperCase()] = {
    city: r[iCity]?.trim() || iata.toUpperCase(),
    country: r[iCountry]?.trim() || '',
    lat: Number(lat.toFixed(4)),
    lon: Number(lon.toFixed(4)),
  };
}

writeFileSync('public/airports.json', JSON.stringify(table));
console.log(`Wrote ${Object.keys(table).length} airports to public/airports.json`);
