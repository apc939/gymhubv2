# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

openGym is a self-hosted gym & body-weight tracker PWA. Two containers (`api` + `web`) plus a
`./data` folder the user owns — no third-party account, no telemetry. Passkey (WebAuthn) login,
installable as a home-screen app, optional Capacitor shells for standalone Android/iOS builds.
License: AGPL-3.0-or-later.

## Project layout

```
frontend/  React 19 + Vite app (src/views, src/components, src/store, src/lib). Builds to static files.
           android/ + ios/ are the Capacitor shells for the standalone mobile app (docs/MOBILE.md).
api/       backend — server.js (Node, no framework), deps: @simplewebauthn/server, web-push.
web/       multi-stage Dockerfile (builds frontend → nginx) + nginx.conf.template (serves app, proxies /api).
mcp/       optional MCP server — read-only stdio bridge exposing a user's workouts/1RM/muscle
           balance to LLM clients (Claude Desktop, Cursor…). Not part of the Docker build; only
           runs when an LLM client spawns it.
media/     exercise img/gif, gitignored, fetched at runtime by the `media` compose service.
website/   static marketing site (plain HTML/CSS/JS), deployed separately by .gitlab-ci.yml.
docs/      SELF_HOSTING.md, MOBILE.md.
```

## Commands

```bash
# Local stack (api + web + media, prebuilt or built from source)
cp .env.example .env
docker compose up -d --build

# Frontend dev server (hot reload), proxies /api to :3000
cd frontend && npm install && npm run dev

# Frontend tests (training logic: progression, 1RM, session read-back)
cd frontend && npm test            # vitest run
cd frontend && npm run test:watch
npx vitest run src/lib/progression.test.js   # single file
npx vitest run -t "some test name"           # single test by name

# MCP server tests
cd mcp && npm test

# Production build
cd frontend && npm run build
cd frontend && npm run build:mobile   # + cap sync, points media at the CDN dataset
```

There is no linter/formatter configured (no ESLint/Prettier config in the repo) and no
TypeScript — match the existing style by hand.

The CI gate is `.gitlab-ci.yml` on GitLab, the canonical remote (see README): it runs the
`frontend/` tests on Node 22 — the same version as `web/Dockerfile` / `api/Dockerfile`
(`node:22-alpine`) — and additionally builds and publishes the Docker images, packages the
signed Android APK, and deploys the demo/docs site. The Gitea and GitHub workflow copies
(`.gitea/workflows/`, `.github/workflows/`) are dormant mirrors; neither host runs them.

## Architecture

### Frontend (`frontend/src`)

- **`store/useStore.js`** — single Zustand store holding the entire client-side app state (`S`),
  persisted to `localStorage` (`gym_state_v1`) and debounce-pushed to the server when signed in
  (`pushState`, see `lib/api.js`). On the Capacitor mobile build it's also mirrored to a file via
  `lib/mobile.js` (`nativeSave`), since WebView storage can be evicted. `store/useUI.js` holds
  ephemeral UI state (modals, active sheet, etc.) separately from persisted data.
- **`lib/`** — pure, framework-free helpers, each paired with a same-directory `*.test.js`. This
  is where the domain logic lives, most importantly:
  - `progression.js` — the progression-rule engine (linear, Greyskull LP, double progression,
    time-based). Rules implement a shared policy interface; adding a new one plugs in here.
  - `onerm.js` — estimated 1RM from logged sets.
  - `finish-workout.js` — reduces a completed session back into state (weights advance, PRs, etc).
  - `recovery.js` / `recovery-view.js` — fatigue/muscle-recovery model.
  - `workout-model.js`, `supersetFlow.js` — in-session workout state machine, incl. supersets.
  - `exercises.js` / `exercises-data.js` — the exercise library (1,324 built-ins + user-defined).
  - `api.js` — the only place that talks to the backend (`fetch` wrapper, session cookie flows).
  - CONTRIBUTING.md is explicit: **anything that decides what you lift next, or reads a logged
    session back, is a pure helper here with a unit test beside it** — not verifiable by
    clicking, and the progression engine has already had two bugs that only a test caught.
