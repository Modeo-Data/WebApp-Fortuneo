# Modeo Lineage — WebApp Fortuneo

Outil de visualisation du **data lineage** des KPIs (Django + React + Redis + Claude AI).

- **Backend** : Django 4.2 + DRF (Python 3.11+, gestion des deps via [`uv`](https://docs.astral.sh/uv/))
- **Frontend** : React 18 + Vite + Tailwind + React Flow
- **Cache** : Redis (fallback automatique sur cache mémoire locale si indisponible)
- **DB** : SQLite en dev (`backend/db.sqlite3`), configurable via `DATABASE_URL`

---

## Prérequis

- Python **3.11+**
- Node.js **20+**
- [`uv`](https://docs.astral.sh/uv/getting-started/installation/) (`brew install uv` ou `curl -LsSf https://astral.sh/uv/install.sh | sh`)
- Redis en local (optionnel, `brew install redis && brew services start redis`)

---

## Variables d'environnement (backend)

Toutes optionnelles en dev — valeurs par défaut fournies.

| Variable | Défaut | Rôle |
|---|---|---|
| `DJANGO_SECRET_KEY` | `dev-secret-key-change-in-prod` | Clé Django |
| `DJANGO_DEBUG` | `True` | Mode debug |
| `DJANGO_ALLOWED_HOSTS` | `*` | Hosts autorisés (CSV) |
| `ANTHROPIC_API_KEY` | `mock` | Clé Claude (mock = pas d'appel réel) |
| `REDIS_URL` | `redis://localhost:6379/0` | URL Redis |
| `DATABASE_URL` | `sqlite:///backend/db.sqlite3` | URL DB (Postgres OK) |

---

## Lancer le backend seul

```bash
cd backend
uv sync                          # installe les deps (première fois)
uv run python manage.py migrate  # applique les migrations
uv run python manage.py runserver 0.0.0.0:8000
```

API disponible sur **http://localhost:8000/api/**.

Créer un superuser (optionnel) :

```bash
cd backend
uv run python manage.py createsuperuser
```

---

## Lancer le frontend seul

```bash
cd frontend
npm install                      # installe les deps (première fois)
npm run dev
```

Vite sert l'app sur **http://localhost:5173** et proxifie `/api` → `http://localhost:8000` (voir `frontend/vite.config.js`).

---

## Lancer les deux en même temps (dev)

Ouvrir **2 terminaux** :

```bash
# Terminal 1 — backend
cd backend && uv run python manage.py runserver 0.0.0.0:8000
```

```bash
# Terminal 2 — frontend
cd frontend && npm run dev
```

Puis ouvrir **http://localhost:5173**.

---

## Build de production (frontend)

```bash
cd frontend
npm run build      # sort dans frontend/dist
npm run preview    # sert le build localement pour vérifier
```

---

## Docker (image unique nginx + gunicorn)

Le `Dockerfile` à la racine build un container qui embarque React (servi par nginx) + Django (gunicorn) derrière supervisord, exposé sur le port **8080**.

```bash
docker build -t modeo-lineage .
docker run --rm -p 8080:8080 \
  -e ANTHROPIC_API_KEY=sk-... \
  -e REDIS_URL=redis://host.docker.internal:6379/0 \
  modeo-lineage
```

App accessible sur **http://localhost:8080** (nginx proxifie `/api/` vers gunicorn en interne).

---

## Structure

```
backend/          Django (config + apps: lineage, orchestration)
frontend/         React + Vite
deploy/           nginx.conf + supervisord.conf (image Docker)
Dockerfile        Build multi-stage front + back
```
