# HAULR Progress Tracking

> Full detail + step-by-step remaining work: **`workspace/HANDOFF.md`**.
> How to run everything: **`workspace/RUNBOOK.md`**.
> Last updated: 2026-07-06 (T1 complete).

## Done
- Reviewed PRD v3 + FMCSA guide + blank log + assessment images.
- Workspace setup; Django + React scaffold; OSRM/Photon services.
- **HOS engine HARDENED + 36 pytest passing** (`backend/hos_engine/`) — full rewrite:
  - `TripPlan` dataclass with `events`, `per_day[]`, `compliance`, `totals`
  - Midnight splits (events crossing midnight split into two)
  - Per-day rollups with **totals=24 invariant** enforced on every day
  - Compliance report: 11h drive, 14h window, 8h break, 70h cycle (pass/fail + margins + CFR refs)
  - Polyline interpolation: events positioned on-route via haversine-based cumulative distance
  - Reverse-geocode injection: geocoder callable keeps engine pure Python; Nominatim in services
  - Robust pre-trip inspection (tracks per duty period, resets on rest/restart)
  - Edge cases: zero-distance, cycle-blocked, single-window, fuel stops
  - **John Doe golden test**: FMCSA guide pp.18-19 sample day → Off=10, SB=1.75, Drive=7.75, OnDuty=4.5 = 24.0 ✓
- Trip API `POST /api/trips/plan/` now returns `{trip_id, route_geometry[], events[], per_day[], compliance{}, totals{}}`.
  Trip is persisted to DB. Events include `duration_hours`, `miles_start`, `miles_end`.
- `core/services.py`: added `reverse_geocode()` with LRU cache (256 entries), 0.01° rounding, 1 req/s rate limiting.
- **Spotter "Night Haul" design system locked** — tokens in `tailwind.config.js` + `src/index.css`;
  Inter + JetBrains Mono; green `#22C55E` validated 9:1 on black (AA+AAA).
- **Signature scroll-video hero DONE** — `FrameScrubHero.tsx`; 180 WebP frames extracted from
  `background-video.mp4` via `ffmpeg-static` (`frontend/scripts/extract-frames.mjs`) into
  `public/frames/hero/`. Canvas scrub + GSAP ScrollTrigger (500vh pin) + Lenis smooth scroll;
  4 choreographed copy beats; animated route-line + GPS fuel-pin; reduced-motion fallback.
- **Dispatch panel DONE** — `TripForm.tsx` (validated 4-input) + `CycleDial.tsx` (270° gauge).
- **Results view (basic) DONE** — `ResultsStage.tsx`: summary tiles + duty-status ribbon + event list.
  Replaces the old raw-JSON dump. Map + log sheets are placeholders.
- **Rig AI copilot DONE** — `backend/assistant/` & `frontend/src/features/rig/`:
  - RAG document ingestion (`ingest_docs` command) for HOS PDF and App FAQ.
  - Hybrid pgvector + FTS search with RRF scoring in `rag.py` using direct SQL.
  - Pydantic-validated tools (`plan_trip`, `geocode`, `get_trip_logs`, `export_pdf`, compliance/quick calc) in `tools.py`.
  - LangGraph state machine with router, retriever, agent, and human-in-the-loop NodeInterrupt confirmation in `graph.py`.
  - Django SSE streaming endpoint `chat_view` in `views.py` with Turnstile, rate limits, checkpointer session state, and global token budget.
  - Zustand `uiActionBus.ts` store for client-side events integration.
  - Spotter-themed `ChatDock.tsx` and custom `ConfirmTripCard.tsx` React overlays.
- Frontend production build VERIFIED GREEN (`npm run build`). Boilerplate removed. tsconfig fixed.

