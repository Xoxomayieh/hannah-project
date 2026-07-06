# HAULR — RUNBOOK (how to run the system, step by step)

A complete, copy-paste guide to run HAULR locally on **Windows**. Written for the current state of
the repo (frontend rebuilt; backend = Django + working HOS engine on SQLite). No Supabase/AI required
to see the site and plan a trip.

- **What runs where:** Frontend (React/Vite) on **:5173**. Backend (Django API) on **:8000**.
- **The frontend calls the backend** for "Plan My Haul". If the backend is down, the hero + form still
  render, but planning errors.

---

## 0. Prerequisites (one-time)

You should already have these (this repo was built with them):

| Tool                   | Version used | Check                | If missing                                |
| ---------------------- | ------------ | -------------------- | ----------------------------------------- |
| Node.js                | 22.x         | `node --version`   | https://nodejs.org (LTS)                  |
| npm                    | 10.x         | `npm --version`    | ships with Node                           |
| Python                 | 3.13         | `python --version` | https://python.org — check "Add to PATH" |
| Git Bash*(optional)* | —           | —                   | Windows has PowerShell already            |

This repo already contains:

- `frontend/node_modules/` — JS deps installed.
- `.venv/` — a Python virtual env with backend deps.
- `frontend/public/frames/hero/frame-0001..0180.webp` — the hero frames (already extracted).

> Paths below assume the project root: `C:\Users\Hp\Desktop\projects\hannah-project`.
> Commands are shown for **PowerShell** (the default Windows terminal). You need **two terminals**:
> one for the backend, one for the frontend.

---

## 1. Get the credentials file in place (only needed for AI/Supabase later)

