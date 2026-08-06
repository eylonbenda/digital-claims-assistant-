import { isLookupablePlate, lookupVehicle, normalizePlate, type VehicleInfo } from "@/lib/vehicles/registry";

// Proxied server-side rather than called from the browser: keeps the claimant's
// IP and the gov endpoint out of the client, gives us one egress point to swap
// or cache, and sidesteps CORS. The plate carries no owner identity.

// Per-instance memo — the registry is effectively static, and claimants often
// re-trigger the same lookup while editing the field.
const cache = new Map<string, VehicleInfo | null>();
const CACHE_MAX = 500;

export async function GET(_request: Request, { params }: { params: Promise<{ plate: string }> }) {
  const { plate } = await params;
  if (!isLookupablePlate(plate)) {
    return Response.json({ error: "invalid plate" }, { status: 400 });
  }

  const key = normalizePlate(plate);
  if (cache.has(key)) {
    return Response.json({ vehicle: cache.get(key) });
  }

  const vehicle = await lookupVehicle(key);
  if (cache.size >= CACHE_MAX) cache.clear();
  cache.set(key, vehicle);

  // 200 with vehicle:null for "not found" — the wizard treats a miss as a
  // non-event and lets the claimant type the details.
  return Response.json({ vehicle });
}
