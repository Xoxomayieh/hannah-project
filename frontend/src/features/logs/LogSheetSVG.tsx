/**
 * LogSheetSVG — a faithful SVG replica of the FMCSA paper "Driver's Daily Log",
 * filled in from one DaySheet. Renders paper-white; used both on screen and,
 * via the same DOM node, for the PDF export.
 */

import { forwardRef } from "react";
import {
  GRID,
  ROWS,
  SHEET,
  formatSheetDate,
  xForMinute,
  type DaySheet,
} from "./logSheet";

const INK = "#1E3A5F"; // pen blue — the drawn duty line (print fidelity)
const GREEN = "#16A34A"; // active-day accent on screen
const LINE = "#94A3B8"; // major grid lines
const FAINT = "#DBE2EA"; // quarter-hour lines
const TEXT = "#0F172A"; // header text
const MUTED = "#64748B"; // labels

const SANS = "'Inter', system-ui, sans-serif";
const MONO = "'JetBrains Mono', ui-monospace, monospace";

function fmtHrs(n: number): string {
  const r = Math.round(n * 100) / 100;
  return Number.isInteger(r) ? String(r) : String(r).replace(/0+$/, "");
}

export type CycleContext = {
  priorCycle: number; // cycle hours already used at trip start
  cumulativeOnDutyThroughDay: number; // on-duty hours across days ≤ this day
};

type Props = {
  sheet: DaySheet;
  carrier?: string;
  mainOffice?: string;
  homeTerminal?: string;
  vehicle?: string;
  shipper?: string;
  cycle?: CycleContext;
  /** "green" = active day on screen; "ink" = print/inactive. */
  color?: "ink" | "green";
};

