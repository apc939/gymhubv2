# AGENTS.md

This file provides system instructions and architecture rules for AI coding assistants (Antigravity, Gemini, Claude, Cursor, Codex) working on **GymHub by @medandresparra** (forked from OpenGym).

## Project Overview

GymHub is a self-hosted gym & body-weight tracker PWA tailored for clinical and personal exercise prescription. It uses a 2-container architecture (`api` + `web`) with WebAuthn Passkeys (Face ID / Touch ID / PIN) and local/cloud persistent storage.

- **Frontend**: React 19 + Vite (built to static files, served by Nginx).
- **Backend**: Node.js microservice (`api/server.js`), zero external web framework, WebAuthn via `@simplewebauthn/server`.
- **Database**: Flat JSON database (`/data/db.json`, `/data/state-<uid>.json`) using atomic rename writes.
- **Clinical Manager**: `clinical/clinical-manager.mjs` manages patient routines and clinical archetypes remotely via HTTPS.
- **Production Host**: Railway (`https://web-production-5a975.up.railway.app`).

## Project Layout

- `frontend/` - React 19 + Vite app (`src/views`, `src/components`, `src/store`, `src/lib`). Builds to static files.
- `api/` - Backend (`server.js`, `user-stats.js`). Node, no framework.
- `web/` - Multi-stage Dockerfile (builds frontend → nginx) + `nginx.conf.template`.
- `clinical/` - Clinical archetypes and remote manager scripts.
- `data/` - Runtime data (users, passkeys, per-user state, session secret). Gitignored.

## Commands

- **Local stack**: `docker compose up -d --build`
- **Frontend dev server**: `cd frontend && npm install && npm run dev`
- **Frontend tests**: `cd frontend && npm test`
- **API tests**: `cd api && npm test`
- **Production build**: `cd frontend && npm run build`

## Critical Architecture & Deployment Rules

### 1. Railway Production Configuration

The app is deployed on Railway across two services:

#### Service `api`
- **Root Directory**: `/api`
- **Builder**: `Dockerfile`
- **Persistent Volume**: Mount `/data` to `/data`
- **Required Environment Variables**:
  - `PORT`: `3000`
  - `DATA_DIR`: `/data`
  - `ORIGIN`: `https://web-production-5a975.up.railway.app`
  - `RP_ID`: `web-production-5a975.up.railway.app` (domain only, no scheme, no port)
  - `ADMIN_KEY`: `gymhub-clinical-admin-2026`
- **Binding Rule**: Always bind explicitly to dual-stack: `server.listen({ port: PORT, host: '::', ipv6Only: false }, ...)`
- **ES Module Rule**: `api/package.json` specifies `"type": "module"`. Never use CommonJS `__dirname`; use `fileURLToPath(import.meta.url)`.
- **Auto-Admin**: User `"Andrés Parra Charris"` or the first user in `db.users` automatically receives Master Admin privileges (`admin: true`).

#### Service `web`
- **Root Directory**: `/`
- **Dockerfile**: `web/Dockerfile`
- **Public Domain**: Assigned in Railway (e.g. `web-production-5a975.up.railway.app`).
- **Required Environment Variables**:
  - `PORT`: `80` (**CRITICAL**: Railway routes internet traffic to `PORT`. Must be `80`, never `3000`).
  - `BACKEND`: `api.railway.internal` (**CRITICAL**: Must point to `api`, never to `web`).
  - `BACKEND_PORT`: `3000`
- **Dynamic DNS Resolution**: Nginx configuration (`web/nginx.conf.template`) must use dynamic variable resolution (`resolver`) to prevent stale IPs when the backend restarts. `web/18-clean-backend-env.envsh` auto-sanitizes variables at boot.

### 2. Clinical Features, Archetypes & Remote Management

- **Archetypes**: Clinical archetypes live in `clinical/archetypes/` and are copied to `api/archetypes/` at build time. `api/server.js` auto-populates `/data/archetypes/` on boot if missing.
- **Remote Manager**: `clinical/clinical-manager.mjs` connects directly to Railway production using `x-admin-key`.
- **User Deletion Protocol**: Never delete admin accounts. Agent must execute `node clinical/clinical-manager.mjs delete "<nombre_o_uid>"` or invoke `POST /api/admin/user/delete`.
- **Cardio & Pain Tracking**:
  - `frontend/src/components/CardioLogSheet.jsx`: Handles cardio sessions without pain logging.
  - `frontend/src/components/PainLogSheet.jsx`: Handles global daily pain reporting decoupled from workouts.
- **Admin Adherence Monitoring (`frontend/src/lib/adherence.js`)**:
  - The Admin panel calculates adherence using UTC dates (immune to DST):
    - **🟢 Al día**: 0 a 2 días desde el último entrenamiento o cardio.
    - **🟡 En Riesgo**: $\ge 3$ días sin actividad.
    - **🔴 Inactivo**: $\ge 5$ días sin actividad.
  - Displays a red **⚠️ alerta de dolor** si el paciente indicó molestia en su último registro.

### 3. WebAuthn / Passkeys Requirements

- Single-origin requirement: The browser must interact with the frontend and backend on the same origin (`/api/...` proxied via Nginx).
- `RP_ID` must match the browser's hostname exactly.
- `ORIGIN` must match the full canonical HTTPS URL.

### 4. Code Standards & Testing

- **Dependency-light is a hard constraint.** Frontend: React + Router + Zustand and nothing else. API: zero frameworks (plain `node:http`).
- All API tests (`api/test/`) must pass: `npm --prefix api test`.
- All Frontend tests (`frontend/src/lib/*.test.js`) must pass: `npm --prefix frontend test`.
- Progression engine and lifting logic must never be modified without companion unit tests.
- **Rebranding tokens**: Light theme with Sky accent by default, Spanish language (`es`), brand signature `"GymHub by @medandresparra"`.
