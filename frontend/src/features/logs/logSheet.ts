/**
 * ELD Daily Log — geometry + data module (pure, framework-free).
 *
 * Turns a TripPlan into one "day sheet" per calendar day, faithful to the
 * FMCSA paper "Driver's Daily Log" grid (blank-paper-log.png). The grid
 * coordinates live here so the on-screen SVG and the PDF export stay identical.
 *
 * Timezone note: the backend already midnight-splits events and pads each day
 * so it tiles 00:00→24:00 *in the home-terminal clock encoded in the ISO
 * string*. We therefore read the wall-clock time straight from the string and
 * NEVER convert through `new Date()` (which would shift to the viewer's tz and
 * break the "day starts at 00:00" invariant).
 */

import type { DutyEvent, DutyStatus, PerDay, TripPlan } from "@/lib/api";

// ---------------------------------------------------------------------------
// Grid geometry (SVG user units). One coordinate system, shared everywhere.
// ---------------------------------------------------------------------------

export const SHEET = { w: 1200, h: 780 } as const;

export const GRID = {
  x: 96, // left edge of the 24-hour grid
  y: 300, // top edge of row 1 (Off Duty)
  hourW: 44, // width of one hour column
  rowH: 32, // height of one status row
  get width() {
    return this.hourW * 24;
  },
  get right() {
    return this.x + this.width;
  },
  totalW: 48, // "Total Hours" column on the right
} as const;

/** Row order top→bottom, exactly as on the paper log. */
export const ROWS: { status: DutyStatus; label: string; sub?: string }[] = [
  { status: "Off Duty", label: "1. Off Duty" },
  { status: "Sleeper Berth", label: "2. Sleeper", sub: "Berth" },
  { status: "Driving", label: "3. Driving" },
  { status: "On Duty", label: "4. On Duty", sub: "(not driving)" },
];

const ROW_INDEX: Record<DutyStatus, number> = {
  "Off Duty": 0,
  "Sleeper Berth": 1,
  Driving: 2,
  "On Duty": 3,
};

/** X pixel for a given minute-of-day [0..1440]. */
export function xForMinute(min: number): number {
  return GRID.x + (Math.max(0, Math.min(1440, min)) / 1440) * GRID.width;
}

/** Y pixel of a status row's center line. */
export function yForStatus(status: DutyStatus): number {
  return GRID.y + ROW_INDEX[status] * GRID.rowH + GRID.rowH / 2;
}

// ---------------------------------------------------------------------------
// Wall-clock parsing (tz-safe)
// ---------------------------------------------------------------------------

/** Date portion "YYYY-MM-DD" straight from the ISO string. */
function isoDate(iso: string): string {
  return iso.slice(0, 10);
}

/** Minutes-since-local-midnight read literally from the ISO string. */
function isoMinutes(iso: string): number {
  const m = iso.match(/T(\d{2}):(\d{2})(?::(\d{2}))?/);
  if (!m) return 0;
  const h = Number(m[1]);
  const mm = Number(m[2]);
  const ss = m[3] ? Number(m[3]) : 0;
  return h * 60 + mm + ss / 60;
}

// ---------------------------------------------------------------------------
// Day-sheet model
// ---------------------------------------------------------------------------

export type GridEvent = {
  status: DutyStatus;
  startMin: number; // 0..1440
  endMin: number; // 0..1440 (1440 = midnight end-of-day)
  note: string;
  location: string;
  milesStart: number;
  milesEnd: number;
};

export type Remark = {
  min: number; // minute-of-day of the duty change
  label: string; // "Fuel — Barstow, CA"
};

export type DaySheet = {
  date: string; // "YYYY-MM-DD"
  dayIndex: number; // 1-based day number of the trip
  events: GridEvent[];
  /** Duty-line SVG path (the stair-step trace). */
  dutyPath: string;
  remarks: Remark[];
  totals: {
    off: number;
    sleeper: number;
    driving: number;
    onDuty: number;
    total: number; // == 24
  };
  milesToday: number;
  from: string;
  to: string;
};

const STATUS_TOTAL_KEY: Record<DutyStatus, keyof DaySheet["totals"]> = {
  "Off Duty": "off",
  "Sleeper Berth": "sleeper",
  Driving: "driving",
  "On Duty": "onDuty",
};

