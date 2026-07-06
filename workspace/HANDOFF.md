# HAULR — Build Handoff & Detailed TODOs

> **Purpose:** Hand this project to any coding agent and let them continue without re-discovery.
> Source of truth for scope is `workspace/project-spec.md` (the full PRD v3). This file is the
> **live build state + step-by-step remaining work**. Read `project-spec.md §2–§5` before UI/AI work.
>
> **Last updated:** 2026-07-06 (Session: "T1 — Harden HOS engine: COMPLETE. 36 tests green, totals=24 invariant, John Doe golden test, compliance report, polyline interpolation, reverse-geocode remarks.").

---

## 0. TL;DR — where we are

Antigravity's original build was a skeleton: a JSON-dump UI, no hero, no map, no logs, no AI,
SQLite instead of Supabase. This session **rebuilt the frontend foundation + the signature hero**
and wired the (working) trip engine into a real results view.

| Layer | State | Notes |
|---|---|---|
| HOS engine | ✅ **DONE** | `backend/hos_engine/engine.py`, 36 pytest pass. Full TripPlan dataclass: events, per_day (totals=24 invariant), compliance (4 limits + margins), midnight splits, polyline interpolation, injectable geocoder, John Doe golden test. |
| Trip API | ✅ **enhanced** | `POST /api/trips/plan/` returns `{trip_id, route_geometry[], events[], per_day[], compliance{}, totals{}}`. Persists Trip to DB. |
| Frontend design system | ✅ done | Spotter "Night Haul" tokens in `tailwind.config.js` + `src/index.css`. Inter + JetBrains Mono. |
| Hero (scroll video) | ✅ done | `src/features/hero/FrameScrubHero.tsx`. 180 WebP frames extracted & committed to `public/frames/hero/`. |
| Dispatch panel | ✅ done | `src/features/dispatch/{TripForm,CycleDial}.tsx`. Validation + cycle dial. |
| Results view | ✅ basic | `src/features/results/ResultsStage.tsx`. Summary tiles + duty ribbon + event list. **Map + log SVGs are placeholders.** |
| Route map (Leaflet) | ❌ TODO | Deps installed (`leaflet`, `react-leaflet`). §T2. |
| Log sheets (SVG+PDF) | ❌ TODO | Deps installed (`jspdf`, `svg2pdf.js`). §T3. |
| Compliance gauges | ❌ TODO | §T4. |
| Rig AI chat | ❌ TODO | `backend/assistant/views.py` is EMPTY. §T6. |
| Supabase | ❌ TODO | Backend still on SQLite. `.env` has real creds. §T5. |
| RAG ingestion | ❌ TODO / broken | `backend/assistant/rag.py` references RETIRED `embedding-001`. Must use `gemini-embedding-001@768`. §T6. |
| Security layer | ❌ TODO | No throttles/Turnstile/token budget. §T7. |
| Deploy (Vercel) | ❌ TODO | §T8. |

**User decisions locked this session:** (1) build **frontend experience first**; (2) **go live**
with the real Supabase + Gemini credentials in `.env`.

---

## 1. How to run locally (verified this session)

```bash
# Frontend (Node 22, deps installed)
cd frontend
npm run dev            # hot-reload dev server (Vite)  → http://127.0.0.1:5173
npm run build          # tsc + vite build → dist/  (VERIFIED GREEN this session)
npm run preview -- --port 4319   # serve dist/

# Backend (Python 3.13 via repo .venv)
cd backend
../.venv/Scripts/python.exe manage.py runserver      # → http://127.0.0.1:8000
../.venv/Scripts/python.exe -m pytest hos_engine/    # 5 tests pass

# Re-extract hero frames (only if background-video.mp4 changes)
cd frontend && node scripts/extract-frames.mjs [srcVideo] [targetFrames=180] [width=1280]
```

**"Plan My Haul" 500/network error = backend not running.** Start Django (above). The endpoint
does not touch the DB, so no migration needed just to plan a trip.

---

## 2. Environment gotchas discovered this session (READ — saves hours)

1. **No system `ffmpeg`/`ffprobe`.** We use the npm `ffmpeg-static` binary via
   `frontend/scripts/extract-frames.mjs`. Duration is parsed from ffmpeg stderr (no ffprobe).
   Video is 8.0s → 22.5fps → 180 frames @1280px, 27.8 KB avg, 4.9 MB total. Frames are already
   generated; you normally don't need to re-run this.
