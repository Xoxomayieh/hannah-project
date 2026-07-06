import type { TripInput } from "@/features/dispatch/TripForm";

const API_URL = import.meta.env.VITE_API_URL || (import.meta.env.PROD ? "" : "http://127.0.0.1:8000");

export type DutyStatus = "Off Duty" | "Sleeper Berth" | "Driving" | "On Duty";

export type DutyEvent = {
  status: DutyStatus;
  start: string;
  end: string;
  location: string;
  note: string;
  lat: number;
  lng: number;
  duration_hours?: number;
  miles_start?: number;
  miles_end?: number;
};

export type GeoJsonLine = { type: "LineString"; coordinates: [number, number][] };

export type PerDay = {
  date: string;
  off_duty_hours: number;
  sleeper_berth_hours: number;
  driving_hours: number;
  on_duty_hours: number;
  total_hours: number;
  total_miles: number;
};

export type ComplianceCheck = {
  rule: string;
  cfr_section: string;
  limit_hours: number;
  used_hours: number;
  remaining_hours: number;
  passed: boolean;
  note: string;
};

export type Compliance = {
  all_passed: boolean;
  has_34hr_restart: boolean;
  checks: ComplianceCheck[];
};

export type Totals = {
  driving_hours: number;
  on_duty_hours: number;
  distance_miles: number;
  days: number;
};

export type TripPlan = {
  trip_id?: number | null;
  route_geometry: GeoJsonLine[];
  events: DutyEvent[];
  per_day?: PerDay[];
  compliance?: Compliance | null;
  totals?: Totals;
  /** Echoed trip inputs (added client-side for log-sheet header). */
  meta?: {
    current?: string;
    pickup?: string;
    dropoff?: string;
    cycle_used_hrs?: number;
  };
};

export type LocationSuggestion = {
  label: string;
  lat: number;
  lng: number;
};

// US state name -> USPS abbreviation, for building "City, ST" labels.
const US_STATES: Record<string, string> = {
  Alabama: "AL", Alaska: "AK", Arizona: "AZ", Arkansas: "AR", California: "CA",
  Colorado: "CO", Connecticut: "CT", Delaware: "DE", Florida: "FL", Georgia: "GA",
  Hawaii: "HI", Idaho: "ID", Illinois: "IL", Indiana: "IN", Iowa: "IA",
  Kansas: "KS", Kentucky: "KY", Louisiana: "LA", Maine: "ME", Maryland: "MD",
  Massachusetts: "MA", Michigan: "MI", Minnesota: "MN", Mississippi: "MS",
  Missouri: "MO", Montana: "MT", Nebraska: "NE", Nevada: "NV",
  "New Hampshire": "NH", "New Jersey": "NJ", "New Mexico": "NM", "New York": "NY",
  "North Carolina": "NC", "North Dakota": "ND", Ohio: "OH", Oklahoma: "OK",
  Oregon: "OR", Pennsylvania: "PA", "Rhode Island": "RI", "South Carolina": "SC",
  "South Dakota": "SD", Tennessee: "TN", Texas: "TX", Utah: "UT", Vermont: "VT",
  Virginia: "VA", Washington: "WA", "West Virginia": "WV", Wisconsin: "WI",
  Wyoming: "WY", "District of Columbia": "DC",
};

type PhotonProps = {
  name?: string;
  housenumber?: string;
  street?: string;
  city?: string;
  town?: string;
  village?: string;
  county?: string;
  state?: string;
  country?: string;
  countrycode?: string;
};

// Build a human-readable "Street, City, ST" label from a Photon feature.
// Mirrors backend core/services.py `_photon_label` so both paths match.
function photonLabel(props: PhotonProps): string {
  const { housenumber, street, name, state, country } = props;
  // Enclosing city/town for an address. County is only a last resort and is
  // NOT used for place features (a city result shouldn't read "Chicago, Cook County").
  const city = props.city || props.town || props.village;
  const stateAbbr = state ? US_STATES[state] ?? state : undefined;

  let primary: string | undefined;
  let locality: string | undefined;
  if (housenumber && street) {
    primary = `${housenumber} ${street}`;
    locality = city || props.county;
  } else if (street) {
    primary = street;
    locality = city || props.county;
  } else {
    // The feature IS a place (city/town/village/POI): its name stands alone.
    primary = name;
    locality = city && city !== name ? city : undefined;
  }

  const tail = stateAbbr || (country && country !== "United States" ? country : undefined);
  let parts = [primary, locality, tail].filter(Boolean) as string[];
  if (parts.length === 0) parts = [name, country].filter(Boolean) as string[];

  const seen = new Set<string>();
  return parts.filter((p) => (seen.has(p) ? false : (seen.add(p), true))).join(", ");
}

