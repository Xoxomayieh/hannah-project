# HAULR Decisions Log

## Original stack decisions
- **Stack**: Django (backend) + React (frontend) on Vercel.
- **Database**: Supabase (Postgres, pgvector, Storage) — *not yet wired; still SQLite in dev*.
- **AI**: Gemini 2.5 Flash (agent), 2.5 Flash-Lite (routing), `gemini-embedding-001@768` (RAG).
- **Map**: Leaflet + React-Leaflet with CARTO Dark Matter tiles.
- **Routing**: OSRM public for distance/duration.

## Session 2026-07-06 — frontend rebuild (Phase 1)
- **Priority**: rebuild the **frontend experience first** (most visible; builds on the working engine),
  before AI/Supabase. (User decision.)
- **Live services**: authorized to use the real Supabase + Gemini creds in `.env`. (User decision.)
- **Green token**: locked provisional `#22C55E` — measured **9:1 contrast on #000000** (passes AA+AAA).
  PRD still wants the exact Spotter green eyedropped later; change in one place if so.
- **Hero frames over `<video>`**: canvas frame-scrubbing (per video-to-website skill) — precise scroll
  scrubbing that `<video currentTime>` can't match. 180 frames chosen (8s clip × 22.5fps), 4.9 MB total.
- **ffmpeg-static (npm)** instead of system ffmpeg (not installed) — self-contained, reproducible
  extraction via `frontend/scripts/extract-frames.mjs`.
- **Fonts**: Inter (UI) + JetBrains Mono (data) via Google Fonts `<link>` — free, matches PRD §2.3.
- **Smooth scroll**: single global Lenis instance wired to the GSAP ticker (`src/lib/scroll.ts`) so hero
  scrub maps 1:1 to scroll; disabled under `prefers-reduced-motion`.
- **TS config**: removed deprecated `baseUrl` (TS 6.0), added missing `jsx: react-jsx`. Keep `@/`→`src`
  alias mirrored in `vite.config.ts` + `tsconfig.json`.
- **Results**: kept a client-side `summarize()` for now; will move totals/compliance to the engine (T1)
  as the source of truth.

## Session 2026-07-06 — T1: Harden HOS engine
- **Engine output**: `generate_plan()` now returns `TripPlan` dataclass (was `List[DutyEvent]`).
  Breaking change but only consumed by `views.py` (updated simultaneously).
- **Geocoder injection**: reverse-geocode passed as `Callable[[float,float],str]` to keep engine pure
  Python. Actual Nominatim HTTP lives in `core/services.py`. LRU cache with 0.01° rounding (~1.1km)
  groups nearby coordinates into one API call. 1 req/s rate limit per Nominatim usage policy.
- **Midnight split approach**: events split at midnight boundaries, then day boundaries padded with
  Off Duty to guarantee totals=24 invariant. Padding events are clearly labeled ("prior to trip start"
  / "remainder of day") so downstream consumers can distinguish them.
- **Compliance clocks**: report reflects state at trip end (not worst-case during trip). Each of
  the 4 checks includes the CFR section reference for the log sheet.
- **John Doe builder**: `build_john_doe_day()` is a standalone convenience function that manually
  constructs the FMCSA sample day with exact durations. Totals: 10/1.75/7.75/4.5 = 24.0.
- **Trip persistence**: `PlanTripView` now saves Trip model and returns `trip_id`. Still on SQLite
  (Supabase migration deferred to T5). Trip model was already defined; just calling `.create()`.
- **Polyline interpolation**: haversine-based cumulative distance along GeoJSON coordinates.
  Position advances mid-leg as driving miles are consumed. Non-driving events inherit the current
  position (where the truck stopped).
- **Test suite**: expanded from 5 to 36 tests across 11 test classes. Key invariants tested
  on every generated day for varying trip lengths.