2. **Veo watermark**: the source clip has a tiny "Veo" watermark bottom-right. The hero's bottom
   gradient scrim hides it. If you re-crop, keep it covered.
3. **TypeScript is 6.0** (`frontend/package.json` → `typescript ~6.0.2`). It **deprecates `baseUrl`**
   (removed from `tsconfig.json`; `paths` now resolves relative to the config file). Also had to add
   `"jsx": "react-jsx"` (was missing → every `.tsx` failed). Don't re-add `baseUrl`.
4. **Dep versions are unusual but real & installed:** `react 19`, `vite 8`, `lucide-react 1.23.0`,
   `@studio-freight/lenis 1.0.42`, `gsap 3.x`, `tailwindcss 3.4`. Build passes with them.
5. **Path alias** `@/` → `src/` is set in BOTH `vite.config.ts` and `tsconfig.json`. Keep in sync.
6. **Backend `settings.py` is dev-only**: `DEBUG=True`, `CORS_ALLOW_ALL_ORIGINS=True`, SQLite default,
   insecure `SECRET_KEY`. All of this must change for Supabase/prod (§T5, §T7).
7. **`.env` files hold REAL credentials** (`backend/.env`: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
   GEMINI_API_KEY, DATABASE_URL; `frontend/.env`: VITE_API_URL). Never commit them; never expose
   service role / Gemini keys to the frontend.
8. **`hero.png` and Vite boilerplate were deleted** (`counter.ts`, `style.css`, `assets/*.svg`).

---

## 3. Frontend architecture (as built)

```
frontend/src
  App.tsx                       # shell: Hero → Dispatch → Results → Footer; smooth scroll; plan() handler
  index.css                     # tokens, base, utilities (.panel .eyebrow .gps-fix .grain .lane-divider .haulr-range)
  main.tsx                      # mounts <App/> into #app
  lib/
    scroll.ts                   # useSmoothScroll() = Lenis + GSAP ticker + ScrollTrigger; getLenis(); prefersReducedMotion()
    frames.ts                   # HERO_FRAME_COUNT=180; preloadHeroFrames() (eager 30 + idle rest)
    api.ts                      # planTrip(); summarize(); DutyEvent/TripPlan types  ← extend as backend grows
  features/
    hero/FrameScrubHero.tsx     # canvas frame-scrub, 500vh pin, 4 copy beats, route-line + fuel-pin SVG
    dispatch/TripForm.tsx       # validated 4-input form + CTA
    dispatch/CycleDial.tsx      # 270° gauge range input
    results/ResultsStage.tsx    # summary tiles + duty ribbon + event list + map/log placeholder
  components/ui/*               # shadcn primitives (button/card/dialog/input/label/sheet/slider) — mostly UNUSED now, safe to use or delete
public/frames/hero/frame-0001..0180.webp
scripts/extract-frames.mjs
```

**Design tokens (locked):** `--void #000000`, `--panel #0A0A0A`/`#111214`, `--hairline #1F2430`,
`--green #22C55E` (**9:1 contrast on black — AA+AAA pass, validated**), `--green.bright #4ADE80`,
`--ink #1E3A5F` (log "pen" blue), `--gray #9CA3AF`/`#6B7280`, `--danger #EF4444`, `--warn #F59E0B`.
Fonts: **Inter** (UI/display, 700–900 tight) + **JetBrains Mono** (data/timestamps/numerals, tabular).
Motion easing: `cubic-bezier(0.22,1,0.36,1)` (`ease-haul`), 400–600ms, no bounce.
Motifs available as utilities: `.gps-fix` (pulsing ring), `animate-radar-sweep`, `animate-lane-dash`,
`animate-scanline`, `.grain`, `.bg-dots`, `.lane-divider`, `shadow-glow*`.

> **PRD note:** §2.2 says to eyedrop the *exact* Spotter green from the live site and re-validate.
> We locked the provisional `#22C55E` (9:1). If you sample a truer green, change it in ONE place:
> `tailwind.config.js` (`green.DEFAULT`) + the `--primary`/`--ring` HSL in `index.css` + the hardcoded
> `#22C55E` strings in `FrameScrubHero.tsx`/`CycleDial.tsx`/`ResultsStage.tsx`. Prefer a CSS var.

---

## 4. Backend architecture (as built)

