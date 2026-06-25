// Trade the long ?d= URL for a short /t/<code> link via /api/shorten. Only rich (?d=) routes are
// shortened — ?r= links are already short. Any failure falls back to the long URL so sharing never
// breaks when the shortener is down or offline.
export async function shortenShareUrl(
  longUrl: string,
  sharePath: string,
  fetchImpl: typeof fetch = fetch,
): Promise<string> {
  const d = new URLSearchParams(sharePath.replace(/^\?/, '')).get('d');
  if (!d) return longUrl;
  try {
    const res = await fetchImpl('/api/shorten', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ d }),
    });
    if (!res.ok) return longUrl;
    const body = (await res.json()) as { url?: string };
    return body.url ?? longUrl;
  } catch {
    return longUrl;
  }
}
