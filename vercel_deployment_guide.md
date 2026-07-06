# Deploying HAULR to Vercel (Free Tier)

Based on an analysis of your workspace, HAULR is a full-stack monorepo consisting of:
- **Frontend:** React, Vite, TypeScript, Tailwind CSS (`frontend/` directory).
- **Backend:** Django with an SQLite database (`backend/` directory).

Vercel is an incredible platform for frontend applications (like your Vite app), but it handles backends differently. Vercel is **serverless**, meaning your Django app will be converted into serverless functions that spin up on demand and shut down when idle. 

Here is the complete, step-by-step guide to deploying this system entirely on the Vercel Free Tier in 2026.

---

## 🚨 Critical Prerequisite: The Database Problem
Currently, your Django backend uses **SQLite** (`db.sqlite3`). 

**You cannot use SQLite on Vercel.** Vercel's serverless environment has an ephemeral, read-only filesystem. Any writes to your SQLite database will be permanently lost as soon as the function shuts down.

**The Solution:** You must migrate to a free, cloud-hosted PostgreSQL database. Excellent free-tier options include:
1. **[Neon](https://neon.tech/)** (Serverless Postgres) - *Recommended*
2. **[Supabase](https://supabase.com/)** (Postgres)

Sign up for one of these and get your `DATABASE_URL` connection string before proceeding.

---

## Step 1: Prepare the Django Backend

To run Django on a serverless architecture, we need to make it stateless and ensure static files are served correctly without a dedicated web server.

### 1.1 Install Production Dependencies
You need to add a few packages to handle serverless execution, static files, and the new database connection. Run this in your backend environment:

```bash
cd backend
pip install gunicorn whitenoise dj-database-url psycopg2-binary
pip freeze > requirements.txt
```

### 1.2 Update `backend/core/settings.py`
Modify your Django settings to support Vercel's environment variables and WhiteNoise for static files.

```python
import os
import dj_database_url

# 1. Use Environment Variables for Secrets
SECRET_KEY = os.environ.get('SECRET_KEY', 'your-fallback-dev-key')
DEBUG = os.environ.get('DEBUG', 'False') == 'True'

# 2. Allow Vercel Domains
ALLOWED_HOSTS = ['*'] # In production, restrict this to your actual Vercel domain

# 3. Add WhiteNoise Middleware (Must be right after SecurityMiddleware)
MIDDLEWARE = [
    'django.middleware.security.SecurityMiddleware',
    'whitenoise.middleware.WhiteNoiseMiddleware', # ADD THIS
    # ... other middleware
]

# 4. Configure the Database for Postgres (Neon/Supabase)
if 'DATABASE_URL' in os.environ:
    DATABASES = {
        'default': dj_database_url.config(conn_max_age=600, ssl_require=True)
    }
else:
    # Fallback to sqlite for local dev
    DATABASES = {
        'default': {
            'ENGINE': 'django.db.backends.sqlite3',
            'NAME': BASE_DIR / 'db.sqlite3',
        }
    }

# 5. Static Files Configuration
STATIC_URL = '/static/'
STATIC_ROOT = os.path.join(BASE_DIR, 'staticfiles')
```

### 1.3 Create a Vercel WSGI Adapter
In your project root (outside the backend folder), Vercel will look for an entry point. We will configure Vercel to route API requests to a build script. Vercel's current python builders auto-detect `wsgi.py`. 

Create a `build.sh` script in the root directory to handle the database migrations and static collection during deployment:

```bash
#!/bin/bash
# Root-level build.sh

echo "Building frontend..."
cd frontend
npm install
npm run build

echo "Building backend..."
cd ../backend
pip install -r requirements.txt
python manage.py collectstatic --noinput
python manage.py migrate
```
Make sure it's executable (`chmod +x build.sh`).

---

## Step 2: Configure the Monorepo (`vercel.json`)

To deploy a monorepo (where both Vite and Django live in the same repository) as a single Vercel project, we need a `vercel.json` file in the **root** of the `hannah-project`.

Create `vercel.json` in the root directory:

```json
{
  "version": 2,
  "buildCommand": "./build.sh",
  "outputDirectory": "frontend/dist",
  "builds": [
    {
      "src": "backend/core/wsgi.py",
      "use": "@vercel/python",
      "config": {
        "maxLambdaSize": "15mb",
        "runtime": "python3.12"
      }
    },
    {
      "src": "frontend/package.json",
      "use": "@vercel/static-build"
    }
  ],
  "routes": [
    {
      "src": "/api/(.*)",
      "dest": "/backend/core/wsgi.py"
    },
    {
      "src": "/admin/(.*)",
      "dest": "/backend/core/wsgi.py"
    },
    {
      "src": "/static/(.*)",
      "dest": "/backend/core/wsgi.py"
    },
    {
      "src": "/(.*)",
      "dest": "/frontend/dist/$1"
    }
  ]
}
```

*Note: Change `core/wsgi.py` if your Django project folder is named differently inside the `backend/` directory.*

---

## Step 3: Prepare the Frontend

Since we mapped `/api/(.*)` to the Django backend in `vercel.json`, your frontend should make all API calls to `/api/...` relative to the current domain.

In your Vite frontend, ensure your API base URL points to the same origin in production, rather than a hardcoded `localhost`:

```typescript
// Example frontend config
const API_BASE_URL = import.meta.env.PROD 
  ? '/api' 
  : 'http://localhost:8000/api';
```

---

## Step 4: Deploy on Vercel

1. **Push to GitHub:** Ensure all your changes, including `vercel.json`, `build.sh`, and the modified `settings.py`, are committed and pushed to your GitHub repository.
2. **Import Project:** Go to the [Vercel Dashboard](https://vercel.com/dashboard) and click **Add New... > Project**.
3. **Select Repository:** Choose your `hannah-project` repository.
4. **Configure Project Setup:**
   - **Framework Preset:** Leave as `Other` (our `vercel.json` overrides this anyway).
   - **Root Directory:** Leave as the root (`./`).
   - **Environment Variables:** You MUST add the following variables before hitting deploy:
     - `DATABASE_URL`: The connection string from Neon/Supabase.
     - `SECRET_KEY`: A random, secure string for Django.
     - `DEBUG`: `False`
5. **Deploy:** Click the **Deploy** button.

### What happens during deployment?
1. Vercel reads `vercel.json`.
2. It runs `./build.sh` which installs Node modules, builds the Vite frontend into `frontend/dist`.
3. It installs Python dependencies, collects static files, and runs Django database migrations.
4. It sets up the serverless function for Django based on `backend/core/wsgi.py`.
5. It configures the routing: `/api`, `/admin`, and `/static` go to Django, and everything else goes to the Vite static files.

---

## Limitations to Keep in Mind
- **Cold Starts:** Because Django is running in a serverless function, if the app hasn't been accessed for a while, the first request might take a few seconds longer.
- **Background Tasks:** You cannot run long-running background tasks (like Celery) on Vercel free tier.
- **File Uploads:** You cannot save uploaded files (like profile pictures) to the local filesystem. You must use a cloud storage provider like AWS S3 or Cloudinary.
