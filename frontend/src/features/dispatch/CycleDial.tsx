// Dashboard-dial input for "current cycle used" (0–70 hrs, 0.25 steps).
// Green telemetry gauge with a live "hours remaining" readout. The big
// number at the dial's center doubles as a real input — precise entry
// beats fighting a 0.25hr-step slider on a touchscreen.
import { useEffect, useId, useState } from "react";

type Props = {
  value: number;
  onChange: (v: number) => void;
  max?: number;
};

const formatHrs = (n: number) => n.toFixed(2).replace(/\.00$/, "");

export function CycleDial({ value, onChange, max = 70 }: Props) {
  const pct = Math.max(0, Math.min(1, value / max));
  const remaining = Math.max(0, max - value);
  const sliderId = useId();
  const exactId = useId();

  const [draft, setDraft] = useState(() => value.toFixed(2).replace(/\.00$/, ""));

  // Keep the editable number in sync when the slider (or an external
  // reset) changes the value; don't clobber it mid-keystroke.
  useEffect(() => {
    setDraft(value.toFixed(2).replace(/\.00$/, ""));
  }, [value]);

  const commitDraft = (raw: string) => {
    const n = parseFloat(raw);
    if (Number.isNaN(n)) {
      setDraft(value.toFixed(2).replace(/\.00$/, ""));
      return;
    }
    const clamped = Math.min(max, Math.max(0, n));
    onChange(clamped);
    setDraft(clamped.toFixed(2).replace(/\.00$/, ""));
  };

  // 270° arc gauge geometry
  const R = 52;
  const CX = 60;
  const CY = 60;
  const START = 135; // deg
  const SWEEP = 270; // deg
  const circ = (SWEEP / 360) * (2 * Math.PI * R);

  const near = remaining <= 10;
  const stroke = near ? "#F59E0B" : "#22C55E";

  return (
    <div className="flex items-center gap-5">
      <div className="relative h-[120px] w-[120px] shrink-0">
        <svg viewBox="0 0 120 120" className="h-full w-full -rotate-0" aria-hidden="true">
          <circle
            cx={CX}
            cy={CY}
            r={R}
            fill="none"
            stroke="#1F2430"
            strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray={`${circ} ${2 * Math.PI * R}`}
            transform={`rotate(${START} ${CX} ${CY})`}
          />
          <circle
            cx={CX}
            cy={CY}
            r={R}
            fill="none"
            stroke={stroke}
            strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray={`${circ * pct} ${2 * Math.PI * R}`}
            transform={`rotate(${START} ${CX} ${CY})`}
            style={{
              transition: "stroke-dasharray 0.4s cubic-bezier(0.22,1,0.36,1), stroke 0.3s",
              filter: `drop-shadow(0 0 6px ${stroke}88)`,
            }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <label htmlFor={exactId} className="sr-only">
            Cycle hours used — type an exact value
          </label>
          <input
            id={exactId}
            type="text"
            inputMode="decimal"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={(e) => commitDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") e.currentTarget.blur();
            }}
            className="w-16 rounded bg-transparent text-center font-mono text-2xl font-bold tabular-nums text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-green"
          />
          <span className="font-mono text-[0.6rem] uppercase tracking-[0.2em] text-gray-dim">
            hrs used
          </span>
        </div>
      </div>

      <div className="flex-1">
        <label htmlFor={sliderId} className="mb-2 block text-sm font-medium text-gray">
          Current cycle used
        </label>
        <input
          id={sliderId}
          type="range"
          min={0}
          max={max}
          step={0.25}
          value={value}
          onChange={(e) => onChange(parseFloat(e.target.value))}
          className="haulr-range w-full"
          aria-valuetext={`${formatHrs(value)} of ${max} hours used`}
        />
        <p className="mt-2 font-mono text-xs" style={{ color: near ? "#F59E0B" : "#9CA3AF" }}>
          <span className="font-semibold" style={{ color: near ? "#F59E0B" : "#22C55E" }}>
            {formatHrs(remaining)} hrs
          </span>{" "}
          remaining on your 70-hour cycle
        </p>
      </div>
    </div>
  );
}
