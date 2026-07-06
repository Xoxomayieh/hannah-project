import { useRef, useState } from "react";
import { MapPin, Package, Warehouse, Loader2, X } from "lucide-react";
import { CycleDial } from "./CycleDial";
import { suggestLocations, type LocationSuggestion } from "@/lib/api";

export type TripInput = {
  current_location: string;
  pickup_location: string;
  dropoff_location: string;
  cycle_used_hrs: number;
};

type FieldKey = "current" | "pickup" | "dropoff";

type FieldProps = {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  onBlur: () => void;
  placeholder: string;
  icon: React.ReactNode;
  error?: string;
  inputRef: React.RefObject<HTMLInputElement | null>;
};

function LocationField({
  id,
  label,
  value,
  onChange,
  onBlur,
  placeholder,
  icon,
  error,
  inputRef,
}: FieldProps) {
  const [suggestions, setSuggestions] = useState<LocationSuggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [highlighted, setHighlighted] = useState(-1);
  const [fetching, setFetching] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const skipNextFetch = useRef(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Debounced suggestion fetch as the user types. Skipped right after a
  // suggestion is picked, so selecting doesn't immediately reopen the list.
  const fetchSuggestions = (query: string) => {
    if (skipNextFetch.current) {
      skipNextFetch.current = false;
      return;
    }
    clearTimeout(debounceRef.current);
    if (query.length < 2) {
      setSuggestions([]);
      setOpen(false);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      setFetching(true);
      try {
        const results = await suggestLocations(query, controller.signal);
        setSuggestions(results);
        setOpen(results.length > 0);
        setHighlighted(-1);
      } catch {
        // aborted (superseded by a newer keystroke) or network error — ignore
      } finally {
        setFetching(false);
      }
    }, 250);
  };

  const selectSuggestion = (s: LocationSuggestion) => {
    skipNextFetch.current = true;
    onChange(s.label);
    setOpen(false);
    setSuggestions([]);
    setHighlighted(-1);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!open || suggestions.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlighted((i) => (i + 1) % suggestions.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlighted((i) => (i <= 0 ? suggestions.length - 1 : i - 1));
    } else if (e.key === "Enter") {
      if (highlighted >= 0) {
        e.preventDefault();
        selectSuggestion(suggestions[highlighted]);
      } else {
        setOpen(false);
      }
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  const errorId = `${id}-error`;
  const listboxId = `${id}-listbox`;
  const activeOptionId = highlighted >= 0 ? `${id}-option-${highlighted}` : undefined;

  return (
    <div className="relative">
      <label htmlFor={id} className="mb-2 block text-sm font-medium text-gray">
        {label}
      </label>
      <div className="relative">
        <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-dim">
          {icon}
        </span>
        <input
          ref={inputRef}
          id={id}
          value={value}
          onChange={(e) => {
            onChange(e.target.value);
            fetchSuggestions(e.target.value.trim());
          }}
          onFocus={() => suggestions.length > 0 && setOpen(true)}
          onBlur={() => {
            setTimeout(() => setOpen(false), 120);
            onBlur();
          }}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          autoComplete="off"
          role="combobox"
          aria-expanded={open}
          aria-autocomplete="list"
          aria-controls={listboxId}
          aria-activedescendant={activeOptionId}
          aria-invalid={!!error}
          aria-describedby={error ? errorId : undefined}
          className={`w-full rounded-lg border bg-black/40 py-3.5 pl-11 pr-9 text-base text-white placeholder:text-gray-dim transition-colors focus:outline-none ${
            error ? "border-danger" : "border-hairline focus:border-green"
          }`}
        />
        {fetching ? (
          <Loader2
            size={14}
            aria-hidden="true"
            className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 animate-spin text-gray-dim"
          />
        ) : (
          value && (
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                onChange("");
                setSuggestions([]);
                setOpen(false);
                inputRef.current?.focus();
              }}
              aria-label={`Clear ${label.toLowerCase()}`}
              className="absolute right-1 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-md text-gray-dim transition-colors hover:bg-white/5 hover:text-white"
            >
              <X size={14} />
            </button>
          )
        )}
      </div>
      {open && suggestions.length > 0 && (
        <ul
          id={listboxId}
          role="listbox"
          className="absolute z-20 mt-1.5 max-h-56 w-full overflow-y-auto rounded-lg border border-hairline bg-[#0a0a0a] shadow-xl"
        >
          {suggestions.map((s, i) => (
            <li
              key={`${s.label}-${s.lat}-${s.lng}`}
              id={`${id}-option-${i}`}
              role="option"
              aria-selected={i === highlighted}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => selectSuggestion(s)}
              onMouseEnter={() => setHighlighted(i)}
              className={`flex cursor-pointer items-center gap-2.5 px-3.5 py-2.5 text-sm transition-colors ${
                i === highlighted ? "bg-green/10 text-white" : "text-gray hover:bg-white/5"
              }`}
            >
              <MapPin size={14} className="shrink-0 text-gray-dim" />
              <span className="truncate">{s.label}</span>
            </li>
          ))}
        </ul>
      )}
      {error && (
        <p id={errorId} role="alert" className="mt-1.5 text-xs text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

export function TripForm({
  onSubmit,
  loading,
}: {
  onSubmit: (data: TripInput) => void | Promise<void>;
  loading?: boolean;
}) {
  const [current, setCurrent] = useState("Dallas, TX");
  const [pickup, setPickup] = useState("Tulsa, OK");
  const [dropoff, setDropoff] = useState("Chicago, IL");
  const [cycle, setCycle] = useState(22);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const refs: Record<FieldKey, React.RefObject<HTMLInputElement | null>> = {
    current: useRef<HTMLInputElement>(null),
    pickup: useRef<HTMLInputElement>(null),
    dropoff: useRef<HTMLInputElement>(null),
  };

  const fieldError = (key: FieldKey, values = { current, pickup, dropoff }) => {
    const { current: c, pickup: p, dropoff: d } = values;
    if (key === "current" && !c.trim()) return "Where are you starting?";
    if (key === "pickup" && !p.trim()) return "Add a pickup location.";
    if (key === "dropoff") {
      if (!d.trim()) return "Add a dropoff location.";
      if (p.trim() && p.trim().toLowerCase() === d.trim().toLowerCase())
        return "Pickup and dropoff can't be the same.";
    }
    return undefined;
  };

  const validateOnBlur = (key: FieldKey) => {
    const err = fieldError(key);
    setErrors((prev) => {
      const next = { ...prev };
      if (err) next[key] = err;
      else delete next[key];
      return next;
    });
  };

  const validateAll = () => {
    const e: Record<string, string> = {};
    (["current", "pickup", "dropoff"] as FieldKey[]).forEach((key) => {
      const err = fieldError(key);
      if (err) e[key] = err;
    });
    if (cycle < 0 || cycle > 70) e.cycle = "Cycle must be between 0 and 70 hours.";
    setErrors(e);
    return e;
  };

  const handleSubmit = (ev: React.FormEvent) => {
    ev.preventDefault();
    if (loading) return;
    const e = validateAll();
    const firstInvalid = (["current", "pickup", "dropoff"] as FieldKey[]).find((key) => e[key]);
    if (firstInvalid) {
      refs[firstInvalid].current?.focus();
      return;
    }
    if (Object.keys(e).length > 0) return;
    onSubmit({
      current_location: current.trim(),
      pickup_location: pickup.trim(),
      dropoff_location: dropoff.trim(),
      cycle_used_hrs: cycle,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="panel panel-glow p-6 sm:p-7" aria-busy={loading}>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <span className="eyebrow">Dispatch Panel</span>
          <h3 className="mt-1.5 text-xl font-bold tracking-tight text-white">Plan a haul</h3>
        </div>
        <span className="font-mono text-[0.65rem] uppercase tracking-[0.2em] text-gray-dim">
          70 hr / 8 day
        </span>
      </div>

      <fieldset disabled={loading} className="m-0 min-w-0 border-0 p-0 disabled:opacity-60">
        <legend className="sr-only">Trip details — all fields required</legend>
        <div className="space-y-4">
          <LocationField
            id="current"
            label="Current location"
            value={current}
            onChange={setCurrent}
            onBlur={() => validateOnBlur("current")}
            placeholder="City, ST"
            icon={<MapPin size={16} />}
            error={errors.current}
            inputRef={refs.current}
          />
          <LocationField
            id="pickup"
            label="Pickup"
            value={pickup}
            onChange={setPickup}
            onBlur={() => validateOnBlur("pickup")}
            placeholder="City, ST"
            icon={<Package size={16} />}
            error={errors.pickup}
            inputRef={refs.pickup}
          />
          <LocationField
            id="dropoff"
            label="Dropoff"
            value={dropoff}
            onChange={setDropoff}
            onBlur={() => validateOnBlur("dropoff")}
            placeholder="City, ST"
            icon={<Warehouse size={16} />}
            error={errors.dropoff}
            inputRef={refs.dropoff}
          />

          <div className="rounded-lg border border-hairline bg-black/30 p-4">
            <CycleDial value={cycle} onChange={setCycle} />
          </div>
        </div>

        <button
          type="submit"
          className="group mt-6 flex w-full items-center justify-center gap-2 rounded-lg bg-green py-3.5 font-bold text-black transition-all duration-300 ease-haul hover:shadow-glow-lg disabled:cursor-not-allowed disabled:opacity-70"
        >
          {loading ? (
            <>
              <Loader2 size={18} className="animate-spin" aria-hidden="true" />
              Plotting your route…
            </>
          ) : (
            <>
              Plan My Haul
              <span className="transition-transform duration-300 ease-haul group-hover:translate-x-1">
                →
              </span>
            </>
          )}
        </button>
      </fieldset>

      <div role="status" aria-live="polite" className="sr-only">
        {loading ? "Plotting your route, please wait." : ""}
      </div>
    </form>
  );
}