async function suggestFromPhoton(
  query: string,
  signal?: AbortSignal
): Promise<LocationSuggestion[]> {
  // No lat/lon bias: Photon's default importance ranking surfaces prominent
  // cities (Chicago, Dallas) far better than a coordinate bias, which drags in
  // tiny nearby streets/streams. We instead keep US results ahead of foreign
  // ones with a stable re-rank below.
  const url =
    `https://photon.komoot.io/api/?q=${encodeURIComponent(query)}&limit=8&lang=en`;
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`photon ${res.status}`);
  const data = await res.json();

  // Stable-partition US results first, preserving Photon's order within each
  // group, so e.g. "Springs, ZA" can't outrank "Spring, TX".
  const feats = [...(data.features ?? [])].sort((a, b) => {
    const aus = a.properties?.countrycode === "US" ? 0 : 1;
    const bus = b.properties?.countrycode === "US" ? 0 : 1;
    return aus - bus;
  });

  const out: LocationSuggestion[] = [];
  const seen = new Set<string>();
  for (const f of feats) {
    const label = photonLabel(f.properties ?? {});
    const [lng, lat] = f.geometry?.coordinates ?? [];
    if (label && !seen.has(label) && typeof lat === "number") {
      seen.add(label);
      out.push({ label, lat, lng });
      if (out.length >= 6) break;
    }
  }
  return out;
}

async function suggestFromBackend(
  query: string,
  signal?: AbortSignal
): Promise<LocationSuggestion[]> {
  const res = await fetch(
    `${API_URL}/api/trips/suggest/?q=${encodeURIComponent(query)}`,
    { signal }
  );
  if (!res.ok) return [];
  const data = await res.json();
  return data.results ?? [];
}

/**
 * Location autocomplete. Queries the Photon geocoder directly from the browser
 * (no backend cold-start hop, US-biased ranking). Falls back to our own Django
 * endpoint if the direct call fails for any reason other than an abort.
 */
export async function suggestLocations(
  query: string,
  signal?: AbortSignal
): Promise<LocationSuggestion[]> {
  if (query.trim().length < 2) return [];
  try {
    return await suggestFromPhoton(query, signal);
  } catch (err) {
    if (signal?.aborted || (err instanceof DOMException && err.name === "AbortError")) {
      throw err; // superseded by a newer keystroke — let the caller ignore it
    }
    return suggestFromBackend(query, signal);
  }
}

export async function planTrip(input: TripInput): Promise<TripPlan> {
  const res = await fetch(`${API_URL}/api/trips/plan/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    let msg = `Request failed (${res.status})`;
    try {
      const j = await res.json();
      if (j?.error) msg = j.error;
    } catch {
      /* keep default */
    }
    throw new Error(msg);
  }
  const plan: TripPlan = await res.json();
  plan.meta = {
    current: input.current_location,
    pickup: input.pickup_location,
    dropoff: input.dropoff_location,
    cycle_used_hrs: input.cycle_used_hrs,
  };
  return plan;
}

const HOURS = (a: string, b: string) =>
  (new Date(b).getTime() - new Date(a).getTime()) / 3_600_000;

export type TripSummary = {
  drivingHrs: number;
  onDutyHrs: number;
  offHrs: number;
  days: number;
  fuelStops: number;
  breaks: number;
  rests: number;
  restarts: number;
};

export function summarize(events: DutyEvent[]): TripSummary {
  let drivingHrs = 0;
  let onDutyHrs = 0;
  let offHrs = 0;
  const days = new Set<string>();
  let fuelStops = 0,
    breaks = 0,
    rests = 0,
    restarts = 0;

  for (const e of events) {
    const dur = HOURS(e.start, e.end);
    days.add(e.start.slice(0, 10));
    if (e.status === "Driving") drivingHrs += dur;
    else if (e.status === "On Duty") onDutyHrs += dur;
    else offHrs += dur;

    const n = e.note.toLowerCase();
    if (n.includes("fuel")) fuelStops++;
    else if (n.includes("30-minute") || n.includes("break")) breaks++;
    else if (n.includes("34-hour") || n.includes("restart")) restarts++;
    else if (n.includes("rest")) rests++;
  }

  return {
    drivingHrs,
    onDutyHrs: onDutyHrs + drivingHrs,
    offHrs,
    days: days.size,
    fuelStops,
    breaks,
    rests,
    restarts,
  };
}