## Session 2026-07-06 — T6: AI Copilot ("Rig") & Chatbot Functionality
- **No langchain-community**: Bypassed `langchain-community` package dependency to keep the Vercel serverless functions bundle size light (under the 250MB limit) and reduce cold-start latency. Written custom lightweight `search_documents` function in `rag.py` using `psycopg` to query Supabase Postgres directly.
- **Direct pgvector SQL**: Used direct SQL similarity search (`1 - (embedding <=> %s::vector)`) instead of invoking the PL/pgSQL `match_documents` function to resolve an ambiguous column reference error (`id`) in PL/pgSQL on Supabase.
- **Hybrid Retrieval (RRF)**: Implemented hybrid retrieval ranking combining vector cosine similarity with Postgres Full-Text Search (`tsvector` over text content). Ranks are combined using Reciprocal Rank Fusion (RRF) with a standard constant $k=60$.
- **Model selection**: Configured `gemini-2.5-flash` for main chat generation and tool calling (cheap, supports streaming and structured tool outputs), and `gemini-2.5-flash-lite` for routing and grading (fast, structured classifications).
- **Checkpointer**: Wired LangGraph checkpointer saver to Postgres using `PostgresSaver.from_conn_string` to ensure thread context is persisted serverless-side in Supabase across cold starts.
- **Human-in-the-Loop Interrupt**: Implemented NodeInterrupt in LangGraph before executing the `plan_trip` tool. When requested, the assistant pauses execution, streams a `ConfirmTripCard` to the UI, and resumes execution only when the user confirms parameters.
- **Zustand Action Bus**: Implemented a global Zustand store `useUIActionBus` to map events (`RENDER_TRIP`, `SHOW_LOG_SHEET`, `OFFER_DOWNLOAD`, `CONFIRM_TRIP`) from the Server-Sent Events (SSE) view into page transitions and component reactions.
- **SSE Client-Side Parser**: Created a pure JS readable stream reader in `chatService.ts` to consume SSE chunk by chunk. This supports HTTP POST payloads (for thread ID and message body) which standard `EventSource` cannot do.
- **Captcha and Token Budgets**: Implemented DB-backed (Django cache) visitor rate limits (10 req/min, 100 req/day) and a global daily token budget cap (500,000 tokens) to secure the paid Gemini API key against exhaustion/bot abuse. Cloudflare Turnstile token validation added to the Django view.

## Session 2026-07-06 — Viewport-locked scrollytelling rebuild (per implementation_plan.md)
- **Fundamental UX change (user directive)**: the app is no longer a stacked vertical-scroll
  document. It is now a **viewport-locked state machine** over ONE permanent fixed background
  canvas. Overlay content is *replaced in place* — never scrolled past into new sections.
  - `intro` phase: scrolling scrubs frames `0 → PLAN_FRAME (~90)` while the hero headline
    cross-fades into the centered Dispatch form. A single `200svh` **scroll runway** div
    provides exactly one viewport of scroll to drive this; the visuals are all `position: fixed`.
  - `Plan My Haul`: **awaits the API first**, then plays frames `90 → 179` forward (gsap, ~1.7s)
    while the form dissolves into the results — results are guaranteed loaded before the video moves.
  - `results` phase: locked full-screen dashboard overlay; **scroll-up-at-top / swipe-down / Edit**
    reverses the video `179 → 90` back to the form (and one more scroll-up → hero).
- **New orchestrator** `features/stage/ViewportStage.tsx` owns canvas + preload + scroll scrub +
  state machine + all three overlays. `App.tsx` is now thin (LoadingScreen + ViewportStage + ChatDock).
  Old `features/hero/FrameScrubHero.tsx` **deleted** (fully superseded).
- **User-decided design choices**: single hero → form (dropped the old 4 story beats);
  centered form only (no marketing copy column); locked results overlay + internal scroll;
  Rig chat dock visible in all phases.
- **GOTCHA — scrub smoothness**: `ScrollTrigger scrub: true` (raw 1:1) stutters. Use `scrub: 1`
  (rAF-smoothed) per the video-to-website guide. Also eager-preload the *entire* scrubbed range
  (`PLAN_FRAME + 2` frames), not just 30, or fast scrolls hitch on undecoded frames.
