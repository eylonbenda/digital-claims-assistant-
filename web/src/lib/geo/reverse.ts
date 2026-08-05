// Reverse geocoding for the "המיקום הנוכחי שלי" assist on the accident-location
// field. Uses Nominatim (OSM, no key, Hebrew labels); on any failure the caller
// falls back to raw coordinates — the field stays editable either way.

type NominatimAddress = {
  road?: string;
  house_number?: string;
  city?: string;
  town?: string;
  village?: string;
  suburb?: string;
};

export function formatCoords(lat: number, lon: number): string {
  return `נ"צ ${lat.toFixed(5)}, ${lon.toFixed(5)}`;
}

// Compose a short human label ("דרך העצמאות 12, חיפה") from a Nominatim
// reverse-geocode response. Returns null when there's nothing useful in it.
export function addressLabel(json: unknown): string | null {
  const address = (json as { address?: NominatimAddress } | null)?.address;
  if (!address) return null;
  const street = [address.road, address.house_number].filter(Boolean).join(" ");
  const locality = address.city ?? address.town ?? address.village ?? address.suburb;
  const parts = [street, locality].filter((p) => p && p.length > 0);
  return parts.length ? parts.join(", ") : null;
}

export async function reverseGeocode(lat: number, lon: number): Promise<string> {
  const fallback = formatCoords(lat, lon);
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=jsonv2&accept-language=he`,
      { headers: { accept: "application/json" } }
    );
    if (!res.ok) return fallback;
    return addressLabel(await res.json()) ?? fallback;
  } catch {
    return fallback;
  }
}
