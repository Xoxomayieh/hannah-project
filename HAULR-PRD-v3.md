# HAULR — Product Requirements Document (v3.0)
### *"The open road, planned to the minute."*
**AI-Powered HOS Trip Planner & ELD Log Generator**

| | |
|---|---|
| **Version** | 3.0 — Required stack (Django + React) · Vercel-only hosting · Supabase backend · Spotter.ai design · hardened security · deployment guide |
| **Status** | Ready for build |
| **Stack** | **Django 5 + DRF** (Python, Vercel serverless) · **React 18 + Vite + TS** (Vercel static) · **Supabase** (Postgres + pgvector + Storage) · **Gemini 2.5 Flash + LangChain/LangGraph (Python)** |
| **AI models** | `gemini-2.5-flash` (main) · `gemini-2.5-flash-lite` (router/grader) · `gemini-embedding-001` @ 768 dims (RAG) — paid key, cheapest current-gen tier. *(`text-embedding-004` and older Flash models are retired — do not reference them anywhere in code.)* |
| **Cost constraint** | Hosting/services $0 (Vercel Hobby + Supabase free). Only metered cost: Gemini API on your paid key (pennies at this scale). |
| **Build workflow** | Claude Code + installed skills (§11) — same setup as the portfolio project |
| **References** | FMCSA *Interstate Truck Driver's Guide to Hours of Service* (Apr 2022), blank paper Driver's Daily Log, spotter.ai design system |

---

## 1. Overview & Problem Statement

### 1.1 The problem
An interstate property-carrying truck driver planning a multi-day trip must simultaneously satisfy four interlocking federal limits (49 CFR Part 395):

1. **11-hour driving limit** — max 11 hours behind the wheel per shift.
2. **14-hour driving window** — no driving after 14 consecutive hours since coming on duty; the clock never pauses.
3. **30-minute break** — required after 8 *cumulative* hours of driving.
4. **70-hour/8-day cycle** — no driving past 70 on-duty hours in any rolling 8 consecutive days (34-hour restart resets it).

Doing this by hand across a 2,000-mile trip — while also scheduling fuel stops, pickup/dropoff time, and 10-hour resets, then hand-drawing each day onto a paper log grid — is tedious and error-prone. Violations mean fines, out-of-service orders, and CSA score damage.

### 1.2 The product
**HAULR** is a single-page web app where a driver (or dispatcher) enters exactly four inputs:

- **Current location** · **Pickup location** · **Dropoff location** · **Current cycle used (hours)**

…and instantly receives:

1. **An interactive route map** — full path plus pinned stops (rests, 30-min breaks, fuel, pickup, dropoff), each annotated with arrival time and duration.
2. **Auto-drawn Driver's Daily Log sheets** — one per calendar day, a faithful filled-in replica of the paper log grid (Off Duty / Sleeper Berth / Driving / On Duty rows, remarks, recap totals), downloadable as PDF.
3. **An AI copilot ("Rig")** — answers *any* question about the app or the FMCSA HOS guide via RAG with citations, and can *drive the app itself* through tool calls: describe a trip in plain English and it plans the route, renders the map, and generates the logs.

### 1.3 Assessment assumptions (baked into the engine)
- Property-carrying driver, **70 hr / 8 day** cycle, no adverse driving conditions.
- **Fueling at least once every 1,000 miles** (30 min On Duty, Not Driving).
- **1 hour** On Duty (Not Driving) for pickup and **1 hour** for drop-off.
- 10 consecutive hours off duty resets the 11/14-hour clocks; **34-hour restart** inserted (and flagged) when the 70-hour cycle would otherwise block the trip.
- Speed: OSRM's real duration estimate, sanity-capped by a configurable average (default 55 mph effective).

---

## 2. Theme & Creative Direction — **Spotter.ai design language**

### 2.1 Concept: **"Night Haul — Spotter Edition"**
The visual identity follows **spotter.ai**: pure-black, high-contrast, AI-native trucking — black canvas, crisp white typography, one vivid **Spotter green** accent reading as live telemetry. Cinematic night-driving energy: dashboard glow, radar sweep, satellite tracking. The reviewer's takeaway should be: *this looks like a product Spotter could ship.*

### 2.2 Color system (Spotter.ai-derived)

| Token | Value | Usage |
|---|---|---|
| `--black` | `#000000` | Page background — confirmed from spotter.ai's `theme-color` meta |
| `--panel` | `#0A0A0A` → `#111214` | Cards, chat surface, elevated panels; 1px `#1F2430` hairline borders |
| `--spotter-green` | `#22C55E` *(provisional — see note)* | Primary accent: CTAs, route polyline, active log line, gauges, focus rings |
| `--green-glow` | `rgba(34,197,94,.25)` | Glows, hover halos, route pulse, chart fills |
| `--white` | `#FFFFFF` | Headlines, primary text |
| `--gray` | `#9CA3AF` | Secondary text, grid ticks, placeholders |
| `--danger` | `#EF4444` | Violations, "out of hours," errors |
| `--warn` | `#F59E0B` | 34-hr-restart flags, "cycle nearly exhausted" |