export const LogSheetSVG = forwardRef<SVGSVGElement, Props>(function LogSheetSVG(
  {
    sheet,
    carrier = "HAULR Logistics LLC",
    mainOffice = "1 Dispatch Way, Dallas, TX",
    homeTerminal = "1 Dispatch Way, Dallas, TX",
    vehicle = "Unit 407 / Trailer 512 — TX",
    shipper = "General freight",
    cycle,
    color = "ink",
  },
  ref,
) {
  const lineColor = color === "green" ? GREEN : INK;
  const { mm, dd, yyyy } = formatSheetDate(sheet.date);
  const bottom = GRID.y + ROWS.length * GRID.rowH;

  // Recap math (approximate but honest for trips shorter than the 8-day window).
  const onDutyToday = sheet.totals.driving + sheet.totals.onDuty;
  const last7 = (cycle?.priorCycle ?? 0) + (cycle?.cumulativeOnDutyThroughDay ?? onDutyToday);
  const availTomorrow = Math.max(0, 70 - last7);

  const hours = Array.from({ length: 25 }, (_, i) => i);

  return (
    <svg
      ref={ref}
      viewBox={`0 0 ${SHEET.w} ${SHEET.h}`}
      xmlns="http://www.w3.org/2000/svg"
      style={{ width: "100%", height: "auto", display: "block", background: "#fff" }}
      role="img"
      aria-label={`Driver's daily log for ${sheet.date}`}
    >
      <rect x={0} y={0} width={SHEET.w} height={SHEET.h} fill="#ffffff" />

      {/* ---------------- Header ---------------- */}
      <text x={40} y={44} fontFamily={SANS} fontSize={30} fontWeight={800} fill={TEXT}>
        Driver&#39;s Daily Log
      </text>
      <text x={40} y={64} fontFamily={SANS} fontSize={12} fill={MUTED}>
        (24 hours) · Original — file at home terminal
      </text>

      {/* Date */}
      <g fontFamily={MONO} fill={TEXT}>
        <text x={470} y={44} fontSize={22} fontWeight={700} textAnchor="middle">
          {mm} / {dd} / {yyyy}
        </text>
        <text x={470} y={62} fontFamily={SANS} fontSize={10} fill={MUTED} textAnchor="middle">
          (month / day / year)
        </text>
      </g>

      {/* Day badge */}
      <text x={SHEET.w - 40} y={44} fontFamily={SANS} fontSize={13} fontWeight={700} fill={MUTED} textAnchor="end">
        Day {sheet.dayIndex} of the trip
      </text>

      {/* From / To */}
      <g fontFamily={SANS} fontSize={13} fill={TEXT}>
        <text x={40} y={98} fill={MUTED}>From:</text>
        <text x={86} y={98} fontWeight={600}>{sheet.from || "—"}</text>
        <line x1={82} y1={102} x2={470} y2={102} stroke={LINE} strokeWidth={0.75} />
        <text x={500} y={98} fill={MUTED}>To:</text>
        <text x={532} y={98} fontWeight={600}>{sheet.to || "—"}</text>
        <line x1={528} y1={102} x2={900} y2={102} stroke={LINE} strokeWidth={0.75} />
      </g>

      {/* Info boxes */}
      <g fontFamily={SANS}>
        {/* Miles */}
        <rect x={40} y={120} width={190} height={54} fill="none" stroke={LINE} />
        <line x1={135} y1={120} x2={135} y2={174} stroke={LINE} />
        <text x={57} y={150} fontFamily={MONO} fontSize={22} fontWeight={700} fill={TEXT}>
          {Math.round(sheet.milesToday)}
        </text>
        <text x={48} y={168} fontSize={9} fill={MUTED}>Miles driving today</text>
        <text x={143} y={150} fontFamily={MONO} fontSize={22} fontWeight={700} fill={TEXT}>
          {Math.round(sheet.milesToday)}
        </text>
        <text x={143} y={168} fontSize={9} fill={MUTED}>Total mileage</text>

        {/* Carrier / addresses */}
        <rect x={250} y={120} width={650} height={54} fill="none" stroke={LINE} />
        <line x1={250} y1={138} x2={900} y2={138} stroke={LINE} strokeWidth={0.5} />
        <line x1={250} y1={156} x2={900} y2={156} stroke={LINE} strokeWidth={0.5} />
        <text x={258} y={133} fontSize={11} fontWeight={600} fill={TEXT}>{carrier}</text>
        <text x={863} y={133} fontSize={8} fill={MUTED} textAnchor="end">Carrier</text>
        <text x={258} y={151} fontSize={11} fill={TEXT}>{mainOffice}</text>
        <text x={863} y={151} fontSize={8} fill={MUTED} textAnchor="end">Main office</text>
        <text x={258} y={169} fontSize={11} fill={TEXT}>{homeTerminal}</text>
        <text x={863} y={169} fontSize={8} fill={MUTED} textAnchor="end">Home terminal</text>

        {/* Vehicle */}
        <rect x={920} y={120} width={SHEET.w - 920 - 40} height={54} fill="none" stroke={LINE} />
        <text x={932} y={140} fontSize={9} fill={MUTED}>Truck/Trailer no. · plate/state</text>
        <text x={932} y={162} fontSize={11} fontWeight={600} fill={TEXT}>{vehicle}</text>
      </g>

      {/* ---------------- Grid ---------------- */}
      {/* Quarter-hour faint lines */}
      {hours.slice(0, 24).map((h) =>
        [15, 30, 45].map((q) => {
          const x = xForMinute(h * 60 + q);
          return (
            <line
              key={`q-${h}-${q}`}
              x1={x}
              y1={GRID.y}
              x2={x}
              y2={bottom}
              stroke={FAINT}
              strokeWidth={q === 30 ? 0.9 : 0.5}
            />
          );
        }),
      )}

      {/* Hour vertical lines + top labels */}
      {hours.map((h) => {
        const x = GRID.x + h * GRID.hourW;
        const label =
          h === 0 || h === 24 ? "Midnight" : h === 12 ? "Noon" : String(h > 12 ? h - 12 : h);
        const big = h === 0 || h === 12 || h === 24;
        // Big labels (Midnight/Noon) sit on their own line above the hour
        // numerals so the corners never touch the "1"/"11" or the Total column.
        const anchor = h === 24 ? "end" : "middle";
        const lx = h === 24 ? x - 2 : x;
        const ly = big ? GRID.y - 15 : GRID.y - 6;
        return (
          <g key={`h-${h}`}>
            <line x1={x} y1={GRID.y} x2={x} y2={bottom} stroke={LINE} strokeWidth={big ? 1.4 : 0.9} />
            <text
              x={lx}
              y={ly}
              fontFamily={big ? SANS : MONO}
              fontSize={big ? 9 : 10}
              fontWeight={big ? 700 : 500}
              fill={big ? TEXT : MUTED}
              textAnchor={anchor}
            >
              {label}
            </text>
          </g>
        );
      })}

      {/* Row bands + labels + horizontal lines */}
      {ROWS.map((row, i) => {
        const yTop = GRID.y + i * GRID.rowH;
        return (
          <g key={row.status}>
            {i % 2 === 1 && (
              <rect x={GRID.x} y={yTop} width={GRID.width} height={GRID.rowH} fill="#F1F5F9" opacity={0.6} />
            )}
            <line x1={GRID.x} y1={yTop} x2={GRID.right + GRID.totalW} y2={yTop} stroke={LINE} strokeWidth={0.9} />
            <text x={GRID.x - 8} y={yTop + GRID.rowH / 2 - 3} fontFamily={SANS} fontSize={11} fontWeight={600} fill={TEXT} textAnchor="end">
              {row.label}
            </text>
            {row.sub && (
              <text x={GRID.x - 8} y={yTop + GRID.rowH / 2 + 9} fontFamily={SANS} fontSize={9} fill={MUTED} textAnchor="end">
                {row.sub}
              </text>
            )}
          </g>
        );
      })}
      {/* Grid outer & bottom border */}
      <line x1={GRID.x} y1={bottom} x2={GRID.right + GRID.totalW} y2={bottom} stroke={LINE} strokeWidth={1.4} />
      <line x1={GRID.x} y1={GRID.y} x2={GRID.x} y2={bottom} stroke={LINE} strokeWidth={1.4} />
      <line x1={GRID.right} y1={GRID.y} x2={GRID.right} y2={bottom} stroke={LINE} strokeWidth={1.4} />
      <line x1={GRID.right + GRID.totalW} y1={GRID.y} x2={GRID.right + GRID.totalW} y2={bottom} stroke={LINE} strokeWidth={1.4} />

      {/* Total Hours column header + values */}
      <text x={GRID.right + GRID.totalW / 2} y={GRID.y - 6} fontFamily={SANS} fontSize={9} fontWeight={700} fill={TEXT} textAnchor="middle">
        Total
      </text>
      {ROWS.map((row, i) => {
        const val =
          row.status === "Off Duty"
            ? sheet.totals.off
            : row.status === "Sleeper Berth"
              ? sheet.totals.sleeper
              : row.status === "Driving"
                ? sheet.totals.driving
                : sheet.totals.onDuty;
        return (
          <text
            key={`t-${row.status}`}
            x={GRID.right + GRID.totalW / 2}
            y={GRID.y + i * GRID.rowH + GRID.rowH / 2 + 4}
            fontFamily={MONO}
            fontSize={13}
            fontWeight={700}
            fill={TEXT}
            textAnchor="middle"
          >
            {fmtHrs(val)}
          </text>
        );
      })}
      {/* Grand total = 24 */}
      <text x={GRID.right + GRID.totalW / 2} y={bottom + 16} fontFamily={MONO} fontSize={12} fontWeight={700} fill={sheet.totals.total === 24 ? "#15803D" : "#B91C1C"} textAnchor="middle">
        {fmtHrs(sheet.totals.total)}
      </text>

      {/* ---------------- Duty line ---------------- */}
      <path
        d={sheet.dutyPath}
        fill="none"
        stroke={lineColor}
        strokeWidth={2.4}
        strokeLinejoin="round"
        strokeLinecap="round"
      />

      {/* ---------------- Remarks ---------------- */}
      <text x={40} y={bottom + 40} fontFamily={SANS} fontSize={13} fontWeight={700} fill={TEXT}>
        Remarks
      </text>
      <line x1={GRID.x} y1={bottom} x2={GRID.x} y2={bottom + 30} stroke={FAINT} strokeWidth={0.5} />
      {sheet.remarks.map((r, i) => {
        const x = xForMinute(r.min);
        const label = r.label.length > 30 ? r.label.slice(0, 29) + "…" : r.label;
        return (
          <g key={`r-${i}`}>
            <line x1={x} y1={bottom} x2={x} y2={bottom + 28} stroke={MUTED} strokeWidth={0.6} />
            <circle cx={x} cy={bottom} r={1.8} fill={lineColor} />
            <text
              x={x + 3}
              y={bottom + 34}
              fontFamily={MONO}
              fontSize={9}
              fill={MUTED}
              transform={`rotate(50 ${x + 3} ${bottom + 34})`}
            >
              {label}
            </text>
          </g>
        );
      })}

      {/* ---------------- Shipping documents ---------------- */}
      <g fontFamily={SANS}>
        <text x={40} y={bottom + 120} fontSize={12} fontWeight={700} fill={TEXT}>
          Shipping Documents
        </text>
        <text x={40} y={bottom + 140} fontSize={10} fill={MUTED}>DVL or Manifest No.:</text>
        <text x={180} y={bottom + 140} fontFamily={MONO} fontSize={10} fill={TEXT}>
          BOL-{sheet.date.replace(/-/g, "")}-{sheet.dayIndex}
        </text>
        <line x1={178} y1={bottom + 143} x2={470} y2={bottom + 143} stroke={FAINT} strokeWidth={0.75} />
        <text x={40} y={bottom + 158} fontSize={10} fill={MUTED}>Shipper &amp; Commodity:</text>
        <text x={180} y={bottom + 158} fontSize={10} fill={TEXT}>{shipper}</text>
        <line x1={178} y1={bottom + 161} x2={470} y2={bottom + 161} stroke={FAINT} strokeWidth={0.75} />
      </g>

      {/* ---------------- Recap box ---------------- */}
      <g fontFamily={SANS}>
        <rect x={40} y={SHEET.h - 96} width={SHEET.w - 80} height={72} fill="none" stroke={LINE} />
        <text x={52} y={SHEET.h - 76} fontSize={11} fontWeight={700} fill={TEXT}>
          Recap — 70 Hour / 8 Day
        </text>
        <text x={52} y={SHEET.h - 58} fontSize={10} fill={MUTED}>
          Complete at end of day (time standard of home terminal)
        </text>

        <RecapCell x={360} label="On-duty hours today (lines 3 & 4)" value={`${fmtHrs(onDutyToday)} h`} />
        <RecapCell x={620} label="A. On-duty last 7 days incl. today" value={`${fmtHrs(last7)} h`} />
        <RecapCell x={890} label="B. Available tomorrow (70 − A)" value={`${fmtHrs(availTomorrow)} h`} />
      </g>
    </svg>
  );
});

function RecapCell({ x, label, value }: { x: number; label: string; value: string }) {
  return (
    <g>
      <text x={x} y={SHEET.h - 72} fontFamily={MONO} fontSize={18} fontWeight={700} fill={TEXT}>
        {value}
      </text>
      <text x={x} y={SHEET.h - 54} fontSize={9} fill={MUTED}>
        {label}
      </text>
    </g>
  );
}