## Viewport-locked rebuild (2026-07-06, later session)
- **Reworked the whole front-of-app into a viewport-locked scrollytelling state machine**
  (per `implementation_plan.md` + user directive). ONE fixed background canvas; overlays
  (`hero → plan → results`) are replaced in place, no stacked sections.
  - NEW `features/stage/ViewportStage.tsx` (orchestrator); `App.tsx` slimmed; deleted old
    `features/hero/FrameScrubHero.tsx`.
  - Scroll scrubs frames 0→90 (hero→form); submit awaits API then plays 90→179 into results;
    scroll-up/swipe/Edit reverses. `ResultsStage` gained a `fit` prop → fits one viewport,
    only the timeline scrolls internally.
  - Fixes: `scrub: 1` + eager-preload full scrub range (smoothness); `data-lenis-prevent` so
    nested panels scroll natively (Lenis was swallowing wheel). Build verified green.
  - **PIVOT (user)**: scroll is now a TRIGGER, not a scrubber. Rebuilt `ViewportStage` as a
    gesture-driven `hero|plan|results` section machine — one small scroll/swipe/arrow plays a slow
    (~2.2–2.4s) self-completing transition to the next state. Body fully locked; ScrollTrigger +
    Lenis removed. Speed dials: `HERO_PLAN_DUR`/`PLAN_RESULTS_DUR`. Build green.
- **Verify still open**: exercise live in browser with the Django backend running
  (RUNBOOK §3) — the plan→results play-forward needs a real API response.

## Scope reset + ELD log sheets (2026-07-06, latest session)
- **Re-read the ACTUAL assessment** (`tasks/new-full-stack-dev-assessment.docx`): only needs
  Django+React, 4 inputs, a **route map**, **filled ELD daily log sheets**, live URL + Loom + GitHub;
  graded on accuracy + UI/UX. PRD v3 is ~10× over-scope. The log sheets (graded output #2) were missing.
- **T2 route map**: already built earlier (`features/map/RouteMap.tsx`, Leaflet + CARTO dark, green
  polyline, pins/popups) — progress notes above were stale.
- **T3 ELD LOG SHEETS — DONE** ✅ (the critical missing deliverable):
  - `features/logs/logSheet.ts` (tz-safe geometry/data module), `LogSheetSVG.tsx` (faithful paper-grid
    replica, totals=24, remarks, recap, shipping docs), `LogSheets.tsx` (day tabs + PDF export via
    jsPDF/svg2pdf). Wired into `ViewportStage` results (motion + reduced). `npm run build` GREEN.
  - Verified on a real 2-day engine plan: every day tiles 00:00→24:00 & totals 24h; SSR + headless
    screenshot confirms faithful, correct sheets (11h drive cap; midnight-crossing sleeper handled).
  - `lib/api.ts` types extended for `per_day`/`compliance`/`totals`/`meta`.

## Backend cut + simplify — DONE (2026-07-06, same session)
- **Rig is now a plain Django JSON endpoint** (`assistant/views.py`): removed Turnstile, token budget,
  layered throttles, and SSE. Runs LangGraph to completion, returns
  `{reply, citations, ui_actions, needs_confirmation}`. Kept the **Postgres checkpointer + HITL trip
  confirm**, and a **simple 10-chats/day per-visitor limit** (`DAILY_CHAT_LIMIT`).
- **Frontend chat** (`chatService.ts` → `sendChat`, `ChatDock.tsx`): plain fetch, no streaming.
- **`rag.py`** already used `gemini-embedding-001@768` (older "retired model" note was stale).
- **Supabase**: `settings.py` uses `DATABASE_URL` (Supabase Postgres) when present; SQLite fallback local.
- **Verified**: `manage.py check` clean, `npm run build` green, view smoke test (405/400/503/429 all
  correct). Full AI path needs live Gemini + Supabase + `ingest_docs` (untestable offline).

## Vercel "works on my laptop only" bug — FIXED (2026-07-07)
- **Root cause**: `frontend/src/features/rig/chatService.ts` hardcoded the backend URL
  fallback to `http://127.0.0.1:8000` **without** the `import.meta.env.PROD ? ""` guard
  that `lib/api.ts` has. Vite inlines env at build time, so the deployed chatbot called
  `127.0.0.1:8000` = the *visitor's own* machine. Worked only on the dev laptop (Django
  running locally); "connection refused" everywhere else → chatbot dead.
- **Fix**: chatService now uses `VITE_API_URL || (PROD ? "" : localhost)` (relative URLs
  in prod, proxied to Django via vercel.json `/api/(.*)` route).
- **Also flagged (user must verify)**: if `VITE_API_URL` is set to localhost/127.0.0.1 in
  the **Vercel dashboard** env vars, it overrides the code and breaks plan/search too —
  must be deleted. `frontend/.env` itself is gitignored, so it does NOT reach Vercel.
- **Background animation** on other laptops: NOT a hard bug — 180 hero frames are all
  committed/deployed. Skipped only when OS "Reduce motion" is ON (`prefersReducedMotion()`,
  by design) or on weak hardware/slow network. Confirm via DevTools on the other machine.

