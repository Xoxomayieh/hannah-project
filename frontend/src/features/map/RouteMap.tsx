import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MapContainer, TileLayer, Polyline, Marker, Popup, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { Maximize2, ListFilter } from "lucide-react";
import type { DutyEvent, GeoJsonLine } from "@/lib/api";
import {
  EventIconCmp,
  EVENT_KIND_LABEL,
  STATUS_COLOR,
  formatClock,
  formatDuration,
  getEventKind,
  isMapPinKind,
  type EventKind,
} from "@/lib/eventVisuals";

type Pin = {
  key: string;
  kind: EventKind;
  lat: number;
  lng: number;
  location: string;
  note: string;
  start: string;
  end: string;
  color: string;
  seq: number | null;
};

const CURRENT_COLOR = "#22C55E";

function buildPins(events: DutyEvent[], routeGeometry: GeoJsonLine[], currentLabel?: string): Pin[] {
  const pins: Pin[] = [];

  const origin = routeGeometry.find((l) => l.coordinates.length > 0)?.coordinates[0];
  if (origin) {
    pins.push({
      key: "trip-start",
      kind: "current",
      lat: origin[1],
      lng: origin[0],
      location: currentLabel || events[0]?.location || "Trip start",
      note: "Trip start",
      start: events[0]?.start ?? "",
      end: events[0]?.start ?? "",
      color: CURRENT_COLOR,
      seq: null,
    });
  }

  let seq = 0;
  events.forEach((e, i) => {
    if (!e.lat || !e.lng) return;
    const kind = getEventKind(e.note);
    if (!isMapPinKind(kind)) return;
    seq += 1;
    pins.push({
      key: `${i}-${kind}`,
      kind,
      lat: e.lat,
      lng: e.lng,
      location: e.location,
      note: e.note,
      start: e.start,
      end: e.end,
      color: STATUS_COLOR[e.status],
      seq,
    });
  });

  return pins;
}

/** Builds a themed Leaflet divIcon once per (kind, color, seq) combo. */
function useMarkerIcons(pins: Pin[]) {
  const cache = useRef(new Map<string, L.DivIcon>());

  return useMemo(() => {
    const icons = new Map<string, L.DivIcon>();
    for (const pin of pins) {
      const cacheKey = `${pin.kind}-${pin.color}-${pin.seq ?? "x"}`;
      let icon = cache.current.get(cacheKey);
      if (!icon) {
        const svg = renderToStaticMarkup(<EventIconCmp kind={pin.kind} />);
        const seqBadge =
          pin.seq != null ? `<span class="haulr-pin__seq">${pin.seq}</span>` : "";
        const ring = pin.kind === "current" ? `<span class="haulr-pin__ring"></span>` : "";
        icon = L.divIcon({
          html: `<div class="haulr-pin">${ring}<span class="haulr-pin__badge" style="--pin-color:${pin.color}">${svg}</span>${seqBadge}</div>`,
          className: "haulr-pin-wrapper",
          iconSize: [30, 30],
          iconAnchor: [15, 15],
          popupAnchor: [0, -16],
        });
        cache.current.set(cacheKey, icon);
      }
      icons.set(pin.key, icon);
    }
    return icons;
  }, [pins]);
}

function MapBounds({ routeGeometry, pins }: { routeGeometry: GeoJsonLine[]; pins: Pin[] }) {
  const map = useMap();

  useEffect(() => {
    const bounds = computeBounds(routeGeometry, pins);
    if (bounds) map.fitBounds(bounds, { padding: [44, 44] });
  }, [map, routeGeometry, pins]);

  return null;
}

function computeBounds(routeGeometry: GeoJsonLine[], pins: Pin[]): L.LatLngBounds | null {
  const bounds = L.latLngBounds([]);
  routeGeometry.forEach((line) =>
    line.coordinates.forEach((c) => bounds.extend([c[1], c[0]]))
  );
  pins.forEach((p) => bounds.extend([p.lat, p.lng]));
  return bounds.isValid() ? bounds : null;
}

function FitRouteControl({ routeGeometry, pins }: { routeGeometry: GeoJsonLine[]; pins: Pin[] }) {
  const map = useMap();
  const onClick = useCallback(() => {
    const bounds = computeBounds(routeGeometry, pins);
    if (bounds) map.fitBounds(bounds, { padding: [44, 44] });
  }, [map, routeGeometry, pins]);

  useEffect(() => {
    const ctrl = new L.Control({ position: "topright" });
    ctrl.onAdd = () => {
      const btn = L.DomUtil.create("button", "haulr-map-btn");
      btn.type = "button";
      btn.title = "Fit route to view";
      btn.setAttribute("aria-label", "Fit route to view");
      btn.innerHTML = renderToStaticMarkup(<Maximize2 size={15} />);
      L.DomEvent.disableClickPropagation(btn);
      L.DomEvent.on(btn, "click", onClick);
      return btn;
    };
    ctrl.addTo(map);
    return () => {
      ctrl.remove();
    };
  }, [map, onClick]);

  return null;
}

function ScaleControl() {
  const map = useMap();
  useEffect(() => {
    const ctrl = L.control.scale({ position: "bottomright", imperial: true, metric: false });
    ctrl.addTo(map);
    return () => {
      ctrl.remove();
    };
  }, [map]);
  return null;
}