```
backend/
  haulr/settings.py     # DEV ONLY (sqlite, DEBUG, CORS *). See §T5/§T7 for prod.
  haulr/urls.py         # admin/ + api/trips/
  trips/urls.py         # plan/ → PlanTripView
  trips/views.py        # PlanTripView: geocode ×3 → OSRM ×2 → HOSEngine → JSON. Does NOT save Trip.
  trips/models.py       # Trip, RouteLeg, DutyEvent (defined, mostly unused — persistence TODO)
  core/services.py      # geocode() (Photon), get_route() (OSRM). No caching, no retries/timeouts yet.
  hos_engine/engine.py  # HOSEngine — the crown jewel (see §T1 for gaps)
  hos_engine/test_engine.py  # 5 tests pass
  assistant/rag.py      # BROKEN model ref (embedding-001). Rewrite in §T6.
  assistant/views.py    # EMPTY. Rig lives here (§T6).
```

API response shape (current):
```jsonc
POST /api/trips/plan/  { current_location, pickup_location, dropoff_location, cycle_used_hrs }
→ {
  "route_geometry": [ {type:"LineString", coordinates:[[lng,lat],...]}, {...} ], // leg1, leg2
  "events": [ {status, start(ISO), end(ISO), location, note, lat, lng}, ... ]
}
```

---

# REMAINING TODOs (detailed, ordered)

> Convention: each task lists **Files**, **Steps**, **Acceptance**, **Gotchas**. Deps in parentheses
> are already in `package.json`/`requirements`. Run `impeccable` skill as the quality gate before
> marking any task done (PRD §11). Update this file + `progress.md` + `decisions.md` after each.

## T1 — Harden the HOS engine ✅ DONE (2026-07-06)
**Why:** Map pins, log sheets, and compliance gauges all consume engine output. It currently lacks
the data they need. This is the assessment's graded centerpiece (PRD §4.2, §10, Appendix A).

**Files:** `backend/hos_engine/engine.py`, `backend/hos_engine/test_engine.py`, `backend/trips/views.py`,
`backend/core/services.py`

**Completed:**
1. ✅ **Richer output** — `generate_plan()` returns `TripPlan` dataclass with `events`, `per_day[]`,
   `compliance`, `totals` (driving hrs, on-duty hrs, distance, days).
2. ✅ **Per-day rollups + midnight splits** — Events crossing midnight are split; each day padded to
   full 24h. **totals=24 invariant enforced** on every day for every trip (including 2000mi).
3. ✅ **Compliance report** — 4 limit checks (11h §395.3(a)(3)(i), 14h §395.3(a)(2),
   8h→break §395.3(a)(3)(ii), 70h §395.3(b)(2)); pass/fail + remaining margin; 34-hr restart flag.
4. ✅ **Stop interpolation** — `interpolate_along_polyline()` uses haversine-based cumulative
   distance to place events along the GeoJSON geometry. Position advances as miles are consumed.
5. ✅ **Reverse-geocode remarks** — Geocoder injected as `Callable[[float,float],str]` into engine
   (keeps it pure). `core/services.py` adds `reverse_geocode()` via Nominatim with LRU cache (256)
   and 1 req/s rate limiting. Rounds to 0.01° (~1.1km) for cache grouping.
6. ✅ **Pre-trip inspection** — `_ensure_pretrip()` tracks per duty period via `_day_pretrip_done`
   flag; resets on 10h rest or 34h restart. Robust and not fragile.
7. ✅ **Edge cases tested** — zero-distance leg, cycle-blocked departure (restart first), single-window
   trip, fuel stop every 1000mi. All have dedicated tests.
8. ✅ **John Doe golden test** — `build_john_doe_day()` reproduces the FMCSA guide sample day;
   asserts grid totals **10 / 1.75 / 7.75 / 4.5 = 24.0**.
9. ✅ **Trip persistence** — `PlanTripView` saves Trip to DB and returns `trip_id`.
10. ✅ **API enhanced** — Response includes `per_day[]`, `compliance{}`, `totals{}`, `trip_id`.

**36 tests pass** (was 5). Engine remains **pure Python, zero Django imports**.

**Gotchas:** keep `hos_engine/` **pure Python, zero Django imports** (PRD §6.3) so it runs in pytest
and serverless identically. Reverse-geocode must be injected (pass a callable) to keep purity — do
the actual HTTP in `views.py`/services, not in the engine.