`backend/.env` already exists with real keys (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`,
`GEMINI_API_KEY`, `DATABASE_URL`). `frontend/.env` has `VITE_API_URL=http://127.0.0.1:8000`.
**Do nothing here for local dev.** Never commit these files.

---

## 2. TERMINAL 1 — start the backend (Django API)

```powershell
# 1. Go to the backend folder
cd C:\Users\Hp\Desktop\projects\hannah-project\backend

# 2. (First run only) create local DB tables. Safe to run anytime.
..\.venv\Scripts\python.exe manage.py migrate

# 3. Start the API server
..\.venv\Scripts\python.exe manage.py runserver
```

You should see:

```
Starting development server at http://127.0.0.1:8000/
Quit the server with CTRL-BREAK.
```

**Verify it works** (in a browser or a third terminal):

- Open http://127.0.0.1:8000/api/trips/plan/ → you'll see DRF's "Method GET not allowed" page. That is
  **correct** — the endpoint only accepts POST. It means the server is up.

> Leave this terminal running. To stop later: `Ctrl + C` (or `Ctrl + Break`).

**If `runserver` fails:**

- `ModuleNotFoundError` → the venv is missing deps. Run:
  `..\.venv\Scripts\python.exe -m pip install -r requirements.txt` (from `backend/`; if there's no
  requirements.txt, install: `django djangorestframework django-cors-headers dj-database-url python-dotenv httpx whitenoise`).
- Port 8000 busy → run on another port: `... manage.py runserver 8001` **and** update
  `frontend/.env` → `VITE_API_URL=http://127.0.0.1:8001`, then restart the frontend.

---

## 3. TERMINAL 2 — start the frontend (React/Vite)

```powershell
# 1. Go to the frontend folder
cd C:\Users\Hp\Desktop\projects\hannah-project\frontend

# 2. (First run only, or if node_modules is missing) install deps
npm install

# 3. Start the dev server (hot reload)
npm run dev
```

You should see:

```
  VITE v8.x  ready in ... ms
  ➜  Local:   http://127.0.0.1:5173/
```

**Open → http://127.0.0.1:5173/**

---

## 4. Use the app

1. **Hero:** scroll down slowly. The black semi drives forward through 4 captions
   (Depart → Route → Stops → Log); the green route-line draws and a fuel pin drops. Scroll up reverses it.
   (Under Windows "reduce motion", it shows a static poster instead — by design.)
2. **Dispatch Panel:** below the hero. Defaults are Dallas → Tulsa → Chicago, 22 cycle hrs. Drag the
   **cycle dial** to change hours used. Edit the three locations (any "City, ST").
3. Click **Plan My Haul**. With the backend running, the page scrolls to **Results**:
   summary tiles (driving/on-duty hrs, days, stops), a duty-status ribbon, and the event timeline.
   *(Interactive map + printable log sheets are the next features — see `HANDOFF.md`.)*

---

## 5. Alternative: run the PRODUCTION build (what a screenshot/preview uses)

```powershell
cd C:\Users\Hp\Desktop\projects\hannah-project\frontend
npm run build                       # type-checks + builds into dist/  (should end "✓ built")
npm run preview -- --port 4319      # serves dist/ at http://127.0.0.1:4319/
```

Use this to confirm the app compiles clean. The backend must still be running (Terminal 1) for planning.

---

## 6. Run the tests

```powershell
# HOS engine unit tests (the graded centerpiece) — 5 tests, should all pass
cd C:\Users\Hp\Desktop\projects\hannah-project\backend
..\.venv\Scripts\python.exe -m pytest hos_engine\ -v

# Frontend type-check (no dedicated test runner yet)
cd C:\Users\Hp\Desktop\projects\hannah-project\frontend
npm run build
```

---

## 7. Re-extract the hero frames (ONLY if you replace `background-video.mp4`)

The frames are already generated and committed. Only re-run if the video changes.

```powershell
cd C:\Users\Hp\Desktop\projects\hannah-project\frontend
node scripts\extract-frames.mjs
# optional args:  node scripts\extract-frames.mjs <videoPath> <targetFrames=180> <width=1280>
```

This uses the bundled `ffmpeg-static` binary (you do NOT need ffmpeg installed). Output overwrites
`public\frames\hero\frame-0001.webp ...`. If you change the frame count, update `HERO_FRAME_COUNT` in
`src\lib\frames.ts`.

---

## 8. Troubleshooting

| Symptom                                          | Cause                                                          | Fix                                                                                                                                        |
| ------------------------------------------------ | -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| "Plan My Haul" shows an error banner             | Backend not running / wrong port                               | Start Terminal 1 (§2). Ensure`frontend/.env` `VITE_API_URL` matches the backend port. Restart `npm run dev` after editing `.env`. |
| Hero is blank / no truck                         | Frames not found                                               | Confirm`public/frames/hero/frame-0001.webp` exists; re-run §7. Check browser console/network for 404s.                                  |
| Hero doesn't scrub, page just scrolls            | `prefers-reduced-motion` is ON, or JS error                  | Turn off Windows "Show animations"; check the browser console for errors.                                                                  |
| CORS error in console                            | Backend CORS not allowing the frontend origin                  | Dev backend uses`CORS_ALLOW_ALL_ORIGINS=True` — if you changed it, re-allow `http://127.0.0.1:5173`.                                  |
| `geocode`/route fails, 400 "Could not geocode" | Public Photon/OSRM demo down or rate-limited, or a typo'd city | Try again; use clear "City, ST"; these are free public services (no key). Caching/retries are a TODO (HANDOFF §T5).                       |
| `npm run dev` port 5173 busy                   | Another Vite running                                           | `npm run dev -- --port 5174` and open that URL.                                                                                          |
| `pytest` not found                             | Wrong Python                                                   | Use the venv Python explicitly:`..\.venv\Scripts\python.exe -m pytest`.                                                                  |

---

## 9. Quick reference — the two commands you'll use most

```powershell
# Terminal 1 (backend)
cd C:\Users\Hp\Desktop\projects\hannah-project\backend ; ..\.venv\Scripts\python.exe manage.py runserver

# Terminal 2 (frontend)
cd C:\Users\Hp\Desktop\projects\hannah-project\frontend ; npm run dev
```

Then open **http://127.0.0.1:5173/**.

---

## 10. What's NOT runnable yet (needs the work in HANDOFF.md)

- **Rig AI chat** — `backend/assistant/views.py` is empty (HANDOFF §T6).
- **Supabase / pgvector / RAG** — backend is on SQLite; RAG model ref is broken (§T5, §T6).
- **Interactive map, log-sheet PDFs, compliance gauges** — placeholders in the Results view (§T2–T4).
- **Vercel deployment** — not configured (§T8).
