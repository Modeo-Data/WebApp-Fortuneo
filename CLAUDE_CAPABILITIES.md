# Claude Code — capacités disponibles dans cette session

> Inventaire de tout ce que Claude peut utiliser dans le projet WebApp-Fortuneo.

## Outils built-in (chargés au démarrage)

| Outil | Usage |
|-------|-------|
| **Bash** | Exécution shell, mode background pour les processes longs |
| **Read** | Fichiers texte, images, PDF, notebooks Jupyter |
| **Write** | Création/réécriture complète de fichiers |
| **Edit** | Remplacement de chaînes exactes dans un fichier |
| **Agent** | Délégation à des sous-agents spécialisés |
| **Skill** | Invocation de skills (slash commands) |
| **ToolSearch** | Charger à la demande les schemas d'outils deferred |
| **Workflow** | Orchestration multi-agents déterministe (sur opt-in explicite) |
| **AskUserQuestion** | Questions multi-choix avec options |
| **ScheduleWakeup** | Reprise différée d'un loop |
| **ShareOnboardingGuide** | Partage d'ONBOARDING.md |

## Outils deferred (à charger via ToolSearch)

### Gestion de tâches
`TaskCreate`, `TaskUpdate`, `TaskList`, `TaskGet`, `TaskStop`, `TaskOutput`

### Modes spéciaux
`EnterPlanMode`, `ExitPlanMode`, `EnterWorktree`, `ExitWorktree`

### Automatisation
`CronCreate`, `CronList`, `CronDelete`

### Web
`WebFetch`, `WebSearch`

### Notifications & monitoring
`Monitor`, `PushNotification`, `RemoteTrigger`, `NotebookEdit`

## MCP servers disponibles (auth requise, non connectés)

Asana · Atlassian · Box · Canva · Figma · Gmail · Google Calendar · Google Drive · HubSpot · Intercom · Linear · Microsoft 365 · Notion · Slack · monday.com

## Skills (slash commands)

| Commande | Description |
|----------|-------------|
| `/deep-research` | Recherche multi-source avec sources citées et vérification |
| `/update-config` | Modifier `settings.json` (permissions, hooks, env vars) |
| `/keybindings-help` | Personnaliser les raccourcis clavier |
| `/verify` | Vérifier qu'un changement fonctionne dans l'app |
| `/code-review` | Review du diff actuel (low/medium/high effort) |
| `/simplify` | = `/code-review --fix` — applique les fixes au working tree |
| `/fewer-permission-prompts` | Auto-allowlist des commandes fréquentes |
| `/loop` | Exécution récurrente d'un prompt ou slash command |
| `/schedule` | Agents cron (routines distantes) |
| `/claude-api` | Build/debug d'apps Claude API ou Anthropic SDK |
| `/run` | Lancer l'app pour valider un changement |
| `/init` | Initialiser un CLAUDE.md |
| `/review` | Review d'une pull request |
| `/security-review` | Review sécurité du diff actuel |

## Sous-agents (via Agent tool)

| Agent | Rôle |
|-------|------|
| `claude` | Généraliste, catch-all |
| `Explore` | Recherche read-only rapide (find files, grep symbols) |
| `Plan` | Architecture / design d'implémentation |
| `general-purpose` | Recherches complexes multi-étapes |
| `claude-code-guide` | Questions sur Claude Code, SDK, API Anthropic |
| `statusline-setup` | Configurer la statusline |

## Mémoire persistante du projet

**Path** : `~/.claude/projects/-Users-dilovancandan-Desktop-WebApp-Fortuneo/memory/`

Chargée automatiquement à chaque session via `MEMORY.md` (index).

### Memos actifs

| Fichier | Type | Contenu |
|---------|------|---------|
| `project_overview.md` | project | Modeo Lineage — Django + React + Redis + Claude AI |
| `project_scale.md` | project | ~200 sources, 2000+ tables, dashboards |
| `project_data_flow.md` | project | Règles ingest/compute/extract/virtual |
| `project_left_panel.md` | project | NodeSelector refactor architecture |
| `feedback_modularity.md` | feedback | Functions = reusable lego bricks, pas de gros if/else |
| `feedback_darkmode.md` | feedback | Cellules actives en dark mode = quasi-noir `#0d1117` |
| `feedback_rf_inline_ui.md` | feedback | UI expandable inline dans le node, pas en node séparé |
| `feedback_glow_effect.md` | feedback | Radial 3-layer fade (0.55 → 0.20 → 0.06) |
| `feedback_search_bar.md` | feedback | Bounce sur première keystroke (sb-active), pas sur focus |

## Processes en cours (background dans cette session)

| Service | URL |
|---------|-----|
| Django backend | http://localhost:8000 |
| Vite frontend | http://localhost:5173 |
| ngrok tunnel | https://barrel-upon-suspense.ngrok-free.dev → 5173 |

## Utilisation typique

**Petits changements ciblés** → Edit / Read / Bash directement
**Recherche dans la codebase** → `Agent` avec `Explore` pour > 3 queries, sinon `grep`/`find` via Bash
**Tâches multi-étapes (3+ steps)** → TaskCreate pour tracking, mise à jour après chaque étape
**Décisions UX/architecturales** → AskUserQuestion avec options claires
**Audit/review complet** → `/code-review` ou Workflow (sur opt-in)
**Recherche externe** → `/deep-research`

## Politique de confirmation

Claude demande confirmation avant :
- Actions destructives (`rm -rf`, `git reset --hard`, force push)
- Actions visibles à d'autres (push, PR, messages Slack, deploys)
- Upload vers services tiers (pastebins, gists)

Pour les actions locales réversibles (édition de fichiers, tests), Claude agit sans demander.
