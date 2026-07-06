import React from "react";
import { Check, X, MapPin, Play, Clock } from "lucide-react";
import type { PendingTripParams } from "@/lib/uiActionBus";

interface ConfirmTripCardProps {
  params: PendingTripParams;
  onConfirm: () => void;
  onCancel: () => void;
  disabled?: boolean;
}

export const ConfirmTripCard: React.FC<ConfirmTripCardProps> = ({
  params,
  onConfirm,
  onCancel,
  disabled = false
}) => {
  return (
    <div className="my-3 rounded-lg border border-hairline bg-panel p-4 shadow-glow">
      <div className="flex items-center gap-2 border-b border-hairline pb-2.5">
        <Play size={14} className="text-green animate-pulse" />
        <h4 className="font-mono text-xs font-bold uppercase tracking-wider text-white">
          Trip Confirmation Required
        </h4>
      </div>

      <div className="mt-3 space-y-2.5 text-sm">
        <div className="flex items-start gap-2.5">
          <MapPin size={14} className="mt-0.5 shrink-0 text-gray" />
          <div className="min-w-0">
            <div className="font-mono text-[0.65rem] uppercase tracking-wider text-gray-dim">Start Location</div>
            <div className="truncate font-semibold text-white">{params.current_location}</div>
          </div>
        </div>

        <div className="flex items-start gap-2.5">
          <MapPin size={14} className="mt-0.5 shrink-0 text-green" />
          <div className="min-w-0">
            <div className="font-mono text-[0.65rem] uppercase tracking-wider text-gray-dim">Pickup Location</div>
            <div className="truncate font-semibold text-white">{params.pickup_location}</div>
          </div>
        </div>

        <div className="flex items-start gap-2.5">
          <MapPin size={14} className="mt-0.5 shrink-0 text-danger" />
          <div className="min-w-0">
            <div className="font-mono text-[0.65rem] uppercase tracking-wider text-gray-dim">Dropoff Location</div>
            <div className="truncate font-semibold text-white">{params.dropoff_location}</div>
          </div>
        </div>

        <div className="flex items-start gap-2.5">
          <Clock size={14} className="mt-0.5 shrink-0 text-warn" />
          <div className="min-w-0">
            <div className="font-mono text-[0.65rem] uppercase tracking-wider text-gray-dim">70h Cycle Hours Used</div>
            <div className="font-mono font-semibold text-white">{params.cycle_used_hrs} hrs</div>
          </div>
        </div>
      </div>

      <div className="mt-4 flex items-center gap-2 border-t border-hairline pt-3">
        <button
          onClick={onConfirm}
          disabled={disabled}
          className="flex flex-1 items-center justify-center gap-1.5 rounded bg-green px-3 py-1.5 font-mono text-xs font-bold text-black transition-transform active:scale-[0.98] hover:bg-green-bright disabled:opacity-50 disabled:pointer-events-none"
        >
          <Check size={12} />
          Confirm Plan
        </button>
        <button
          onClick={onCancel}
          disabled={disabled}
          className="flex items-center justify-center gap-1.5 rounded border border-hairline bg-void px-3 py-1.5 font-mono text-xs font-semibold text-gray hover:text-white transition-colors disabled:opacity-50 disabled:pointer-events-none"
        >
          <X size={12} />
          Cancel
        </button>
      </div>
    </div>
  );
};