- **`views/`** — one file per screen (Home, Workout, Plan, Library, Stats, History, Settings,
  Admin, Login, RoutineEdit), routed by `react-router-dom` from `App.jsx`.
- **`components/`** — shared UI (charts, modals, timers); `instr/` holds per-language exercise
  instruction text; `locales/` is the i18n string catalogue (`lib/i18n.js` / `i18n-core.js`).
- Mobile: `@capacitor/*` wraps the same web build into native shells under `frontend/android` and
  `frontend/ios` (see `docs/MOBILE.md`); `mobile.js` in `lib/` gates native-only behavior (file
  persistence, local notifications, wake lock) behind a `MOBILE` flag.

### API (`api/server.js`)

Single file, no framework, plain `node:http`. Requests are dispatched through a `routes` object
keyed by `'METHOD /path'` (e.g. `routes['GET /api/health']`) matched against `req.method + ' ' +
url.pathname` — add a new endpoint by adding a key here. State is two flat JSON files under
`DATA_DIR` (`db.json`: users/credentials/subscriptions/invites; `state-<uid>.json`: per-user
workout data), written with a write-temp-then-rename atomic pattern (`atomicWrite`). Auth is
WebAuthn passkeys (`@simplewebauthn/server`) plus a signed session cookie (HMAC'd with a
`DATA_DIR/secret` generated on first boot) — no JWT/session-store dependency. Optional pieces
gated by env vars: `ADMIN_UIDS` (admin dashboard), `INVITE_ONLY` (signup needs a code),
`ALLOW_GUEST` (client-only guest mode never hits the server at all), plus a rotating
`data/audit.log` (JSONL) for sign-in/admin events. Web Push (`web-push`, VAPID keys
auto-generated into `data/vapid.json`) drives rest-timer-over and day-reminder notifications.

### MCP server (`mcp/src`)

Read-only stdio MCP bridge (`@modelcontextprotocol/sdk`) that lets an LLM client read a single
user's routines/workouts/body-weight/1RM/muscle-balance directly from the same `DATA_DIR` the API
writes to — no network call, no extra container. `state.js` loads/derives the data, `tools.js`
defines the exposed MCP tools (zod-validated schemas), `labels.js` maps internal keys to
human-readable labels, `index.js` wires it together. See `mcp/README.md` for the client-config
side (Claude Desktop / Cursor).

### Passkeys and self-hosting constraints

WebAuthn passkeys are bound to an exact hostname (`RP_ID`) and require HTTPS (localhost excepted)
— this shapes a lot of the API and Settings code (`RP_ID`/`ORIGIN` env vars, guest-mode fallback
when neither is available). Read `docs/SELF_HOSTING.md` before touching auth, session, or
notification code; it documents the exact env-var contract (`RP_ID`, `ORIGIN`, `PORT`,
`WEB_PORT`, `NGINX_PORT`, `BACKEND`, `SESSION_DAYS`, `ADMIN_UIDS`, `INVITE_ONLY`, `ALLOW_GUEST`,
`AUDIT_*`, `VAPID_SUBJECT`) that real deployments depend on.

### Docker / deploy

`docker-compose.yml` has three services: `media` (one-shot exercise-asset downloader, gitignored
output), `api`, `web` (multi-stage build of `frontend/` served by nginx, which also proxies
`/api` → `api` and serves the shared media volume — single origin, required for passkeys).
`web/nginx.conf.template` is rendered from env vars at container start (`NGINX_PORT`, `BACKEND`,
`BACKEND_PORT`, `PORT`), with dynamic DNS resolution so host/port remapping works against prebuilt
images without a rebuild.

### Railway Production Architecture (GymHub Deployment)

When deploying to Railway (e.g. `https://web-production-5a975.up.railway.app`):

