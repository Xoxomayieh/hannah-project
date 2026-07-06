<div align="center">

# HAULR

**"The open road, planned to the minute."**

[![React](https://img.shields.io/badge/React-18-blue?style=flat-square&logo=react)](https://react.dev/)
[![Django](https://img.shields.io/badge/Django-5-092E20?style=flat-square&logo=django)](https://www.djangoproject.com/)
[![Supabase](https://img.shields.io/badge/Supabase-DB-3ECF8E?style=flat-square&logo=supabase)](https://supabase.com/)
[![Gemini](https://img.shields.io/badge/AI-Gemini_2.5_Flash-orange?style=flat-square&logo=google)](https://ai.google.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-blue?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org)

An **AI-Powered HOS Trip Planner & ELD Log Generator**

[Overview](#overview) • [Features](#features) • [Architecture](#architecture) • [Getting Started](#getting-started)

</div>

## Overview

**HAULR** is a specialized single-page web app built to solve a critical compliance challenge for property-carrying truck drivers. Navigating multi-day trips requires simultaneously satisfying four interlocking federal limits (49 CFR Part 395). 

With HAULR, a driver (or dispatcher) simply inputs their current location, pickup, dropoff, and current cycle hours used. The system instantly returns:
1. **An interactive route map**, fully annotated with precise stops for rests, 30-min breaks, and fuel.
2. **Auto-drawn ELD daily log sheets** that faithfully replicate paper log grids.
3. An **AI Copilot ("Rig")** that guides the user, answers compliance questions via RAG, and can even operate the app itself via text commands.

The application strictly adheres to the Spotter.ai "Night Haul" visual identity: pure black canvas, crisp typography, and cinematic green telemetry accents, delivering a premium, purpose-built aesthetic.

## Features

- **Interactive Route Mapping**: High-contrast, dark-mode map powered by CARTO Dark Matter. Plots the full path with pulsing pins for start, pickup, dropoff, fuel, breaks, and resets.
- **HOS Trip Engine**: A deterministic, heavily tested simulator modeling the 11-hour driving limit, 14-hour window, 30-min breaks, and 70-hour/8-day cycle limits to create a perfect duty-status timeline.
- **Scroll-Driven Cinematic Hero**: An immersive video-to-website experience scrubbing seamlessly through a trucking journey as you scroll down to the dispatch form.
- **Auto-Generated Daily Logs**: SVG representations of the FMCSA blank paper log grid, auto-filled with compliance data, and exportable as PDFs.
- **Rig - AI Copilot**: Powered by **Gemini 2.5 Flash** and **LangGraph**, Rig offers dynamic agentic control of the trip planner and RAG-based FMCSA guidance with accurate citations.

## Architecture

The system utilizes a modern, serverless architecture carefully selected for performance and zero-cost hosting.

- **Frontend:** Built with React 18, Vite, and TypeScript. Implements absolute-positioned canvas rendering and GSAP-driven scroll scrubbing. Hosted entirely as a static site on Vercel.
- **Backend:** A Django 5 API using Django Rest Framework (DRF), running in serverless mode on Vercel Python runtimes. The HOS Trip Engine is structured as a pure Python module independent of Django requests.
- **AI & RAG:** Built on LangChain/LangGraph in Python. Utilizes `gemini-2.5-flash-lite` for routing and grading, `gemini-2.5-flash` for agentic tool calling and streaming, and `gemini-embedding-001` (at 768 dimensions) for efficient RAG against the FMCSA handbook.
- **Database:** Supabase Postgres extended with `pgvector` for similarity search, handling chat threads, token budgets, and storing PDF logs in Supabase Storage.

> [!TIP]
> The database uses a PostgresSaver LangGraph checkpointer. Threads survive serverless cold starts efficiently without requiring long-lived memory instances!

## Getting Started

### Prerequisites

- [Node.js (LTS)](https://nodejs.org/)
- [Python 3.10+](https://www.python.org/)
- [Supabase CLI](https://supabase.com/docs/guides/cli) (optional, for local DB development)
- A Google Gemini API key

### Installation

1. **Clone the repository**

   ```bash
   git clone https://github.com/your-username/haulr.git
   cd haulr
   ```

2. **Set up the Backend**

   ```bash
   cd backend
   python -m venv .venv
   source .venv/bin/activate  # On Windows: .venv\Scripts\activate
   pip install -r requirements.txt
   ```
   *Create a `.env` file in the backend directory based on `.env.example` to supply your Supabase and Gemini API credentials.*

3. **Set up the Frontend**

   ```bash
   cd ../frontend
   npm install
   ```
   *Create a `.env.local` file with the necessary API URLs (e.g., `VITE_API_BASE_URL`).*

### Running the App Locally

1. **Start the Django Backend**

   ```bash
   cd backend
   python manage.py runserver
   ```

2. **Start the Vite Frontend**

   ```bash
   cd frontend
   npm run dev
   ```

The application will be accessible locally at `http://localhost:5173`. Scroll down from the cinematic hero to begin planning your first haul!

> [!IMPORTANT]  
> The Spotter.ai `--spotter-green` hex is currently set to `#22C55E` but must be validated for AA contrast against pure black `#000000` via automated checking prior to production deployment.
