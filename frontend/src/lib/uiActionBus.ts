import { create } from "zustand";
import type { TripPlan } from "./api";

export interface PendingTripParams {
  current_location: string;
  pickup_location: string;
  dropoff_location: string;
  cycle_used_hrs: number;
}

interface UIActionBusState {
  currentPlan: TripPlan | null;
  setCurrentPlan: (plan: TripPlan | null) => void;
  
  activeLogDay: number | null;
  setActiveLogDay: (day: number | null) => void;
  
  pendingTrip: PendingTripParams | null;
  setPendingTrip: (trip: PendingTripParams | null) => void;
  
  pdfDownloadUrl: string | null;
  setPdfDownloadUrl: (url: string | null) => void;
}

export const useUIActionBus = create<UIActionBusState>((set) => ({
  currentPlan: null,
  setCurrentPlan: (plan) => set({ currentPlan: plan }),
  
  activeLogDay: null,
  setActiveLogDay: (day) => set({ activeLogDay: day }),
  
  pendingTrip: null,
  setPendingTrip: (trip) => set({ pendingTrip: trip }),
  
  pdfDownloadUrl: null,
  setPdfDownloadUrl: (url) => set({ pdfDownloadUrl: url }),
}));