- **GOTCHA — Lenis eats wheel events**: Lenis hijacks `wheel` at the window level and
  `preventDefault`s it, so a nested `overflow-y-auto` panel only scrolls via the scrollbar drag.
  Fix: put `data-lenis-prevent` on any nested scroll container (the results scroll area + the
  timeline `<ol>`). Lenis then skips those subtrees and native scroll works.
- **Results dashboard fit-to-viewport**: `ResultsStage` gained a `fit` prop. In `fit` mode it is a
  flex column (`lg:h-full`) — header/stats/ribbon are `shrink-0`, the map+timeline grid is
  `lg:flex-1 lg:min-h-0`, and only the timeline `<ol>` scrolls internally. `RouteMap` lost its
  hardcoded `min-h-[400px]` (parent now dictates height). Non-fit mode keeps the natural
  scrolling layout for the reduced-motion fallback.
- **Reduced motion**: `ViewportStage` renders an accessible stacked flow (static poster frame +
  normal document scroll) instead of the locked stage — no scroll-hijack, all content visible.

### PIVOT — scroll is a TRIGGER, not a scrubber (user clarification)
- The video must NOT be glued 1:1 to scroll position. Instead a **single small gesture triggers a
  self-playing, slow, smooth playthrough to the next state**, running to completion on its own.
  "Even a little scroll → the background runs slowly until it reaches the next destination."
- `ViewportStage` is now a **3-state section machine** (`hero | plan | results`) with NO document
  scroll (body `overflow: hidden`) and NO ScrollTrigger/scrub/runway. Removed Lenis entirely
  (`App` no longer calls `useSmoothScroll`; `getLenis` now unused). `data-lenis-prevent` attrs are
  harmless leftovers.
- **Transitions** (all via one `playTransition(from→to)` gsap timeline that tweens a frame proxy +
  cross-fades overlays; frame anchors HERO=0, PLAN=90, LAST=179; durations ~2.2–2.4s `power2.inOut`):
  - hero → plan: wheel-down / swipe-up / ArrowDown|PageDown|Space
  - plan → hero: wheel-up / swipe-down / ArrowUp|PageUp
  - plan → results: "Plan My Haul" submit — awaits API, THEN plays 90→179
  - results → plan: wheel-up/swipe-down **at panel top**, or the Edit button
- **Gesture debounce**: `busyRef` blocks new gestures during a transition + 220ms cooldown so
  trackpad momentum can't fire multiple transitions. Keydown ignores INPUT/TEXTAREA so typing in
  the form isn't hijacked. plan+down and results+down are intentionally no-ops (fill form / scroll
  the results panel natively).
- Smoothness still uses the sub-frame blending draw + full-range decode-preload from the prior entry.
- Tuning dials: `HERO_PLAN_DUR` / `PLAN_RESULTS_DUR` (speed) at the top of `ViewportStage.tsx`.

## Session 2026-07-06 — SCOPE RESET + ELD log sheets (T3) built
- **Scope reality check (user)**: re-read the *actual* assessment (`tasks/new-full-stack-dev-assessment.docx`).
  It asks for only: Django+React app, 4 inputs, a route map, **filled-in ELD daily log sheets**, live
  URL + Loom + GitHub. Graded on *accuracy* + *UI/UX*. The PRD v3 (Rig AI, RAG, LangGraph, Turnstile,
  token budgets, scroll-video hero, 2-project serverless) is a ~10× over-scope. The #2 graded output
  — **the log sheets — did not exist** (only referenced in docs). This was the critical gap.
- **User directive this session**: build the log sheets; **keep Supabase + AI/RAG/LangGraph but
  simplify onto a plain Django API**; **cut the rest of the security/serverless machinery**; defer deploy.