> **⚠ Day-1 build step:** spotter.ai doesn't expose its accent hex in crawlable markup — eyedrop the exact green from the live site/logo (DevTools or og-image), validate AA contrast on black with **ui-ux-pro-max**, then lock the token. `#22C55E` is a safe stand-in until then.

### 2.3 Typography & motifs
- **Type:** `Inter` (or `Geist`) for UI, 700–800 tight-tracked display headlines; `JetBrains Mono` for timestamps, odometer readings, coordinates, log-grid numerals. All free.
- **Motifs:** radar/telemetry scanline loaders; stop pins pulsing like live GPS fixes; dashed lane-marker dividers animating on scroll; odometer flip counters; green-on-black dashboard dial gauges for the four HOS limits; hairline black cards with soft green hover glow; 3–4% dot-matrix background texture; film grain on the hero only.
- **Dark-only** (matches Spotter). Log-sheet SVGs render paper-white *inside* their black card so they read as real documents.
- **Motion:** heavy-vehicle easing — 400–600 ms, `cubic-bezier(0.22,1,0.36,1)`, no bounce; green may pulse, nothing wiggles.

### 2.4 Accessibility
WCAG AA contrast (verify the sampled green); `prefers-reduced-motion` → static hero poster, pulses off; full keyboard nav; ARIA live region announces plan completion.

---

## 3. Signature Feature: Scroll-Driven Truck Video (Hero)

### 3.1 Experience
The landing hero is scrollytelling: a cinematic night-drive video of a semi-truck, **scrubbed by scroll** — down rolls it forward, up reverses. Pinned copy swaps beside it:

1. **0–25 %** — Depot at dusk, headlights flick on. *"Enter four inputs."*
2. **25–50 %** — Merging onto the night interstate. *"Get a fully compliant route."* A green telemetry route-line draws in sync.
3. **50–75 %** — Passing a lit fuel station; a green fuel pin drops with a GPS pulse. *"Fuel, breaks, and resets — placed automatically."*
4. **75–100 %** — Dawn arrival at a distribution dock. *"And every log sheet, already drawn."* Final frame cross-fades into a generated log sheet; the Dispatch Panel slides up.

### 3.2 Implementation — **owned by the `video-to-website` skill**
Same pipeline as the portfolio: Veo clip → **frame sequence** (~200 WebP frames via ffmpeg, 40–60 KB each) → `<canvas>` frame scrubbing (smoother cross-browser than seeking `video.currentTime`); **GSAP ScrollTrigger** (free core) pin/scrub + section choreography; **Lenis** smooth scroll; progressive preloading (first 30 frames eager, rest via `requestIdleCallback`); instant poster; 720p set for mobile; static poster under `prefers-reduced-motion`. Frames ship as static assets on Vercel's CDN.

### 3.3 Google Veo prompt (copy-paste ready)

> **Prompt:**
> "A single continuous cinematic tracking shot, side profile view, of a modern black semi-truck with a trailer driving left-to-right at constant speed. The shot begins at a freight depot at dusk with cool white floodlights, the truck's headlights turning on; the background then smoothly transitions to a dark night-time interstate highway with subtle green-tinted telemetry-style lighting, light fog, and passing reflective road signs; the truck then passes a brightly lit truck-stop fuel station with green neon signage; finally the background transitions to a soft dawn as the truck approaches a distribution warehouse dock. The truck stays perfectly centered and level in frame the entire time at the same scale — only the environment changes behind it, like a seamless parallax diorama. Consistent camera height, no camera shake, no cuts, no zoom. Moody cinematic color grade: pure black shadows (#000000), crisp white highlights, and vivid green accent lights (#22C55E) on signage and reflections — a high-tech satellite-tracking aesthetic. Photorealistic, 24fps, smooth constant motion suitable for frame-by-frame scroll scrubbing. No text, no logos, no people, no other vehicles in the foreground."
>
> **Negative prompt:** camera cuts, scene jumps, zoom, shaky cam, heavy motion blur, text overlays, watermarks, brand logos, warm orange/amber color grade, daytime brightness in the middle sections, lens flares covering the truck.

*(Generate 2–3 clips — depot→highway, highway→fuel stop, fuel→dawn dock — with the identical truck description; stitch in ffmpeg. The fixed side profile makes seams invisible; video-to-website extracts frames from the stitched master.)*

---

## 4. Core Functionality

### 4.1 Trip input form ("Dispatch Panel")
Four fields — **Current location**, **Pickup**, **Dropoff** (typeahead via free geocoding, §7), **Current cycle used (hrs)** as a dashboard-dial slider (0–70, 0.25 h steps) with a live green "hours remaining" readout. Advanced drawer: start time (default now, home-terminal TZ), average-speed override. Validation: cycle ≤ 70, locations must geocode, pickup ≠ dropoff; inline `--danger` errors. Green CTA **"Plan My Haul"** with a truck-rolls-across micro-interaction while loading.

### 4.2 HOS Trip Engine (the heart of the assessment)
A deterministic, exhaustively unit-tested simulator emitting a **duty-status timeline**. Lives as a **pure Python package** (`backend/hos_engine/`, zero Django imports) so it runs identically in serverless requests and pytest.

**Inputs:** route legs (distance + duration from OSRM: current→pickup, pickup→dropoff), cycle hours used, start timestamp.

