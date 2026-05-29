FROM ghcr.io/astral-sh/uv:python3.11-bookworm-slim

WORKDIR /app

# Copy dependency files first for layer caching
COPY pyproject.toml uv.lock* ./

# Install dependencies into the system Python (no venv needed in container)
RUN uv sync --frozen --no-dev

COPY . .

EXPOSE 8000

CMD ["sh", "-c", "uv run manage.py migrate --no-input && uv run gunicorn config.wsgi:application --bind 0.0.0.0:8000 --workers 2 --timeout 120"]