## Rig AI rework — reliable planning + web knowledge (2026-07-07) — DONE, VERIFIED LIVE
- **Fixed the "chatbot replies but nothing plans" bug + hallucination + no web data.**
- **Rewrote `assistant/graph.py`** into ONE tool-calling agent (`agent → route_tools → execute_tools`).
  Deleted the brittle `router_node` / `retriever_node` / `direct_response_node` / RAG-grader / flash-lite
  router that were dropping trip requests into un-grounded chat. All tools always bound.
- **New tools in `assistant/tools.py`**:
  - `search_hos_docs` — PDF/FAQ RAG as a tool (source of truth #1; forced FIRST for HOS questions; cited).
  - `web_search` — Gemini **Google Search grounding** (no new key), for live/outside-the-guide info,
    labeled "from the web".
- **Prompt**: forces `plan_trip` the moment all 4 params exist; forbids claiming actions without a
  successful tool result; forbids inventing rules/numbers.
- **`assistant/views.py`**: reads the langgraph-1.2.7 **`"__interrupt__"` stream update** (the old
  `except GraphInterrupt` was dead) so the ConfirmTripCard shows again; citations now parsed from the
  search tool results (deduped).
- **`ChatDock.tsx`**: citation chips render web sources as clickable links.
- **Verified live** (real Gemini+Supabase): plan→confirm→render works; HOS Qs cite FMCSA pages; live Qs
  hit the web. `manage.py check` clean; `npm run build` green.
- **Operational reminder**: web/PDF answers require `ingest_docs` to have been run and
  `GEMINI_API_KEY`/`DATABASE_URL` set (they are, locally). If deployed, set the same env on Vercel.

## Location autocomplete reliability — FIXED (2026-07-07)
- **Symptom**: "Plan a haul" location fields suggested places only *sometimes*.
- **Cause**: keystrokes round-tripped through the Vercel/Django serverless backend
  (cold-start = silent empty dropdown) to the flaky public Photon instance; errors were
  swallowed; no US ranking bias.
- **Fix**:
  - `frontend/src/lib/api.ts` — `suggestLocations` now calls `photon.komoot.io` **directly
    from the browser** (CORS `*` verified), no backend hop; falls back to the Django
    `/api/trips/suggest/` endpoint only on a non-abort failure. Ported the label builder
    (`photonLabel`) + US state map to TS.
  - **No coordinate bias** (tested — it made ranking worse: tiny nearby streets/streams
    beat real cities). Instead a **stable US-first re-rank** keeps US cities ahead of
    foreign villages; over-fetch + dedupe on label.
  - `backend/core/services.py` — `geocode_suggest` hardened (retry once, 6s timeout,
    US-first re-rank, dedupe); `_photon_label` no longer appends county to place features
    ("Chicago, IL" not "Chicago, Cook County, IL").
  - No new deps, no API key (kept keyless per user). `tsc --noEmit` green; services.py parses.
- **Verify still open**: exercise live in the browser (type into the 3 fields; confirm the
  dropdown appears consistently and picking a suggestion fills the field). The direct-Photon
  path is testable without the backend running.

## In Progress
- Nothing actively coding.

## Next Actions (defer deploy per user)
1. **Run it live end-to-end** with real Supabase + Gemini creds: `ingest_docs`, then exercise Rig chat
   (RUNBOOK). This is the only remaining way to validate the AI path.
2. (Optional) Compliance gauge dials — data already in `compliance{}`.
3. Deploy — deferred per user.

## Superseded / de-scoped (per user)
- Turnstile, token budget, layered rate limits, SSE streaming, 2-project Vercel serverless, RLS/pooler
  complexity — CUT. Kept: Supabase, LangGraph + checkpointer + HITL, simple daily chat cap, design polish.

## Known issues
- "Plan My Haul" errors when the Django backend isn't running — start it (RUNBOOK §3). Not a code bug.
- Backend is dev-only (SQLite, DEBUG=True, CORS `*`) — must move to Supabase + harden (T5/T7).
- `assistant/rag.py` references the RETIRED `embedding-001` model — must fix (T6).
- ui-ux-pro-max skill CLI is a broken symlink on this Windows checkout (guidance text still usable).
- `impeccable` skill is frontend/UI-focused; backend quality review done manually for T1.