const LEGEND_ORDER: EventKind[] = [
  "current",
  "pickup",
  "dropoff",
  "fuel",
  "break",
  "rest",
  "restart",
];

function MapLegend({ kinds }: { kinds: Set<EventKind> }) {
  const [open, setOpen] = useState(false);
  const present = LEGEND_ORDER.filter((k) => kinds.has(k));
  if (present.length === 0) return null;

  return (
    <div className="pointer-events-auto absolute bottom-3 left-3 z-[1000]">
      {open && (
        <div className="mb-2 min-w-[168px] rounded-lg border border-hairline bg-panel/95 p-2.5 shadow-panel backdrop-blur">
          <div className="mb-1.5 font-mono text-[0.6rem] uppercase tracking-[0.2em] text-gray-dim">
            Legend
          </div>
          <ul className="space-y-1.5">
            {present.map((kind) => (
              <li key={kind} className="flex items-center gap-2 text-[0.7rem] text-gray">
                <span
                  className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border"
                  style={{
                    borderColor: kind === "current" ? CURRENT_COLOR : STATUS_COLOR[statusForKind(kind)],
                    color: kind === "current" ? CURRENT_COLOR : STATUS_COLOR[statusForKind(kind)],
                  }}
                >
                  <EventIconCmp kind={kind} />
                </span>
                {EVENT_KIND_LABEL[kind]}
              </li>
            ))}
          </ul>
        </div>
      )}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex h-9 items-center gap-1.5 rounded-full border border-hairline bg-panel/95 px-3 font-mono text-[0.65rem] uppercase tracking-[0.15em] text-gray shadow-panel backdrop-blur transition-colors duration-300 ease-haul hover:border-green/50 hover:text-white"
      >
        <ListFilter size={13} />
        Legend
      </button>
    </div>
  );
}

// On-duty (pickup/dropoff/fuel) share amber; off-duty (break/restart) share
// gray; rest is sleeper-berth blue — mirrors the timeline's status coloring.
function statusForKind(kind: EventKind): DutyEvent["status"] {
  if (kind === "rest") return "Sleeper Berth";
  if (kind === "break" || kind === "restart") return "Off Duty";
  return "On Duty";
}

export function RouteMap({
  events,
  routeGeometry,
  currentLocation,
}: {
  events: DutyEvent[];
  routeGeometry: GeoJsonLine[];
  currentLocation?: string;
}) {
  const polylines = routeGeometry.map((line) =>
    line.coordinates.map((c) => [c[1], c[0]] as [number, number])
  );

  const pins = useMemo(
    () => buildPins(events, routeGeometry, currentLocation),
    [events, routeGeometry, currentLocation]
  );
  const icons = useMarkerIcons(pins);
  const kinds = useMemo(() => new Set(pins.map((p) => p.kind)), [pins]);
  const stopCount = pins.filter((p) => p.seq != null).length;

  return (
    <div className="relative h-full w-full overflow-hidden rounded-md">
      <MapContainer
        center={[39.8283, -98.5795]}
        zoom={4}
        style={{ height: "100%", width: "100%" }}
        className="haulr-map"
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'
          url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
        />

        {polylines.map((positions, i) => (
          <Polyline
            key={`glow-${i}`}
            positions={positions}
            pathOptions={{ color: "#22C55E", weight: 5, opacity: 0.85, className: "route-glow-path" }}
          />
        ))}
        {polylines.map((positions, i) => (
          <Polyline
            key={`flow-${i}`}
            positions={positions}
            pathOptions={{
              color: "#EAFFF0",
              weight: 2,
              opacity: 0.9,
              dashArray: "1 14",
              lineCap: "round",
              className: "route-flow-path",
            }}
          />
        ))}

        {pins.map((pin) => (
          <Marker key={pin.key} position={[pin.lat, pin.lng]} icon={icons.get(pin.key)}>
            <Popup className="haulr-popup">
              <div className="min-w-[180px]">
                <div className="mb-1 flex items-center gap-2">
                  <span style={{ color: pin.color }}>
                    <EventIconCmp kind={pin.kind} />
                  </span>
                  <span className="text-sm font-semibold text-white">
                    {EVENT_KIND_LABEL[pin.kind]}
                  </span>
                </div>
                <div className="text-xs leading-snug text-gray-300">{pin.location}</div>
                <div className="mt-2 flex items-center justify-between gap-3 font-mono text-[0.68rem] text-gray-dim">
                  <span>{pin.start ? formatClock(pin.start) : "—"}</span>
                  {pin.kind !== "current" && (
                    <span>{formatDuration((new Date(pin.end).getTime() - new Date(pin.start).getTime()) / 3_600_000)}</span>
                  )}
                </div>
                {pin.seq != null && (
                  <div className="mt-2 border-t border-white/10 pt-1.5 font-mono text-[0.6rem] uppercase tracking-[0.15em] text-gray-dim">
                    Stop {pin.seq} of {stopCount}
                  </div>
                )}
              </div>
            </Popup>
          </Marker>
        ))}

        <MapBounds routeGeometry={routeGeometry} pins={pins} />
        <FitRouteControl routeGeometry={routeGeometry} pins={pins} />
        <ScaleControl />
      </MapContainer>

      <MapLegend kinds={kinds} />
    </div>
  );
}
