import { forwardRef } from "react";
import { ArrowUp, FileText } from "lucide-react";
import { RouteMap } from "@/features/map/RouteMap";
import { STATUS_COLOR, eventIcon } from "@/lib/eventVisuals";
import type { DutyStatus, TripSummary, TripPlan } from "@/lib/api";
import { AiChatbotAvatar } from "./AiChatbotAvatar";

const hrs = (a: string, b: string) =>
  (new Date(b).getTime() - new Date(a).getTime()) / 3_600_000;

function Stat({ label, value, unit }: { label: string; value: string; unit?: string }) {
  return (
    <div className="panel px-4 py-3">
      <div className="font-mono text-2xl font-bold tabular-nums leading-none text-white">
        {value}
        {unit && <span className="ml-1 text-sm font-medium text-gray-dim">{unit}</span>}
      </div>
      <div className="mt-1.5 font-mono text-[0.6rem] uppercase tracking-[0.2em] text-gray-dim">
        {label}
      </div>
    </div>
  );
}

function fmtTime(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

type Props = {
  plan: TripPlan;
  summary: TripSummary;
  onEdit?: () => void;
  onViewLogSheets?: () => void;
  /** Fill and fit the parent's height (locked overlay); only the timeline scrolls. */
  fit?: boolean;
};

export const ResultsStage = forwardRef<HTMLElement, Props>(function ResultsStage(
  { plan, summary, onEdit, onViewLogSheets, fit },
  ref
) {
  const events = plan.events;
  const total = events.reduce((s, e) => s + hrs(e.start, e.end), 0) || 1;

  return (
    <section
      ref={ref}
      id="results"
      className={
        fit
          ? "mx-auto flex w-full max-w-6xl flex-col gap-4 px-5 pb-6 pt-20 sm:px-6 lg:h-full"
          : "mx-auto w-full max-w-6xl scroll-mt-24 px-6 py-16"
      }
    >
      {/* Header */}
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-3">
        <div>
          <span className="eyebrow">Route plotted</span>
          <h2 className="mt-1.5 text-2xl font-extrabold tracking-tightest text-white sm:text-3xl">
            Your compliant haul
          </h2>
        </div>
        <div className="flex items-center gap-3">
          {summary.restarts > 0 && (
            <span className="rounded-full border border-warn/40 bg-warn/10 px-3 py-1.5 font-mono text-xs text-warn">
              {summary.restarts} × 34-hr restart
            </span>
          )}
          {onViewLogSheets && (
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={onViewLogSheets}
                className="group flex items-center gap-2 rounded-lg border border-hairline bg-panel px-4 py-2 text-sm font-medium text-gray transition-colors duration-300 ease-haul hover:border-green/50 hover:text-white"
              >
                <FileText size={15} />
                View daily log sheet
              </button>
              <AiChatbotAvatar summary={summary} />
            </div>
          )}
          {onEdit && (
            <button
              type="button"
              onClick={onEdit}
              className="group flex items-center gap-2 rounded-lg border border-hairline bg-panel px-4 py-2 text-sm font-medium text-gray transition-colors duration-300 ease-haul hover:border-green/50 hover:text-white"
            >
              <ArrowUp size={15} className="transition-transform duration-300 ease-haul group-hover:-translate-y-0.5" />
              Edit plan
            </button>
          )}
        </div>
      </div>

      {/* Summary strip */}
      <div className="grid shrink-0 grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Driving" value={summary.drivingHrs.toFixed(1)} unit="hrs" />
        <Stat label="On duty" value={summary.onDutyHrs.toFixed(1)} unit="hrs" />
        <Stat label="Calendar days" value={String(summary.days)} />
        <Stat
          label="Stops"
          value={String(summary.fuelStops + summary.breaks + summary.rests)}
        />
      </div>

      {/* Duty ribbon */}
      <div className="panel shrink-0 p-4">
        <div className="mb-2.5 flex flex-wrap items-center justify-between gap-3">
          <span className="font-mono text-[0.65rem] uppercase tracking-[0.2em] text-gray-dim">
            Duty-status timeline
          </span>
          <div className="flex flex-wrap gap-3">
            {(Object.keys(STATUS_COLOR) as DutyStatus[]).map((s) => (
              <span key={s} className="flex items-center gap-1.5 text-[0.7rem] text-gray">
                <span
                  className="inline-block h-2.5 w-2.5 rounded-sm"
                  style={{ background: STATUS_COLOR[s] }}
                />
                {s}
              </span>
            ))}
          </div>
        </div>
        <div className="flex h-7 overflow-hidden rounded-md border border-hairline">
          {events.map((e, i) => {
            const w = (hrs(e.start, e.end) / total) * 100;
            return (
              <div
                key={i}
                className="h-full transition-opacity hover:opacity-80"
                style={{ width: `${w}%`, background: STATUS_COLOR[e.status] }}
                title={`${e.status} · ${e.note} · ${hrs(e.start, e.end).toFixed(2)}h`}
              />
            );
          })}
        </div>
      </div>

      {/* Map + event timeline — fill remaining height; timeline scrolls internally */}
      <div
        className={
          "grid gap-4 lg:grid-cols-[1fr_1.1fr]" +
          (fit ? " lg:min-h-0 lg:flex-1" : "")
        }
      >
        {/* Timeline */}
        <div className="panel flex min-h-0 flex-col p-4">
          <span className="mb-3 block shrink-0 font-mono text-[0.65rem] uppercase tracking-[0.2em] text-gray-dim">
            Timeline · {events.length} events
          </span>
          <ol
            data-lenis-prevent
            className={
              "min-h-0 space-y-1 overflow-y-auto pr-1.5" +
              (fit ? " max-h-[300px] lg:max-h-none lg:flex-1" : " max-h-[420px]")
            }
          >
            {events.map((e, i) => (
              <li
                key={i}
                className="flex items-center gap-3 rounded-lg border border-transparent px-2 py-1.5 transition-colors hover:border-hairline hover:bg-white/[0.02]"
              >
                <span
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md"
                  style={{ background: `${STATUS_COLOR[e.status]}22`, color: STATUS_COLOR[e.status] }}
                >
                  {eventIcon(e.note)}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-white">{e.note}</div>
                  <div className="font-mono text-[0.7rem] text-gray-dim">
                    {e.status} · {hrs(e.start, e.end).toFixed(2)}h
                  </div>
                </div>
                <div className="shrink-0 text-right font-mono text-[0.7rem] text-gray">
                  {fmtTime(e.start)}
                </div>
              </li>
            ))}
          </ol>
        </div>

        {/* Map */}
        <div
          className={
            "panel relative z-0 flex min-h-0 flex-col items-center justify-center overflow-hidden p-0" +
            (fit ? " h-[280px] lg:h-auto" : " h-[400px]")
          }
        >
          <RouteMap
            events={events}
            routeGeometry={plan.route_geometry}
            currentLocation={plan.meta?.current}
          />
        </div>
      </div>
    </section>
  );
});
