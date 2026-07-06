/**
 * LogSheets — the ELD daily-log panel for the results view.
 * Day tabs → one filled paper log per calendar day, plus a one-click PDF
 * export of the whole trip (all days, print-ink rendering).
 */

import { useMemo, useRef, useState } from "react";
import { Download, FileText, Loader2 } from "lucide-react";
import type { TripPlan } from "@/lib/api";
import { buildDaySheets, SHEET, type DaySheet } from "./logSheet";
import { LogSheetSVG, type CycleContext } from "./LogSheetSVG";

function useCycleContexts(sheets: DaySheet[], priorCycle: number): CycleContext[] {
  return useMemo(() => {
    let running = 0;
    return sheets.map((s) => {
      running += s.totals.driving + s.totals.onDuty;
      return { priorCycle, cumulativeOnDutyThroughDay: running };
    });
  }, [sheets, priorCycle]);
}

export function LogSheets({ plan }: { plan: TripPlan }) {
  const sheets = useMemo(() => buildDaySheets(plan), [plan]);
  const priorCycle = plan.meta?.cycle_used_hrs ?? 0;
  const cycles = useCycleContexts(sheets, priorCycle);

  const [active, setActive] = useState(0);
  const [exporting, setExporting] = useState(false);
  const exportRefs = useRef<(SVGSVGElement | null)[]>([]);

  const carrier = "HAULR Logistics LLC";
  const home = plan.meta?.current ? `Home terminal — ${plan.meta.current}` : undefined;
  const shipper =
    plan.meta?.pickup && plan.meta?.dropoff
      ? `General freight · ${plan.meta.pickup} → ${plan.meta.dropoff}`
      : undefined;

  if (sheets.length === 0) return null;

  async function exportPdf() {
    setExporting(true);
    try {
      const [{ jsPDF }, svg2pdfMod] = await Promise.all([
        import("jspdf"),
        import("svg2pdf.js"),
      ]);
      const svg2pdf = (svg2pdfMod as any).svg2pdf ?? (svg2pdfMod as any).default;

      const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
      const pageW = doc.internal.pageSize.getWidth();
      const margin = 22;
      const w = pageW - margin * 2;
      const h = (SHEET.h / SHEET.w) * w;

      for (let i = 0; i < exportRefs.current.length; i++) {
        const svg = exportRefs.current[i];
        if (!svg) continue;
        if (i > 0) doc.addPage();
        await svg2pdf(svg, doc, { x: margin, y: margin, width: w, height: h });
      }
      doc.save(`haulr-eld-logs-${plan.trip_id ?? "trip"}.pdf`);
    } catch (err) {
      console.error("PDF export failed", err);
      alert("Could not generate the PDF. Please try again.");
    } finally {
      setExporting(false);
    }
  }

  return (
    <section className="mx-auto w-full max-w-6xl px-5 pb-16 pt-6 sm:px-6">
      {/* Header */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <span className="eyebrow">Records of duty status</span>
          <h2 className="mt-1.5 flex items-center gap-2 text-2xl font-extrabold tracking-tightest text-white sm:text-3xl">
            <FileText size={22} className="text-green" />
            Daily log sheets
          </h2>
        </div>
        <button
          type="button"
          onClick={exportPdf}
          disabled={exporting}
          className="group flex items-center gap-2 rounded-lg bg-green px-4 py-2.5 text-sm font-bold text-black transition-all duration-300 ease-haul hover:shadow-glow-lg disabled:cursor-not-allowed disabled:opacity-70"
        >
          {exporting ? (
            <>
              <Loader2 size={16} className="animate-spin" /> Building PDF…
            </>
          ) : (
            <>
              <Download size={16} /> Download logs (PDF)
            </>
          )}
        </button>
      </div>

      {/* Day tabs */}
      <div className="mb-4 flex flex-wrap gap-2">
        {sheets.map((s, i) => (
          <button
            key={s.date}
            type="button"
            onClick={() => setActive(i)}
            className={
              "rounded-lg border px-3.5 py-2 text-left transition-colors duration-200 " +
              (i === active
                ? "border-green/60 bg-green/10 text-white"
                : "border-hairline bg-panel text-gray hover:border-green/40 hover:text-white")
            }
          >
            <div className="font-mono text-[0.65rem] uppercase tracking-[0.15em] text-gray-dim">
              Day {s.dayIndex}
            </div>
            <div className="font-mono text-sm font-semibold tabular-nums">{s.date}</div>
            <div className="font-mono text-[0.65rem] text-gray-dim">
              {Math.round(s.milesToday)} mi
            </div>
          </button>
        ))}
      </div>

      {/* Active sheet (paper-white inside the dark card) */}
      <div className="panel overflow-hidden p-2 sm:p-3">
        <div className="overflow-x-auto rounded-md bg-white">
          <div className="min-w-[720px]">
            <LogSheetSVG
              sheet={sheets[active]}
              color="green"
              carrier={carrier}
              homeTerminal={home}
              shipper={shipper}
              cycle={cycles[active]}
            />
          </div>
        </div>
      </div>
      <p className="mt-2 text-center font-mono text-[0.7rem] text-gray-dim">
        Each sheet totals 24 h · duty line drawn per 49 CFR §395.8 · remarks at every duty change
      </p>

      {/* Offscreen ink render of every day — the source for the PDF export. */}
      <div aria-hidden className="pointer-events-none fixed left-[-99999px] top-0 w-[1200px]">
        {sheets.map((s, i) => (
          <LogSheetSVG
            key={s.date}
            ref={(el) => {
              exportRefs.current[i] = el;
            }}
            sheet={s}
            color="ink"
            carrier={carrier}
            homeTerminal={home}
            shipper={shipper}
            cycle={cycles[i]}
          />
        ))}
      </div>
    </section>
  );
}
