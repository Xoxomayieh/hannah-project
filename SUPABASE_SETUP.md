# HAULR — Supabase Setup for the RAG Chatbot

This guide connects a fresh deployment (Railway, Vercel, or local) to **your own**
Supabase database so the Rig AI chatbot reads and writes *your* data — not someone
else's inherited database.

> **Why this is needed:** the chatbot's `documents` table is **not a Django model**, so
> `python manage.py migrate` will never create it. It has to be created once by hand with
> the SQL below. If the chatbot returns PDF-cited answers but your Supabase project looks
> empty, your deployment's `DATABASE_URL` is pointing at a *different* database — see
> [Verify where the app is pointing](#0-verify-where-the-app-is-actually-pointing).

---

## What creates what (so you know why this list is complete)

| Object | Created by | Manual? |
| --- | --- | --- |
| `vector` extension + `documents` table + indexes | **The SQL in this file** | ✅ paste once |
| `trips_*`, `auth_*`, `django_*` tables | `python manage.py migrate` | run once |
| Document rows (embedded PDF + FAQ) | `python manage.py ingest_docs` | run once |
| LangGraph checkpointer tables | `saver.setup()` in `assistant/views.py` | automatic on first chat |

---

## 0. Verify where the app is actually pointing

Before anything, confirm which database your live app uses.

- **Railway** → your service → **Variables** → open `DATABASE_URL`.
- **Supabase** → Project Settings → **Database** → Connection string.

Compare the **project ref / host**. If they differ, your app is silently using another
database (reads *and* writes go there). Fix by setting `DATABASE_URL` to your own Supabase
connection string (steps below).

> ⚠️ **Security:** if a deployment is using someone else's `DATABASE_URL`, that database
> password was shared. The owner should **rotate the Supabase database password**.

---

## 1. Paste this into the Supabase SQL Editor

Supabase Dashboard → **SQL Editor** → New query → paste → **Run**.

```sql
-- 1. Enable pgvector
create extension if not exists vector;

-- 2. The documents table the RAG chatbot reads from
--    (id auto, content text, metadata jsonb, 768-dim embedding)
create table if not exists documents (
    id        bigint generated always as identity primary key,
    content   text  not null,
    metadata  jsonb not null default '{}'::jsonb,
    embedding vector(768)
);

-- 3. Vector similarity index — cosine, matches rag.py's  embedding <=> query
create index if not exists documents_embedding_hnsw
    on documents using hnsw (embedding vector_cosine_ops);

-- 4. Full-text search index — matches rag.py's to_tsvector('english', content)
create index if not exists documents_content_fts
    on documents using gin (to_tsvector('english', content));
```

This schema is derived directly from the code:

- `assistant/ingest_docs.py` → `INSERT INTO documents (content, metadata, embedding)` and
  `DELETE ... WHERE metadata->>'source' IN (...)` (requires **jsonb** metadata).
- `assistant/rag.py` → `embedding <=> %s::vector` (cosine) and
  `to_tsvector('english', content) @@ query` (FTS), embeddings are **768-dim**
  (`gemini-embedding-001`, `output_dimensionality=768`).

---

## 2. Set the environment variables

The app needs these wherever it runs (Railway Variables, or your shell / `backend/.env`):

```bash
DATABASE_URL=postgresql://postgres.<PROJECT_REF>:<PASSWORD>@aws-0-<REGION>.pooler.supabase.com:6543/postgres?sslmode=require
GEMINI_API_KEY=<your-gemini-api-key>
```

- Use the **transaction pooler** host (`...pooler.supabase.com:6543`) with `sslmode=require`.
- `GEMINI_API_KEY` is **required** for ingestion and for the chatbot — `ingest_docs`
  aborts without it (it calls Gemini to embed each chunk).

---

## 3. Migrate and ingest (run against that Supabase)

```bash
python manage.py migrate        # creates trips_*, auth_*, django_* tables
python manage.py ingest_docs    # embeds docs/fmcsa-hos-guide.pdf + docs/app-faq.md into `documents`
```

The LangGraph checkpointer tables are created automatically the first time someone sends
a chat message (`saver.setup()` in `assistant/views.py`).

---

## 4. Verify it worked

Run in the Supabase SQL Editor — you should see the ingested chunk counts:

```sql
select count(*), metadata->>'source' as source
from documents
group by metadata->>'source';
```

Expected: one row for `fmcsa-hos-guide` and one for `app-faq`, each with a non-zero count.
Then open the app and ask the chatbot an HOS question — it should answer **with PDF
citations**.

---

## Troubleshooting

| Symptom | Cause | Fix |
| --- | --- | --- |
| Chatbot answers but **no citations** | `documents` empty, or app fell back to SQLite | Run steps 1–3; confirm `DATABASE_URL` is a real Postgres URL (no `YOUR_PASSWORD` placeholder) |
| `relation "documents" does not exist` on ingest | Step 1 SQL not run on this database | Run the SQL in section 1 against the **same** DB as `DATABASE_URL` |
| `ingest_docs` says `GEMINI_API_KEY ... missing` | Env var not set | Set `GEMINI_API_KEY` before running |
| Your Supabase still empty after deploy | `DATABASE_URL` points at a different DB | See [section 0](#0-verify-where-the-app-is-actually-pointing) |
| App uses `db.sqlite3` unexpectedly | `DATABASE_URL` unset / placeholder / `sqlite...` | `settings.py` falls back to SQLite in those cases — set a real `DATABASE_URL` |