- **ELD log sheets — DONE** (`frontend/src/features/logs/`):
  - `logSheet.ts` — pure geometry+data module. Groups events by **wall-clock day read literally from the
    ISO string** (regex, NOT `new Date()`) so the server's tz-based midnight-split/24h-tiling isn't
    shifted by the viewer's timezone. `endMin=1440` when an event ends at next-day 00:00. Builds the
    stair-step duty-line SVG path, remarks (one per duty change), recap totals. Shared by screen + PDF.
  - `LogSheetSVG.tsx` — faithful SVG replica of `blank-paper-log.png`: header (date/from/to/carrier/
    addresses/vehicle), 24h×4-row grid at 15-min resolution, drawn duty line + connectors, per-row
    Total Hours column, grand total (green when ==24), Remarks with angled labels at each change,
    Shipping Documents block, 70hr/8day Recap box. Paper-white; `color="green"` on screen / `"ink"` for print.
  - `LogSheets.tsx` — day tabs + active sheet + **PDF export** (jsPDF + svg2pdf.js, landscape A4, one
    page/day, exports a hidden ink render of every day). Wired into `ViewportStage` results (motion +
    reduced paths).
  - **Verification**: generated a real 2-day multi-leg plan from the HOS engine (no network) → every day
    tiles 00:00→24:00 and totals exactly 24h; SSR-rendered the real component with that data (all
    sections present, duty path non-empty) and screenshotted via headless Edge — sheets are correct and
    faithful (Day 1 hits 11h drive limit; Day 2 shows the sleeper-berth rest continuing across midnight).
  - `api.ts` types extended (`per_day`, `compliance`, `totals`, `duration_hours`/miles on events, `meta`).
## Session 2026-07-06 — Backend cut + simplify (Rig on plain Django)
- **User cut-list (confirmed):** remove **Turnstile**, the **daily token budget**, and the **layered
  throttles**; convert **SSE → plain JSON**. **Keep** a simple abuse guard, **LangGraph + its Postgres
  checkpointer + the human-in-the-loop trip confirm**, all on **Supabase Postgres via plain Django**.
- **`assistant/views.py` rewritten** to a plain `JsonResponse` endpoint (no `StreamingHttpResponse`):
  - Runs `graph.stream(..., stream_mode="updates")` to completion and **aggregates** into one JSON:
    `{reply, citations[], ui_actions[], needs_confirmation}`. `ui_actions` = RENDER_TRIP / SHOW_LOG_SHEET
    / OFFER_DOWNLOAD from successful tool messages; `needs_confirmation` set when the agent raises the
    `GraphInterrupt` (trip confirm). Confirm-resume path kept (`update_state(confirmed_trip=True)`).
  - **Simple rate limit**: `DAILY_CHAT_LIMIT` (default 10) messages **per visitor IP per day** via the
    default Django cache; themed 429. No token budget, no Turnstile, no per-minute layer.
  - Graceful `503` JSON when `DATABASE_URL`/checkpointer store is unreachable (no crash).
- **`rag.py` was already correct** — uses `models/gemini-embedding-001` @ `output_dimensionality=768`.
  The "retired embedding-001" note in older docs was stale; no change needed.
- **Frontend**: `chatService.ts` `streamChat`(SSE) → **`sendChat`** (plain `fetch` → `ChatResponse`).
  `ChatDock.tsx` consumes the single response (reply + citations + ui_actions + needs_confirmation),
  no token streaming. No Turnstile component existed to remove.
- **Settings**: already Supabase-ready — `settings.py` uses `DATABASE_URL` (Supabase Postgres) when
  present, SQLite fallback for local. Left plain (no serverless pooler config) per the simplify goal.
- **Verified**: `manage.py check` clean (all langgraph/supabase/langchain imports resolve, graph
  compiles at import); `npm run build` green; test-client smoke test of the view: 405 (GET), 400
  (empty), 503 (no DB), and the daily cap correctly returns 429. Full Gemini+Supabase chat path needs
  live keys + `ingest_docs` run — untestable from here but code path is straightforward.
- **Not done / deferred**: server-side PDF upload to Supabase Storage (client-side jsPDF export is the
  path now, so `export_logs_pdf` tool degrades gracefully); deploy.