## T2 — Interactive route map (frontend)  (leaflet, react-leaflet — installed)
**Files (new):** `src/features/map/RouteMap.tsx`, `StopPin.tsx`, `TruckPlayback.tsx`,
`TimelineScrubber.tsx`; wire into `ResultsStage.tsx` (replace the placeholder panel).

**Steps:**
1. `RouteMap`: react-leaflet `<MapContainer>` with **CARTO Dark Matter** tiles
   (`https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png`, attribution required — free, no key).
2. Draw the route: combine `route_geometry[].coordinates` (GeoJSON is [lng,lat] → Leaflet wants
   [lat,lng], SWAP) into a `<Polyline>` in `--green` with a soft glow (use a wider translucent
   polyline underneath). Fit bounds to the route.
3. `StopPin`: custom `divIcon` per event type (🏁 start, 📦 pickup, 🏭 dropoff, ⛽ fuel, ☕ break,
   🛏 10-hr rest, 🔄 34-hr restart) using Lucide icons in a green pin with `.gps-fix` pulse. Popup:
   arrival time, duration, running odometer, hours remaining. **Use SVG icons, not emoji** (design rule).
4. `TruckPlayback`: a play button animates a truck marker along the polyline; a `TimelineScrubber`
   (range slider) drives a shared `playhead` (Zustand store) that ALSO highlights the active event in
   the ribbon and (later) the active log line. This is the "money shot" (PRD §4.3).
5. Fix Leaflet marker asset path issue under Vite (import marker icons or use `divIcon` only).

**Acceptance:** map renders black tiles, green route on the road, correct pins with popups; scrubber
moves a truck marker and syncs the ribbon highlight; no console errors; responsive (stacks on mobile).

**Gotchas:** GeoJSON coord order is [lng,lat]. Leaflet CSS must be imported
(`import "leaflet/dist/leaflet.css"`). SSR not relevant (SPA). Cap pin count popups for perf.

## T3 — ELD Daily Log sheets (SVG) + PDF export (frontend)  (jspdf, svg2pdf.js — installed)
**Reference art:** `tasks/blank-paper-log.png` (grid to replicate) + FMCSA guide pp.15–19.
**Files (new):** `src/features/logs/LogSheetSVG.tsx`, `DayTabs.tsx`, `RecapBox.tsx`, `PdfExport.tsx`.
**Strongly recommended:** create a reusable skill/module `eld-log-svg` (PRD §11 planned candidate)
that takes one day's `DutyEvent[]` → finished SVG, so app + PDF + playback share the geometry.

**Steps:**
1. Build the SVG grid faithfully to `blank-paper-log.png`: header (date, total miles today, carrier,
   main office & home terminal address, truck/trailer/plate), the **24-hour × 4-row grid at 15-min
   resolution** (Off Duty / Sleeper Berth / Driving / On Duty), Remarks lane, shipping docs,
   **70-hr/8-day recap box**. Render **paper-white inside a black card** (PRD §2.3).
2. Draw the duty line: horizontal segment on the correct status row for each event, **vertical
   connectors** at each status change. Per-row **Total Hours** at right, auto-summed — **assert ==24**.
