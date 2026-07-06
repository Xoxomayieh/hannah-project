import type { ComponentType } from "react";
import {
  Fuel,
  Coffee,
  BedDouble,
  RotateCcw,
  Package,
  Warehouse,
  Flag,
  Truck,
  Navigation,
} from "lucide-react";
import type { DutyStatus } from "./api";

/**
 * Single source of truth for duty-status color and per-event icon, shared by
 * the timeline (ResultsStage) and the map (RouteMap) so the same event always
 * looks the same everywhere.
 */
export const STATUS_COLOR: Record<DutyStatus, string> = {
  "Off Duty": "#6B7280",
  "Sleeper Berth": "#3B82F6",
  Driving: "#22C55E",
  "On Duty": "#F59E0B",
};

export type EventKind =
  | "current"
  | "pickup"
  | "dropoff"
  | "fuel"
  | "break"
  | "restart"
  | "rest"
  | "pretrip"
  | "driving";

export const EVENT_KIND_LABEL: Record<EventKind, string> = {
  current: "Trip start",
  pickup: "Pickup",
  dropoff: "Dropoff",
  fuel: "Fuel stop",
  break: "30-min break",
  restart: "34-hr restart",
  rest: "10-hr rest",
  pretrip: "Pre-trip inspection",
  driving: "Driving",
};

const EVENT_ICON_CMP: Record<EventKind, ComponentType<{ size?: number }>> = {
  current: Navigation,
  fuel: Fuel,
  break: Coffee,
  restart: RotateCcw,
  rest: BedDouble,
  pickup: Package,
  dropoff: Warehouse,
  pretrip: Flag,
  driving: Truck,
};

export function getEventKind(note: string): EventKind {
  const n = note.toLowerCase();
  if (n.includes("fuel")) return "fuel";
  if (n.includes("break")) return "break";
  if (n.includes("restart")) return "restart";
  if (n.includes("rest")) return "rest";
  if (n.includes("pickup")) return "pickup";
  if (n.includes("dropoff")) return "dropoff";
  if (n.includes("pre-trip")) return "pretrip";
  return "driving";
}

export function EventIconCmp({ kind }: { kind: EventKind }) {
  const Icon = EVENT_ICON_CMP[kind];
  return <Icon size={15} />;
}

/** Kept for existing call sites that pass a raw note string. */
export function eventIcon(note: string, size = 15) {
  const Icon = EVENT_ICON_CMP[getEventKind(note)];
  return <Icon size={size} />;
}

/**
 * Map pins only show "real" stops — never one-per-driving-segment noise and
 * never the (mostly co-located) pre-trip inspection bookkeeping event.
 */
export function isMapPinKind(kind: EventKind): boolean {
  return kind !== "driving" && kind !== "pretrip";
}

export function formatDuration(hours: number): string {
  const totalMin = Math.round(hours * 60);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h <= 0) return `${m} min`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

export function formatClock(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}