**Algorithm (event-driven simulation):**
1. Init clocks: `drive_today` (max 11), `window_14` (14 h since shift start), `since_break` (max 8 driving h), `cycle_used` (max 70), `miles_since_fuel`.
2. Consume route distance in segments; before each, compute the *binding constraint* = min remaining of {11-hr drive, 14-hr window, 8-hr break trigger, 70-hr cycle, miles-to-fuel}.
3. On hitting a constraint, insert the event:
   - 8 cumulative driving hrs → **30-min break** (Off Duty).
   - 1,000 mi since fuel → **30-min fuel stop** (On Duty, Not Driving), positioned on the route polyline.
   - 11-hr or 14-hr limit → **10-hr rest** (Sleeper Berth); reset daily clocks.
   - 70-hr cycle exhausted → **34-hr restart** (`--warn` flag); reset cycle.
4. Insert **1-hr On Duty** at pickup and drop-off; 30-min pre-trip inspection On Duty at each day start (matches the guide's John Doe sample).
5. Interpolate every stop's position along the route geometry (pin sits *on the road*) and reverse-geocode for the Remarks entry ("Fuel — Barstow, CA").
6. Output: ordered `DutyEvent[] {status, start, end, location, lat/lng, note}` + per-day rollups + compliance report (all four limits: pass/fail + margins).

**Edge cases:** single-window trips; zero-distance current→pickup; cycle blocks departure immediately (engine schedules the restart first and says so); multi-week hauls; midnight-crossing blocks split across two sheets.

### 4.3 Route map
- Polyline in `--spotter-green` (soft glow) on **CARTO Dark Matter** tiles — free, and visually identical to Spotter's black world.
- Pins: 🏁 start, 📦 pickup, 🏭 dropoff, ⛽ fuel, ☕ break, 🛏 10-hr rest, 🔄 34-hr restart — pulsing like live GPS fixes; popups show arrival time, duration, running odometer, hours remaining after the stop.
- **"Drive the route" playback:** a green truck marker animates along the polyline while a timeline scrubber and the log grid highlight in sync — the log line literally draws as the truck moves. The demo-video money shot.
- Trip summary strip: total miles (odometer flip), days, driving hrs, on-duty hrs, stop counts.

### 4.4 ELD Daily Log sheets
- One **SVG** per calendar day replicating the uploaded blank paper log: header (date, total miles driving today, carrier, main office address, vehicle numbers), 24-hour four-row grid at 15-minute resolution, Remarks, shipping documents, 70-hr/8-day recap box.
- Duty line drawn per the FMCSA guide: horizontal segments on the correct status row, vertical connectors at each change; per-row **Total Hours** auto-summed at right (must equal 24 — asserted in tests).
- Remarks auto-populated with city/state at every duty change per §395.8.
- Active day's line animates in (SVG `stroke-dashoffset`) in green, settling to ink-blue for print fidelity.
- **Export:** "Download logs (PDF)" via `jsPDF` + `svg2pdf.js` client-side; the PDF also uploads to **Supabase Storage** so Rig can hand out a signed link. Spiral-notebook day-tab navigation.

### 4.5 Compliance dashboard
Green dial gauges for the four limits (scrubbable to any timeline point) + plain-English summary ("You'll arrive with 6.5 hrs left on your cycle — no restart needed."). Unavoidable violations (defensive) render in `--danger` with the governing CFR section cited.

---

## 5. AI Copilot — "Rig" (Gemini 2.5 + LangChain/LangGraph, Python)

### 5.1 What it does
A dockable chat panel (bottom-right → side sheet):
1. **RAG answers** over the FMCSA HOS Guide PDF + the app's own docs/FAQ — inline citation chips ("HOS Guide, p. 10 — 30-Minute Rest Break") with snippet-on-hover.
2. **Agentic app control:** "Plan me a run from Dallas to Chicago, pickup in Tulsa, 22 hours on my cycle" → the agent extracts parameters, calls the trip tool, and the *main UI* renders the map + logs while the chat streams a narrated summary. Chat is a full alternate front door to every feature.

### 5.2 Model strategy (paid key, cheapest current tier)
| Job | Model | Why |
|---|---|---|
| Router (intent classify) | **`gemini-2.5-flash-lite`** | Fractions of a cent; structured output is all it needs |
| Retrieval relevance grader | **`gemini-2.5-flash-lite`** | High-volume, low-difficulty |
| Main generation + tool calling | **`gemini-2.5-flash`** | Cheap, fast, strong function calling + streaming |
| Embeddings (ingest + query) | **`gemini-embedding-001`** with `output_dimensionality=768` | The *current* embedding model (`text-embedding-004` retired Jan 14 2026). 768 via MRL keeps quality high **and stays under pgvector's 2000-dim HNSW index limit** — never store the default 3072 dims |
| Config | Model names in env vars (`GEMINI_CHAT_MODEL`, etc.) | One-line upgrades when Google ships new versions |

Cost guardrails: `max_output_tokens` per turn, LangGraph recursion limit (max 6 tool hops), per-thread history truncation (last N messages + summary), and a daily token-budget counter in Postgres that soft-disables Rig with a friendly message if exceeded — your paid key can't be drained by a stranger.

### 5.3 Architecture (LangGraph Python inside Django)

```
                    ┌────────────────────┐
 user msg ──────────►  Router node       │  gemini-2.5-flash-lite, structured output
                    │  (intent classify) │
                    └───┬──────┬─────┬───┘
              rag_query │      │tool │ app-help / smalltalk
                        ▼      ▼     ▼
              ┌──────────┐ ┌────────────┐ ┌──────────┐
              │ Retriever│ │ Agent node │ │ Direct   │
              │ pgvector │ │ 2.5-flash  │ │ answer   │
              │ + FTS RRF│ │ (tool loop)│ └────┬─────┘
              └────┬─────┘ └─────┬──────┘      │
                   ▼             ▼             │
              ┌──────────┐ ┌────────────┐      │
              │ Grader → │ │ ToolNode:  │      │
              │ Generate │ │ plan_trip  │      │
              │ w/ cites │ │ geocode    │      │
              └────┬─────┘ │ get_logs   │      │
                   │       │ hos_calc   │      │
                   │       │ export_pdf │      │
                   │       └─────┬──────┘      │
                   └──────►┌─────▼──────┐◄─────┘
                           │ Respond +  │ streams tokens (SSE)
                           │ ui_actions │ emits RENDER_TRIP etc.
                           └────────────┘
```

- **Runtime:** LangGraph + `langchain-google-genai` (Python) inside a Django view returning **`StreamingHttpResponse` (SSE)** — supported by Vercel's Python runtime; set the function's `maxDuration` (§9) so streams aren't cut.
- **State/memory:** LangGraph **`PostgresSaver` checkpointer on Supabase Postgres** → threads survive serverless cold starts (in-memory checkpoints don't — critical detail).
- **Human-in-the-loop:** LangGraph `interrupt` before `plan_trip` executes → editable confirmation chip card ("Dallas, TX → Tulsa, OK → Chicago, IL · 22 hrs — Plan it?").

### 5.4 RAG pipeline (Supabase-native)
| Stage | Choice | Why |
|---|---|---|
| Parsing | `pypdf` + layout-aware chunking; Appendix-A exception **tables → markdown rows** (one exception per chunk) | Tables are where naive RAG dies |
| Chunking | ~800 tokens, 120 overlap, **section-header prefixed** ("What Are the HOS Limits? > 30-Minute Rest Break: …") | Header context boosts precision |
| Embeddings | `gemini-embedding-001` @ **768 dims** | Current model; pgvector-indexable |
| Vector store | **Supabase pgvector** (`vector(768)` column, HNSW index) via LangChain `SupabaseVectorStore` / raw `match_documents` RPC | Native to the backend; zero extra infra |
| Retrieval | Hybrid: pgvector top-8 + Postgres FTS (`tsvector`) top-8 → Reciprocal Rank Fusion → flash-lite relevance grade → top-4 | Regulation text is keyword-heavy ("§395.1(e)(1)") |
| Generation | Answer *only* from context; every claim tagged with chunk id → clickable citation chips | Trust + wow-factor |
| Fallback | Graded retrieval empty → say so honestly, offer the FMCSA link/hotline from the guide | No hallucinated regulations |

Ingestion: one-time `python manage.py ingest_docs` run locally against Supabase (PDF + app FAQ markdown, so "how do I export logs?" works too).

### 5.5 Tools exposed to the agent
```python
plan_trip(current, pickup, dropoff, cycle_used_hrs, start_time=None) -> TripPlanSummary  # ui_action: RENDER_TRIP
geocode(query) -> list[Place]                    # disambiguation ("Which Springfield?")
get_trip_logs(trip_id, day=None) -> LogSheetData # ui_action: SHOW_LOG_SHEET
hos_quick_calc(**params) -> str                  # "Driven 7.5 hrs — when's my break?"
export_logs_pdf(trip_id) -> signed_url           # Supabase Storage signed URL (short TTL)
get_compliance_report(trip_id) -> ComplianceReport
```
**UI-event channel:** the SSE stream interleaves `token` events with `ui_action` events (`RENDER_TRIP`, `FLY_TO_STOP`, `SHOW_LOG_SHEET`, `OFFER_DOWNLOAD`). A Zustand `uiActionBus` on the client listens and mutates the main interface — the chat *conducts* the app.

### 5.6 Personality
Seasoned dispatcher — warm, concise, light CB flavor ("Copy that. Route's on your screen — one 10-hour reset outside Amarillo."). Clarity first. Starter chips: *"What's the 14-hour rule?" · "Plan a trip for me" · "When do I need a 34-hour restart?"* Disclaimer footer: informational only, not legal advice.

---

## 6. Architecture & Tech Stack

### 6.1 System diagram
```
┌──────────────────────── VERCEL (only host — two projects, one repo) ───────────┐
│ Project A: frontend/  React 18 + Vite + TS (static CDN)                        │
│   Tailwind + shadcn/ui · GSAP ScrollTrigger + Lenis · react-leaflet            │
│   TanStack Query · Zustand uiActionBus · jsPDF + svg2pdf · hero frames         │
│                                                                                │
│ Project B: backend/   Django 5 + DRF on the Vercel Python runtime             │
│   /api/trips  → hos_engine (pure py) + OSRM + geocode cache                    │
│   /api/chat   → LangGraph (py) SSE → Gemini 2.5 Flash / Flash-Lite             │
│   /api/geocode → Photon/Nominatim proxy + Postgres cache                       │
│   django-ratelimit + DRF throttles (DB-backed) · CORS · security headers       │
└──────────────┬─────────────────────────────────────────────────────────────────┘
               ▼
┌──────────────────────── SUPABASE (backend services) ───────────────────────────┐
│ Postgres (via transaction pooler :6543 for serverless):                        │
│   trips, duty_events, log_sheets, chat_threads, rate_limits, token_budget,     │
│   geocode_cache, langgraph_checkpoints                                         │
│ pgvector: documents vector(768) + tsvector FTS (HNSW index)                    │
│ Storage: exported log PDFs (private bucket, short-TTL signed URLs)             │
│ RLS on all tables · service key server-side only                               │
└─────────────────────────────────────────────────────────────────────────────────┘
External (free/keyless or your paid key): OSRM demo · Photon/Nominatim · Gemini API
```

### 6.2 Service decisions (with fallbacks)
| Need | Primary | Fallback | Notes |
|---|---|---|---|
| Hosting | **Vercel Hobby** (both projects) | — (mandated) | Python runtime for Django; static for React |
| Backend services | **Supabase free** | — (mandated) | Postgres + pgvector + FTS + Storage + RLS |
| Map tiles | **CARTO Dark Matter** (Leaflet) | OpenFreeMap / OSM | Free black basemap = Spotter aesthetic |
| Map library | **Leaflet + react-leaflet** | MapLibre GL | Tiny, zero token |
| Routing | **OSRM public** (`router.project-osrm.org`) | OpenRouteService free key (2k/day) | No key; geometry+distance+duration |
| Geocoding | **Photon** (typeahead) + **Nominatim** (reverse) | LocationIQ free key | Debounced 400 ms; cached in Postgres |
| LLM / embeddings | **Gemini 2.5 Flash / Flash-Lite / gemini-embedding-001** (paid key) | model names env-configurable | §5.2 |
| Fonts/icons | Google Fonts (Inter/Geist, JetBrains Mono), Lucide | — | |
| Animation | GSAP core + ScrollTrigger (free), Lenis, Framer Motion | — | |
| Video gen | Google Veo (AI Studio) | Runway free credits | One-time asset |
| PDF export | jsPDF + svg2pdf.js (client) → Supabase Storage | server-side WeasyPrint (heavier) | Keeps functions light |
| CAPTCHA | **Cloudflare Turnstile** (free) | hCaptcha free | Chat abuse gate (§8) |
| CI | GitHub Actions | — | Tests on push; Vercel previews per PR |

### 6.3 Backend design (Django on serverless — the rules)
- **Apps:** `trips` (Trip, RouteLeg, DutyEvent, LogSheet), `assistant` (ChatThread, checkpoints, TokenBudget), `docs` (ingestion), `core` (throttling, caching).
- **`hos_engine/` is pure Python** — deterministic in/out, framework-free. **pytest** crown jewel: reproduce the guide's John Doe sample day (pp. 18–19) and assert the grid totals 10 / 1.75 / 7.75 / 4.5 = 24; plus 8-hr break insertion, 1,000-mi fuel spacing, midnight splits, 70-hr exhaustion → restart, recap math, and the **"totals = 24" invariant** on every sheet.
- **Serverless discipline:** no Celery/Channels/WebSockets — request/response + SSE only; `CONN_MAX_AGE=0` and **Supabase transaction pooler (port 6543)** because serverless can't hold connections; no filesystem writes (Storage instead); no in-memory caches for anything that must survive between invocations (DB-backed instead).
- **Endpoints:** `POST /api/trips/` · `GET /api/trips/{id}/` · `GET /api/trips/{id}/logs/` · `GET /api/geocode/` · `POST /api/chat/` (SSE) · `GET /api/health/`.
- **Etiquette & resilience:** Postgres-cached geocode/OSRM responses (respects Nominatim's 1 req/s policy, survives demo-day load); timeouts + one retry + graceful fallback messages on every external call.

### 6.4 Frontend structure
```
frontend/src
  /features/hero        FrameScrubCanvas, PinnedCopy        ← video-to-website skill
  /features/dispatch    TripForm, CycleDial
  /features/map         RouteMap, StopPin, TruckPlayback, TimelineScrubber
  /features/logs        LogSheetSVG, DayTabs, RecapBox, PdfExport
  /features/rig         ChatDock, MessageStream, CitationChip, ConfirmTripCard, Turnstile
  /features/compliance  GaugeDial, ComplianceSummary
  /lib                  sse.ts, api.ts, uiActionBus.ts
```

---

## 7. UX Flow (page anatomy)
1. **Hero** — scroll-scrubbed truck video (§3), resolving into…
2. **Dispatch Panel** — four-input form; sticky green cycle dial.
3. **Results stage** — map left, log sheets right (stacked on mobile); summary strip above, gauges below.
4. **Playback** — truck marker + timeline + log-line drawing in sync.
5. **Rig** — floating dock everywhere; never hides results (side sheet desktop, bottom sheet mobile).
6. **Footer** — dashed lane divider, FMCSA link, disclaimer.

Themed loading: green scanline skeleton map; empty paper-grid log skeleton; radar shimmer while Rig streams.

---

## 8. Security & Abuse Prevention (chatbot-hardened)

Because Rig burns *your paid Gemini key* on a public URL, security is a first-class feature, not a checklist.

### 8.1 Rate limiting (layered, serverless-safe)
All counters live in **Postgres** (a `rate_limits` table or DB-backed Django cache) — in-memory limiters silently fail on serverless because each invocation is a fresh process.

| Layer | Limit (tune as needed) | Mechanism |
|---|---|---|
| Global chat | 60 req/min across all users | DRF `AnonRateThrottle` (DB cache) |
| Per-visitor chat | 10 messages/min, 100/day | `django-ratelimit` keyed on IP + signed anonymous session cookie |
| Per-visitor trips | 10 plans/hour | same |
| Geocode proxy | 30 req/min/visitor + server cache | protects Nominatim etiquette too |
| Per-thread | max 40 messages, 2,000 chars/message | request validation (DRF serializer) |
| Token budget | daily Gemini token ceiling in `token_budget` | Rig soft-disables with a friendly "back tomorrow, driver" when hit |
| Bot gate | **Cloudflare Turnstile** (free, invisible) verified server-side before the first chat message of a session | stops scripted key-draining |
| 429 UX | Friendly themed message + `Retry-After` header | never a raw error |

### 8.2 LLM-specific hardening
- **Prompt-injection defenses:** retrieved RAG chunks and any user-derived text are wrapped in delimited data blocks with an explicit "content, not instructions" system rule; the system prompt is server-side only and never echoed; Rig is scoped to trucking/HOS/app topics with polite deflection.
- **Tool safety:** every tool argument validated with Pydantic (geocodable strings, 0 ≤ cycle ≤ 70, known trip ids scoped to the caller's session); tools are read/plan-only — no tool can touch secrets, other sessions' data, or arbitrary URLs; LangGraph recursion limit caps tool loops at 6.
- **Output safety:** Gemini safety settings on; responses capped by `max_output_tokens`; citations only from retrieved chunks (no fabricated sources by construction).
- **Session isolation:** anonymous session id (signed, httpOnly cookie) partitions threads, trips, and checkpoints; RLS mirrors the same rule at the DB layer.

### 8.3 Platform hardening
- **Secrets:** `GEMINI_API_KEY`, `DATABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `DJANGO_SECRET_KEY` only in Vercel env vars (server project); the frontend receives **zero** secrets — only `VITE_API_URL` and the Turnstile *site* key (public by design).
- **Django:** `DEBUG=False`, strict `ALLOWED_HOSTS`, `SECURE_*` headers (HSTS, nosniff, referrer-policy), CSRF trusted origins set to the frontend domain, `django-cors-headers` locked to the exact frontend origin (no `*`).
- **Supabase:** RLS **enabled on every table**; anon key unused server paths; Storage bucket private with short-TTL signed URLs; pooler connection string only.
- **Dependencies:** `pip-audit`/`npm audit` in CI; pinned requirements.
- **Privacy:** no accounts required; IPs stored only as salted hashes in `rate_limits`; auto-purge threads/trips older than 30 days (cron via GitHub Actions hitting a guarded endpoint, since serverless has no scheduler).

---

## 9. Deployment Guide — Django + React on Vercel (step by step)

> Monorepo, **two Vercel projects** (cleanest way to host a Python API and a static SPA side-by-side on the free tier).

### Step 0 — Repo layout
```
haulr/
├── frontend/            # React + Vite + TS
├── backend/             # Django project (manage.py at backend/)
│   ├── api/wsgi.py      # Vercel entrypoint (see Step 3)
│   ├── haulr/settings.py
│   ├── hos_engine/
│   ├── requirements.txt
│   └── vercel.json
├── CLAUDE.md
└── workspace/
```

### Step 1 — Supabase project
1. Create a project at supabase.com → note the **project ref**, **DB password**, **service role key**.
2. SQL editor → `create extension if not exists vector;`
3. Grab the **Transaction pooler** connection string (port **6543**, `pgbouncer=true`) from Connect → this is your serverless `DATABASE_URL`. *(Direct :5432 is only for local migrations.)*
4. Create a **private** Storage bucket `log-pdfs`.
5. After first migration, enable **RLS** on all app tables and add policies (service role bypasses RLS; policies are your defense-in-depth).

### Step 2 — Django settings for serverless
```python
# settings.py (key excerpts)
import dj_database_url, os
DEBUG = os.environ.get("DEBUG", "False") == "True"
ALLOWED_HOSTS = os.environ.get("ALLOWED_HOSTS", ".vercel.app").split(",")
DATABASES = {"default": dj_database_url.config(conn_max_age=0)}  # pooler URL; no persistent conns
DATABASES["default"]["OPTIONS"] = {"sslmode": "require"}
DATABASES["default"]["DISABLE_SERVER_SIDE_CURSORS"] = True        # required behind pgbouncer
CACHES = {"default": {"BACKEND": "django.core.cache.backends.db.DatabaseCache",
                      "LOCATION": "django_cache"}}                # DB cache → throttles work on serverless
CORS_ALLOWED_ORIGINS = [os.environ["FRONTEND_ORIGIN"]]
CSRF_TRUSTED_ORIGINS = [os.environ["FRONTEND_ORIGIN"]]
SECURE_HSTS_SECONDS = 31536000; SECURE_CONTENT_TYPE_NOSNIFF = True
STATIC_ROOT = BASE_DIR / "staticfiles"   # WhiteNoise serves DRF/browsable assets if needed
```
Run `python manage.py createcachetable` in your migration step.

### Step 3 — Vercel entrypoint + config
```python
# backend/api/wsgi.py
import os
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "haulr.settings")
from django.core.wsgi import get_wsgi_application
app = get_wsgi_application()   # Vercel's Python runtime picks up `app`
```
```json
// backend/vercel.json
{
  "builds": [{ "src": "api/wsgi.py", "use": "@vercel/python",
               "config": { "maxLambdaSize": "15mb" } }],
  "routes": [{ "src": "/(.*)", "dest": "api/wsgi.py" }],
  "functions": { "api/wsgi.py": { "maxDuration": 60 } }
}
```
`maxDuration: 60` keeps SSE chat streams alive on Hobby. Keep `requirements.txt` lean (django, djangorestframework, dj-database-url, psycopg[binary], django-cors-headers, django-ratelimit, whitenoise, langchain, langgraph, langchain-google-genai, langgraph-checkpoint-postgres, pypdf, httpx, supabase) — **no torch/chromadb/sentence-transformers**, or you'll blow the 250 MB unzipped function limit.

### Step 4 — Deploy the backend (Vercel Project B)
1. Push the repo to GitHub → Vercel → **Add New Project** → import repo → **Root Directory = `backend/`** → Framework preset: *Other*.
2. Env vars (Production + Preview): `DJANGO_SECRET_KEY`, `DATABASE_URL` (pooler :6543), `GEMINI_API_KEY`, `GEMINI_CHAT_MODEL=gemini-2.5-flash`, `GEMINI_LITE_MODEL=gemini-2.5-flash-lite`, `GEMINI_EMBED_MODEL=gemini-embedding-001`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `TURNSTILE_SECRET_KEY`, `FRONTEND_ORIGIN` (fill after Step 6), `ALLOWED_HOSTS=<backend>.vercel.app`.
3. Deploy → note the backend URL, e.g. `https://haulr-api.vercel.app`.
4. **Migrations run from your machine** (serverless doesn't run them): temporarily export the **direct** :5432 URL locally → `python manage.py migrate && python manage.py createcachetable`.
5. **Ingest RAG docs** locally: `python manage.py ingest_docs ./docs/fmcsa-hos-guide.pdf ./docs/app-faq.md` (embeds with `gemini-embedding-001@768` into pgvector).
6. Smoke test: `curl https://haulr-api.vercel.app/api/health/`.

### Step 5 — Deploy the frontend (Vercel Project A)
1. Vercel → **Add New Project** → same repo → **Root Directory = `frontend/`** → preset: *Vite* (build `npm run build`, output `dist`).
2. Env vars: `VITE_API_URL=https://haulr-api.vercel.app`, `VITE_TURNSTILE_SITE_KEY`.
3. Add a `frontend/vercel.json` SPA rewrite: `{ "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }] }`.
4. Deploy → e.g. `https://haulr.vercel.app`.

### Step 6 — Wire them together
1. Backend project → set `FRONTEND_ORIGIN=https://haulr.vercel.app` and redeploy (locks CORS + CSRF).
2. Verify: plan a trip from the live frontend; open Rig and confirm SSE tokens stream; download a PDF (signed URL from Storage).
3. **Warm-up + previews:** first hit after idle cold-starts 1–3 s — hit `/api/health/` before recording the Loom. Vercel PR previews work for both projects automatically.
4. **Cron purge:** GitHub Actions workflow (free) curls the guarded `/api/internal/purge/` daily (header token) — replaces the scheduler serverless doesn't have.

### Step 7 — Pre-submission checklist
`DEBUG=False` ✓ · CORS locked ✓ · Turnstile verifying ✓ · rate limits return themed 429 ✓ · RLS enabled ✓ · `pip-audit`/`npm audit` clean ✓ · pytest suite green in CI ✓ · Lighthouse ≥ 90 ✓ · Loom recorded on a warmed deployment ✓.

---

## 10. Non-Functional Requirements
- **Performance:** poster-frame LCP < 2.5 s; route + logs < 4 s for a 2,000-mi trip (OSRM ~600 ms, engine < 50 ms, geocode cached); Lighthouse ≥ 90 perf & a11y.
- **Serverless correctness:** zero in-memory state between requests — trips, threads, checkpoints, throttle counters, token budgets all in Supabase; SSE closes cleanly inside `maxDuration`.
- **Testing:** pytest on `hos_engine` (the grading centerpiece) + Vitest/RTL on `LogSheetSVG`; one Playwright happy path (form → map → logs → chat-planned trip). **impeccable** gates every feature (§11).
- **Deliverables:** two live Vercel URLs + ≤5-min Loom: form → map → logs → *then the same trip planned purely by chatting with Rig*.

---

## 11. Build Workflow & Claude Code Skills (same setup as the portfolio)

Reuses the portfolio's memory + skills workflow: **lean root `CLAUDE.md`** (< 200 lines, `@path` imports) + a **`workspace/`** folder.

```
haulr/
├── CLAUDE.md              # lean contract; @imports workspace docs; skills mapping
└── workspace/
    ├── project-spec.md    # this PRD — source of truth
    ├── design.md          # Spotter palette (sampled green hex), type, motion specs
    ├── decisions.md       # ADR log ("Leaflet over MapLibre because…")
    ├── progress.md        # done / in-progress / next — session continuity
    └── skills.md          # mapping below + skills created during build
```
CLAUDE.md must instruct Claude Code to keep `progress.md`, `decisions.md`, and the skills section updated as things change — same maintenance protocol as the portfolio.

### Skills mapping (record in `workspace/skills.md`; ALWAYS prefer skills over ad-hoc work)
| Skill | Owns in HAULR |
|---|---|
| **ui-ux-pro-max** | Design-system decisions: validating the sampled Spotter green + AA contrast on black, font pairing, component/UX patterns, gauge & chart choices, layout reviews of Dispatch Panel / results / chat dock. Runs during `design.md` authoring and every UI review. |
| **frontend-design** | Producing the production-grade components — hero, cards, gauges, log-sheet frame, chat dock — distinctive polish matching spotter.ai, zero generic-AI aesthetic. |
| **video-to-website** | The entire §3 scroll hero: Veo clip → frame extraction → canvas scrub → GSAP ScrollTrigger pin/scrub choreography → Lenis. This skill owns the timings. |
| **impeccable** | Quality/correctness gate before any feature is "done" — especially `hos_engine`, the SVG renderer, and the security middleware. |
| **find-skills** | Before hand-rolling any capability (SVG-to-PDF, SSE client, Turnstile verify, Supabase helpers), check whether a skill already exists. |
| **skill-creator** | Scaffold recurring capabilities. **Planned candidate: `eld-log-svg`** — takes a day's `DutyEvent[]`, returns the finished log-sheet SVG; grid geometry, tick math, and line rules encoded once, reused by the app, the PDF exporter, and playback (same pattern as the portfolio's `tech-logos` skill). |

### Kickoff protocol
Claude Code in **plan mode**: Phase 0 — read this PRD + inventory skills; Phase 1 — scaffold CLAUDE.md + workspace; Phase 2 — wire the skills mapping; Phase 3 — **STOP for approval before application code**. Then build section-by-section, running impeccable and updating `progress.md` after each.

---

## 12. Milestones (suggested 5-day build)
| Day | Deliverable |
|---|---|
| 1 | CLAUDE.md/workspace setup, Django + React scaffold, Supabase schema + RLS + pooler wiring, OSRM/Photon integration, **hos_engine core + pytest suite**, Spotter green sampled & locked |
| 2 | Trip API, route map with pulsing pins, trip summary strip |
| 3 | Log-sheet SVG renderer + PDF export to Storage, compliance gauges, playback sync |
| 4 | RAG ingestion → pgvector, LangGraph agent + tools + SSE chat + ui_actions, **security layer (throttles, Turnstile, token budget)** |
| 5 | Spotter polish pass (ui-ux-pro-max), Veo video + scroll hero (video-to-website), impeccable gate, **deploy per §9**, Loom, README |

## 13. Success criteria
1. Any (current, pickup, dropoff, cycle) input yields a route + logs with **zero HOS violations**, honoring all four assessment assumptions.
2. Log sheets match the official paper grid and always total 24 hrs/day.
3. Rig answers arbitrary HOS-guide questions **with citations** and completes an entire trip plan via chat alone.
4. A stranger with a script cannot drain the Gemini key: Turnstile + layered rate limits + token budget all verifiably enforce.
5. Runs on two Vercel free projects + one Supabase free project; only metered cost is Gemini API pennies.
6. Side-by-side with spotter.ai it looks like a sibling product — black, white, one vivid green, zero generic-AI aesthetic.

---

## Appendix A — HOS rules the engine enforces (traceability)
| Rule | Source (FMCSA Guide) | Engine behavior |
|---|---|---|
| 11-hr driving limit | §395.3(a)(3), p.6 | Rest inserted before `drive_today` exceeds 11 |
| 14-hr window | §395.3(a)(2), p.6 | No driving scheduled past window; on-duty may continue |
| 30-min break after 8 hrs driving | §395.3(a)(3)(ii), p.10 | Off-duty 30-min block; cumulative, not consecutive |
| 70-hr/8-day rolling total | §395.3(b), pp.10–11 | Rolling window; oldest day drops off |
| 34-hr restart | §395.3(c), p.11 | Inserted with `--warn` flag when cycle blocks trip |
| 10-hr reset | §395.3(a)(1) | Sleeper Berth block resets 11/14 clocks |
| Log grid + remarks + recap | §395.8, pp.15–19 | SVG renderer + auto remarks per duty change |
| Fuel every 1,000 mi / 1-hr pickup & drop | Assessment spec | On-Duty (Not Driving) events |
