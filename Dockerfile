# ── Stage 1: build the React frontend ─────────────────────────────────────────
FROM node:20-alpine AS frontend-builder

WORKDIR /build
COPY frontend/package.json frontend/package-lock.json* ./
RUN npm install
COPY frontend/ ./
RUN npm run build


# ── Stage 2: final image (nginx + gunicorn + redis in one container) ───────────
FROM python:3.11-slim

# System deps: nginx, redis, supervisor
RUN apt-get update && apt-get install -y --no-install-recommends \
        nginx redis-server supervisor \
    && rm -rf /var/lib/apt/lists/*

# uv (fast Python package manager)
COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv

# ── Backend ────────────────────────────────────────────────────────────────────
WORKDIR /app/backend
COPY backend/pyproject.toml backend/uv.lock* ./
RUN uv sync --frozen --no-dev
COPY backend/ ./

# ── Frontend (built static files) ─────────────────────────────────────────────
COPY --from=frontend-builder /build/dist /usr/share/nginx/html
COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
RUN rm -f /etc/nginx/sites-enabled/default

# ── Process manager ───────────────────────────────────────────────────────────
COPY deploy/supervisord.conf /etc/supervisor/conf.d/app.conf

# Persistent data directory (mount a volume here to keep SQLite across deploys)
RUN mkdir -p /data

EXPOSE 80

# Run migrations then hand off to supervisord
CMD ["sh", "-c", \
     "cd /app/backend && uv run manage.py migrate --no-input && supervisord -n -c /etc/supervisor/supervisord.conf"]