3. Remarks: City, ST at each duty change (from engine, §T1.5), placed under the time of change.
4. Active day line animates in via `stroke-dashoffset` in green, settling to `--ink` (#1E3A5F) for
   print fidelity (PRD §4.4).
5. `DayTabs`: spiral-notebook day navigation (one sheet per calendar day from `per_day`).
6. `PdfExport`: "Download logs (PDF)" using jsPDF + svg2pdf.js client-side, one page per day. (Later:
   also upload to Supabase Storage and let Rig hand out a signed link — §T5/§T6.)

**Acceptance:** for the default Dallas→Tulsa→Chicago trip, each day sheet matches the paper grid,
totals read 24, remarks show cities, PDF downloads with all days. Add a Vitest/RTL test on totals.

**Gotchas:** grid math is fiddly — 24h across a fixed pixel width; 15-min = width/96. Do the geometry
once (the `eld-log-svg` module) and unit-test the tick mapping. Midnight-crossing events must already
be split by the engine (§T1.2) or split them here consistently.

## T4 — Compliance dashboard gauges (frontend)
**Files (new):** `src/features/compliance/GaugeDial.tsx`, `ComplianceSummary.tsx`.
**Steps:** 4 green dial gauges (reuse `CycleDial` geometry) for 11h/14h/8h/70h, scrubbable to any
timeline point (read from the playback playhead store, §T2.4). Plain-English summary from
`compliance` report ("Arrive with 6.5 hrs left — no restart needed"). Violations in `--danger` with the
CFR section cited (Appendix A mapping). **Acceptance:** gauges reflect margins from §T1.3; update with
the scrubber.

## T5 — Supabase migration + services hardening (backend)
**Why:** PRD mandates Supabase (Postgres + pgvector + Storage + RLS). Currently SQLite. Creds in `.env`.
**Files:** `backend/haulr/settings.py`, `backend/core/services.py`, `backend/core/models.py`, new migrations.
**Steps:**
1. `settings.py`: read `DATABASE_URL` (Supabase **transaction pooler :6543**, `pgbouncer=true`) via
   `dj_database_url.config(conn_max_age=0)`; set `OPTIONS={"sslmode":"require"}`,
   `DISABLE_SERVER_SIDE_CURSORS=True`. Add DB cache (`createcachetable`). Tighten `DEBUG`,
   `ALLOWED_HOSTS`, `CORS_ALLOWED_ORIGINS` (no `*`), `SECURE_*` headers, `CSRF_TRUSTED_ORIGINS`.
   Move `SECRET_KEY` to env. (PRD §9 Step 2.)
2. Supabase SQL: `create extension if not exists vector;`; create private Storage bucket `log-pdfs`.
3. Models/migrations for: `trips, route_legs, duty_events, log_sheets, chat_threads, rate_limits,
   token_budget, geocode_cache, documents(vector(768)+tsvector), langgraph_checkpoints`.
   Run migrations from your machine against the **direct :5432** URL (serverless can't migrate).
4. Persist trips: make `PlanTripView` save `Trip`+events and return a `trip_id` (needed by Rig tools
   `get_trip_logs`, `export_logs_pdf`, and by log/PDF features).
5. `core/services.py`: add Postgres-cached geocode/OSRM (respect Nominatim 1 req/s), timeouts + 1 retry
   + graceful fallback messages (PRD §6.3).
6. Enable **RLS on every table**; anonymous signed session cookie partitions trips/threads.
**Acceptance:** app runs against Supabase; a planned trip persists and is re-fetchable by id; geocode
cache hits on repeat; `/api/health/` added and green.

## T6 — Rig AI copilot: RAG + LangGraph agent + SSE (backend + frontend)
**Backend files:** `backend/assistant/{views,rag,agent,tools,graph}.py`, a management command
`ingest_docs`. **Frontend files:** `src/features/rig/{ChatDock,MessageStream,CitationChip,ConfirmTripCard}.tsx`,
`src/lib/sse.ts`, `src/lib/uiActionBus.ts` (Zustand).
**Model env vars (already in `.env`/PRD §9):** `GEMINI_CHAT_MODEL=gemini-2.5-flash`,
`GEMINI_LITE_MODEL=gemini-2.5-flash-lite`, `GEMINI_EMBED_MODEL=gemini-embedding-001`.
**Use the `gemini-api-dev` / `gemini-interactions-api` skills for current SDK syntax.**

**Steps:**
1. **Fix RAG (`rag.py`)** — DELETE the `embedding-001` reference. Use
   `GoogleGenerativeAIEmbeddings(model="gemini-embedding-001", ...)` with **`output_dimensionality=768`**
   (MRL — stays under pgvector HNSW 2000-dim limit; NEVER store default 3072). PRD §5.4.
2. **Ingest** (`python manage.py ingest_docs ./docs/fmcsa-hos-guide.pdf ./docs/app-faq.md`): pypdf +
   layout-aware chunking (~800 tok, 120 overlap, section-header-prefixed); Appendix-A exception TABLES
   → markdown rows (one exception per chunk). Embed @768 into `documents` pgvector. Copy the PDF from
   `tasks/fmcsa-hos-395-...pdf` into `backend/docs/`.
3. **Retrieval:** hybrid pgvector top-8 + Postgres FTS top-8 → Reciprocal Rank Fusion → flash-lite
   relevance grade → top-4. Answer ONLY from context; every claim tagged w/ chunk id → citation chips.
4. **LangGraph** (`graph.py`): Router (flash-lite, structured) → {Retriever+Grader+Generate | Agent
   (flash, tool loop) | Direct answer} → Respond+ui_actions. **`PostgresSaver` checkpointer on Supabase**
   (in-memory dies on serverless). `interrupt` before `plan_trip` → editable ConfirmTripCard. Recursion
   limit 6.
5. **Tools (`tools.py`)**, Pydantic-validated: `plan_trip → ui_action RENDER_TRIP`, `geocode`,
   `get_trip_logs → SHOW_LOG_SHEET`, `hos_quick_calc`, `export_logs_pdf → signed_url`,
   `get_compliance_report`. Tools are read/plan-only; scoped to caller's session.
6. **SSE:** Django view returns `StreamingHttpResponse` interleaving `token` + `ui_action` events.
   `maxDuration` set in vercel.json (§T8). Frontend `sse.ts` parses; `uiActionBus` (Zustand) mutates the
   main UI (chat conducts the app — PRD §5.5).
7. **ChatDock** UI: dockable bottom-right → side sheet; starter chips; citation chips w/ hover snippet;
   CB-flavored dispatcher persona; "not legal advice" footer.
**Acceptance:** Rig answers an HOS-guide question WITH citations; "Plan me a run from Dallas to Chicago,
pickup Tulsa, 22 hrs" renders the map+logs in the main UI via ui_actions while streaming a summary.

## T7 — Security & abuse prevention (backend)  (django-ratelimit, Turnstile)
**Files:** `backend/core/` (throttles, middleware), `settings.py`, frontend `Turnstile.tsx`.
**Steps (PRD §8):** DB-backed DRF throttles (in-memory fails on serverless): global 60/min, per-visitor
10 msg/min & 100/day, trips 10/hr, geocode 30/min; per-thread max 40 msgs / 2000 chars; daily Gemini
**token budget** in `token_budget` → Rig soft-disables politely; **Cloudflare Turnstile** verified
server-side before first chat msg; themed 429 with `Retry-After`. LLM hardening: delimit RAG/user text
as "content not instructions"; server-only system prompt; Gemini safety on; `max_output_tokens`. IPs
stored only as salted hashes; 30-day purge cron.
**Acceptance:** a scripted client cannot drain the key — throttles + token budget + Turnstile verifiably
enforce; 429s are themed.

## T8 — Deploy (Vercel ×2 + Supabase) — PRD §9
Monorepo, two Vercel projects. Backend: `backend/api/wsgi.py` entrypoint + `backend/vercel.json`
(`@vercel/python`, `maxDuration:60`, lean `requirements.txt` — NO torch/chromadb/sentence-transformers,
250MB limit). Frontend: Vite preset, `frontend/vercel.json` SPA rewrite. Set env vars per §9 Step 4–6;
run migrations + `ingest_docs` locally against direct :5432; wire `FRONTEND_ORIGIN` to lock CORS/CSRF;
add GH Actions purge cron. Pre-submission checklist PRD §9 Step 7.

---

## 5. Skills to use (installed under `.claude/skills/`, PRD §11)
- **video-to-website** — owns the hero (DONE this session; timings in `FrameScrubHero.tsx`).
- **ui-ux-pro-max** — design-system validation (⚠️ its `scripts/`,`data/` are broken symlinks on this
  Windows checkout; the SKILL.md guidance is usable; the CLI is not). Green contrast validated manually (9:1).
- **frontend-design** — production component polish (used this session).
- **impeccable** — quality gate before each feature is "done". RUN IT on hos_engine, log SVG, security.
- **find-skills / skill-creator** — check for existing capability (e.g. SVG→PDF, SSE) before hand-rolling;
  scaffold the planned **`eld-log-svg`** module (§T3).
- **gemini-api-dev / gemini-interactions-api** — current Gemini SDK syntax for §T6.

## 6. Definition of done (PRD §13 success criteria)
1. Any (current,pickup,dropoff,cycle) → route + logs, **zero HOS violations**, all 4 assumptions honored.
2. Log sheets match the paper grid & total 24 hrs/day.
3. Rig answers arbitrary HOS questions **with citations** and completes a full trip plan via chat alone.
4. Key can't be drained: Turnstile + layered rate limits + token budget enforce.
5. Runs on 2 Vercel free + 1 Supabase free; only metered cost = Gemini pennies.
6. Side-by-side with spotter.ai it looks like a sibling product.
