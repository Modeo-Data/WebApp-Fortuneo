# syntax=docker/dockerfile:1.7
# ─────────────────────────────────────────────────────────────────────────────
# Modeo Lineage — single-image build: React (nginx) + Django (gunicorn)
# Multi-stage: builds the frontend with Node, then bakes everything into a
# Python runtime alongside nginx + supervisord.
# ─────────────────────────────────────────────────────────────────────────────

ARG HTTP_PROXY=
ARG HTTPS_PROXY=
ARG NO_PROXY=


# ── Stage 1: build the React frontend ───────────────────────────────────────
FROM node:20-alpine AS frontend-builder

ARG HTTP_PROXY
ARG HTTPS_PROXY
ARG NO_PROXY
ENV HTTP_PROXY=${HTTP_PROXY} \
    HTTPS_PROXY=${HTTPS_PROXY} \
    NO_PROXY=${NO_PROXY}

WORKDIR /build

COPY frontend/package.json frontend/package-lock.json* ./
RUN npm ci --no-audit --no-fund

COPY frontend/ ./
RUN npm run build


# ── Stage 2: runtime image (Python + nginx + supervisord) ───────────────────
FROM python:3.11-slim AS runtime

ARG HTTP_PROXY
ARG HTTPS_PROXY
ARG NO_PROXY
ENV HTTP_PROXY=${HTTP_PROXY} \
    HTTPS_PROXY=${HTTPS_PROXY} \
    NO_PROXY=${NO_PROXY} \
    PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    UV_LINK_MODE=copy \
    UV_COMPILE_BYTECODE=1

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        nginx supervisor curl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv

# ── Backend deps (cached layer) ────────────────────────────────────────────
WORKDIR /app/backend
COPY backend/pyproject.toml backend/uv.lock* ./
RUN uv sync --frozen --no-dev

# ── Backend source ─────────────────────────────────────────────────────────
COPY backend/ ./

# ── Frontend static build ──────────────────────────────────────────────────
COPY --from=frontend-builder /build/dist /usr/share/nginx/html

# ── Nginx + supervisord config ─────────────────────────────────────────────
COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
COPY deploy/supervisord.conf /etc/supervisor/supervisord.conf
RUN rm -f /etc/nginx/sites-enabled/default \
    && sed -i \
        -e 's|^pid .*|pid /tmp/nginx.pid;|' \
        -e 's|^user .*|# user removed (non-root container);|' \
        /etc/nginx/nginx.conf

# ── Drop privileges + writable runtime paths for nginx ─────────────────────
RUN mkdir -p /var/lib/nginx/body /var/log/nginx /var/run /app/backend/staticfiles \
    && chown -R www-data:www-data /var/lib/nginx /var/log/nginx /var/run /app/backend

USER www-data

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD curl -fsS http://127.0.0.1:8080/ || exit 1

ENV PATH="/app/backend/.venv/bin:${PATH}"

CMD ["sh", "-c", "python manage.py migrate --no-input && exec supervisord -n -c /etc/supervisor/supervisord.conf"]
