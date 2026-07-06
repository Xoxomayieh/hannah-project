import type { TripInput } from "@/features/dispatch/TripForm";

const API_URL = import.meta.env.VITE_API_URL || "http://127.0.0.1:8000";

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

export async function suggestLocations(
  query: string,
  signal?: AbortSignal
): Promise<LocationSuggestion[]> {
  if (query.trim().length < 2) return [];
  const res = await fetch(
    `${API_URL}/api/trips/suggest/?q=${encodeURIComponent(query)}`,
    { signal }
  );
  if (!res.ok) return [];
  const data = await res.json();
  return data.results ?? [];
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
