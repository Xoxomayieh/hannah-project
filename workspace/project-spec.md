# Project Specification: HAULR

HAULR is an AI-powered HOS Trip Planner & ELD Log Generator.

**Objective:**
Build an app that takes trip details as inputs and outputs route instructions and draws ELD logs as outputs.

**Inputs:**
- Current location
- Pickup location
- Dropoff location
- Current Cycle Used (Hrs)

**Outputs:**
- Map showing route and information regarding stops and rests (using a free map API, CARTO Dark Matter suggested).
- Daily Log Sheets filled out (drawn on the log and filled out, multiple sheets for longer trips).

**Assumptions:**
- Property-carrying driver, 70hrs/8days, no adverse driving conditions.
- Fueling at least once every 1,000 miles.
- 1 hour for pickup and drop-off.
- 10-hour reset required after 11 hours of driving or 14 hours on duty.
- 30-minute break after 8 cumulative hours of driving.
- 34-hour restart when 70-hour cycle exhausted.

**Stack:**
- Django 5 + DRF (Backend, Vercel)
- React 18 + Vite + TS (Frontend, Vercel)
- Supabase (Postgres, pgvector, Storage)
- Gemini 2.5 Flash + LangChain/LangGraph

See HAULR-PRD-v3.md for full details.
