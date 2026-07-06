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