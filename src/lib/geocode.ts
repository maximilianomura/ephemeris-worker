export interface GeoResult {
  lat: number
  lng: number
  displayName: string
  utcOffset?: number // not from Nominatim — must be provided by caller
}

export async function geocodeCity(city: string, country: string): Promise<GeoResult> {
  const q = encodeURIComponent(`${city}, ${country}`)
  const url = `https://nominatim.openstreetmap.org/search?q=${q}&format=json&limit=1&addressdetails=1`

  const res = await fetch(url, {
    headers: {
      // Nominatim requires a descriptive User-Agent with contact info
      'User-Agent': 'ephemeris-worker/1.0 (ephemeris.myastralshop.com; contact@myastralshop.com)'
    }
  })

  if (!res.ok) throw new Error(`Geocoding failed: ${res.status}`)

  const data = await res.json() as Array<{ lat: string; lon: string; display_name: string }>
  if (!data.length) throw new Error(`City not found: ${city}, ${country}`)

  return {
    lat: parseFloat(data[0].lat),
    lng: parseFloat(data[0].lon),
    displayName: data[0].display_name
  }
}