#### 1. Service `api` (Backend & Clinical Engine)
- **Source / Root Directory**: `/api`
- **Builder**: `Dockerfile`
- **Persistent Volume**: Mount `/data` (persists `db.json`, `audit.log`, user states, and archetypes).
- **Environment Variables**:
  - `PORT`: `3000`
  - `DATA_DIR`: `/data`
  - `ORIGIN`: `https://<public-web-domain>` (e.g. `https://web-production-5a975.up.railway.app`)
  - `RP_ID`: `<public-web-hostname>` (e.g. `web-production-5a975.up.railway.app` — no scheme, no port)
  - `ADMIN_KEY`: Secret key for remote clinical manager administration (e.g. `gymhub-clinical-admin-2026`)
- **Network Dual-Stack**: `server.listen({ port: PORT, host: '::', ipv6Only: false })` ensures it accepts both Railway private IPv6 (`fd12:...`) and IPv4.
- **ES Module Note**: `api/package.json` contains `"type": "module"`. Always use `fileURLToPath(import.meta.url)` instead of CommonJS `__dirname`.
- **Auto-Admin**: Users named `"Andrés Parra Charris"` or the first registered user are automatically granted Master Admin privileges.

#### 2. Service `web` (Frontend + Nginx Dynamic Gateway)
- **Source / Root Directory**: `/`
- **Builder**: `Dockerfile` (`web/Dockerfile`)
- **Public Domain**: Generated in Railway Settings → Networking (e.g. `web-production-5a975.up.railway.app`).
- **Environment Variables**:
  - `PORT`: `80` (**CRITICAL**: Railway routes public internet traffic to `PORT`. Must be `80`, never `3000`).
  - `BACKEND`: `api.railway.internal` (**CRITICAL**: Must point to `api`, never `${{RAILWAY_PRIVATE_DOMAIN}}` which refers to `web` itself).
  - `BACKEND_PORT`: `3000` (Internal port of the `api` service).
- **Dynamic DNS & Stale IP Prevention**:
  - In Nginx, static `proxy_pass` caches DNS indefinitely on boot. When `api` redeploys and receives a new IP, static Nginx causes `502 Bad Gateway` / `504 Gateway Time-out`.
  - Solved by using dynamic variable resolution (`set $backend_upstream "${BACKEND}:${BACKEND_PORT}"; proxy_pass http://$backend_upstream;`) combined with `resolver ${NGINX_LOCAL_RESOLVERS} [fd12::10] 127.0.0.11 1.1.1.1 valid=5s ipv6=on;`.
  - `web/18-clean-backend-env.envsh` automatically sanitizes env vars on boot, ensuring `BACKEND` never points to `web.railway.internal` and defaults `BACKEND_PORT=3000`.
- **Exercise Media**: `web/Dockerfile` bakes in `VITE_IMG_BASE` and `VITE_GIF_BASE` pointing to jsDelivr CDN for cloud environments where local media volumes are not present.

#### 3. Clinical Architecture & Manager (`clinical/`)
- Clinical archetypes are maintained in `clinical/archetypes/` and bundled inside `api/archetypes/` (`nivel0_sedentario.json`, `nivel1_bandas_mancuernas.json`, `nivel2_salud_postural.json`).
- `clinical/clinical-manager.mjs` executes operations directly against Railway production using HTTPS and `x-admin-key`:
  ```bash
  node clinical/clinical-manager.mjs list
  node clinical/clinical-manager.mjs invite "Nombre Paciente" nivel0
  node clinical/clinical-manager.mjs assign "<user_id>" nivel1
  node clinical/clinical-manager.mjs report "<user_id>"
  ```

## Guidelines from CONTRIBUTING.md worth knowing before changing code

- **Dependency-light is a hard constraint, not a preference.** Frontend: React + Router + Zustand
  and nothing else. `api/`: two dependencies total. New dependencies are a hard sell either side.
- Don't commit `media/` or `data/` (gitignored).
- Training-logic changes (progression, 1RM, session read-back) need a unit test in `src/lib`
  beside the code, not just manual clicking-through.