/** Short human label for a remark from an event's note/location. */
function remarkLabel(ev: GridEvent): string {
  const loc = ev.location && !/^-?\d/.test(ev.location) ? ev.location : "";
  const note = ev.note.replace(/\s*\(.*?\)\s*/g, "").trim();
  if (loc && note) return `${note} — ${loc}`;
  return note || loc || ev.status;
}

/** Build the stair-step duty line for a day. */
function buildDutyPath(events: GridEvent[]): string {
  if (events.length === 0) return "";
  const segs: string[] = [];
  events.forEach((ev, i) => {
    const y = yForStatus(ev.status);
    const x0 = xForMinute(ev.startMin);
    const x1 = xForMinute(ev.endMin);
    if (i === 0) segs.push(`M ${x0.toFixed(1)} ${y.toFixed(1)}`);
    else segs.push(`L ${x0.toFixed(1)} ${y.toFixed(1)}`); // vertical connector
    segs.push(`L ${x1.toFixed(1)} ${y.toFixed(1)}`); // horizontal run
  });
  return segs.join(" ");
}

/** Group a plan's events into one DaySheet per calendar day. */
export function buildDaySheets(plan: TripPlan): DaySheet[] {
  const perDayByDate = new Map<string, PerDay>();
  (plan.per_day ?? []).forEach((d) => perDayByDate.set(d.date, d));

  // Group raw events by their start date (already midnight-split by the server).
  const byDate = new Map<string, DutyEvent[]>();
  for (const ev of plan.events) {
    const d = isoDate(ev.start);
    if (!byDate.has(d)) byDate.set(d, []);
    byDate.get(d)!.push(ev);
  }

  const dates = [...byDate.keys()].sort();

  return dates.map((date, idx) => {
    const raw = byDate.get(date)!;
    const gridEvents: GridEvent[] = raw.map((ev) => {
      const startMin = isoMinutes(ev.start);
      const endIso = ev.end;
      // An event ending at 00:00 of the *next* day fills to 24:00 of this day.
      const endMin = isoDate(endIso) > date ? 1440 : isoMinutes(endIso);
      return {
        status: ev.status,
        startMin,
        endMin: endMin <= startMin ? 1440 : endMin,
        note: ev.note,
        location: ev.location,
        milesStart: ev.miles_start ?? 0,
        milesEnd: ev.miles_end ?? 0,
      };
    });

    // Totals — prefer the server's authoritative per-day rollup, else derive.
    const pd = perDayByDate.get(date);
    const totals = { off: 0, sleeper: 0, driving: 0, onDuty: 0, total: 0 };
    if (pd) {
      totals.off = pd.off_duty_hours;
      totals.sleeper = pd.sleeper_berth_hours;
      totals.driving = pd.driving_hours;
      totals.onDuty = pd.on_duty_hours;
      totals.total = pd.total_hours;
    } else {
      for (const ev of gridEvents) {
        totals[STATUS_TOTAL_KEY[ev.status]] += (ev.endMin - ev.startMin) / 60;
      }
      totals.total = totals.off + totals.sleeper + totals.driving + totals.onDuty;
    }

    // Remarks: one per duty-status change (skip padding events).
    const remarks: Remark[] = [];
    let prev: DutyStatus | null = null;
    for (const ev of gridEvents) {
      const isPad = /prior to trip start|remainder of day/i.test(ev.note);
      if (ev.status !== prev && !isPad) {
        remarks.push({ min: ev.startMin, label: remarkLabel(ev) });
      }
      prev = ev.status;
    }

    const milesToday =
      pd?.total_miles ??
      gridEvents.reduce(
        (s, e) => s + (e.status === "Driving" ? e.milesEnd - e.milesStart : 0),
        0,
      );

    // From / To — first & last real (geocoded) locations of the day.
    const realLocs = gridEvents
      .map((e) => e.location)
      .filter((l) => l && !/^-?\d/.test(l));
    const from = realLocs[0] ?? gridEvents[0]?.location ?? "";
    const to = realLocs[realLocs.length - 1] ?? from;

    return {
      date,
      dayIndex: idx + 1,
      events: gridEvents,
      dutyPath: buildDutyPath(gridEvents),
      remarks,
      totals,
      milesToday,
      from,
      to,
    };
  });
}

/** Pretty date for the sheet header, tz-safe (from the "YYYY-MM-DD" string). */
export function formatSheetDate(date: string): { mm: string; dd: string; yyyy: string } {
  const [y, m, d] = date.split("-");
  return { mm: m, dd: d, yyyy: y };
}
