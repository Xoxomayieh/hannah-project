# Product

## Register

product

## Users

Two overlapping audiences: (1) the assessment grader, who loads the live URL and judges output accuracy plus UI/UX polish within minutes; (2) the simulated end user, a property-carrying truck driver/dispatcher entering a trip (current/pickup/dropoff/cycle hours) who needs a trustworthy route + legally correct ELD log sheets, glanceable at a glance during a break.

## Product Purpose

HAULR is an AI-powered HOS (Hours of Service) Trip Planner & ELD Log Generator. It takes 4 trip inputs and outputs (a) a route map with stops/rests annotated and (b) filled-in FMCSA daily log sheets (multi-day, drawn not just tabulated). Success = the compliance math is exactly right AND the interface reads as a premium, purpose-built tool rather than a generic CRUD dashboard.

## Brand Personality

"Spotter Night Haul": cinematic night-driving energy, radar/telemetry precision, quiet confidence. Black canvas, crisp white type, one green accent (`#22C55E`) used deliberately, not decoratively. Feels like a professional fleet-ops instrument (GPS fixes, scanlines, odometer counters) — not a consumer travel app, not a playful startup dashboard.

## Anti-references

- Default Leaflet map: default blue teardrop pins, white popups, no legend — reads as an unstyled demo, breaks the dark theme.
- Generic light SaaS dashboard (cream backgrounds, gradient-text stat cards, icon-in-a-circle feature grids).
- Gimmicky map effects (bouncing markers, unnecessary confetti/parallax) that don't serve wayfinding.
- Cluttered maps with a pin for every data point regardless of meaning (e.g. one marker per driving segment).

## Design Principles

- **Accuracy first, aesthetics amplify it.** Per the assessment brief, good UI/UX can compensate for minor inaccuracies, but never replaces correctness — every visual must represent real HOS data, nothing decorative pretending to be data.
- **One motif, reused consistently.** GPS-pulse / radar-sweep / scanline motifs already established in the design system should recur (map pins, loaders) rather than inventing new decorative languages per component.
- **Hierarchy over density.** Show what matters (pickup, dropoff, fuel, rest, restart, current position) prominently; don't render every internal bookkeeping event as an equally-weighted pin.
- **Calm technical confidence.** Motion and glow are restrained and purposeful (state changes, live position), never bouncy or playful.
- **Consistency across surfaces.** The same status colors/icons used in the duty-status ribbon and timeline (features/results/ResultsStage.tsx) must match the map pins exactly — one visual vocabulary for duty status everywhere.

## Accessibility & Inclusion

WCAG AA minimum (green accent already measured at 9:1 on black, passes AA+AAA). Respect `prefers-reduced-motion` with static/instant fallbacks for all pulse/glow animations. Don't convey duty-status meaning by color alone — pair with distinct icons (already the pattern in the timeline).
