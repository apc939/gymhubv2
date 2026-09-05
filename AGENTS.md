# AGENTS.md

This file provides system instructions and architecture rules for AI coding assistants (Antigravity, Gemini, Claude, Cursor, Codex) working on **GymHub by @medandresparra** (forked from OpenGym).

## Project Overview

GymHub is a self-hosted gym & body-weight tracker PWA tailored for clinical and personal exercise prescription. It uses a 2-container architecture (`api` + `web`) with WebAuthn Passkeys (Face ID / Touch ID / PIN) and local/cloud persistent storage.

- **Frontend**: React 19 + Vite (built to static files, served by Nginx).
- **Backend**: Node.js microservice (`api/server.js`), zero external web framework, WebAuthn via `@simplewebauthn/server`.
- **Database**: Flat JSON database (`/data/db.json`, `/data/state-<uid>.json`) using atomic rename writes.
- **Clinical Manager**: `clinical/clinical-manager.mjs` manages patient routines and clinical archetypes remotely via HTTPS.
- **Production Host**: Railway (`https://web-production-5a975.up.railway.app`).

---

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
- **Binding Rule**: Always bind explicitly to dual-stack:
  ```javascript
  server.listen({ port: PORT, host: '::', ipv6Only: false }, ...)
  ```
- **ES Module Rule**: `api/package.json` specifies `"type": "module"`. Never use CommonJS `__dirname`; use `fileURLToPath(import.meta.url)`.
- **Admin Privilege**: User `"Andrés Parra Charris"` or the first user in `db.users` automatically receives Master Admin privileges (`admin: true`).

#### Service `web`
- **Root Directory**: `/`
- **Dockerfile**: `web/Dockerfile`
- **Public Domain**: Assigned in Railway (e.g. `web-production-5a975.up.railway.app`).
- **Required Environment Variables**:
  - `PORT`: `80` (**CRITICAL**: Railway routes internet traffic to `PORT`. Must be `80`, never `3000`).
  - `BACKEND`: `api.railway.internal` (**CRITICAL**: Must point to `api`, never to `web` or `${{RAILWAY_PRIVATE_DOMAIN}}` which points to `web` itself).
  - `BACKEND_PORT`: `3000` (Port of the `api` container).
- **Dynamic DNS Resolution**:
  - Nginx static `proxy_pass http://host:port` caches the resolved IP indefinitely. When `api` restarts, Railway assigns a new internal IP, causing 502/504 errors if Nginx is not dynamic.
  - Nginx configuration (`web/nginx.conf.template`) must use dynamic variable resolution:
    ```nginx
    resolver ${NGINX_LOCAL_RESOLVERS} [fd12::10] 127.0.0.11 1.1.1.1 valid=5s ipv6=on;
    location ^~ /api/ {
        set $backend_upstream "${BACKEND}:${BACKEND_PORT}";
        proxy_pass http://$backend_upstream;
        ...
    }
    ```
  - `web/18-clean-backend-env.envsh` auto-sanitizes variables at boot, auto-correcting any `web.railway.internal` typo to `api.railway.internal`.

### 2. Clinical Archetypes & Remote Management

- Clinical archetypes live in `clinical/archetypes/` and are copied to `api/archetypes/` at build time (`nivel0_sedentario.json`, `nivel1_bandas_mancuernas.json`, `nivel2_salud_postural.json`).
- `api/server.js` automatically populates `/data/archetypes/` on boot if missing.
- `clinical/clinical-manager.mjs` connects directly to Railway production using `x-admin-key`:
  ```bash
  node clinical/clinical-manager.mjs list
  node clinical/clinical-manager.mjs invite "Nombre Paciente" nivel0
  node clinical/clinical-manager.mjs assign "<user_id>" nivel1
  node clinical/clinical-manager.mjs report "<user_id>"
  ```

### 3. WebAuthn / Passkeys Requirements

- Single-origin requirement: The browser must interact with the frontend and backend on the same origin (`/api/...` proxied via Nginx).
- `RP_ID` must match the browser's hostname exactly (e.g. `web-production-5a975.up.railway.app`).
- `ORIGIN` must match the full canonical HTTPS URL (`https://web-production-5a975.up.railway.app`).

### 4. Code Standards & Testing

- All API tests (`api/test/`) must pass: `npm --prefix api test` (150/150 passing).
- All Frontend unit tests (`frontend/src/lib/*.test.js`) must pass: `npm --prefix frontend test`.
- Progression engine and lifting logic must never be modified without companion unit tests.
- Rebranding tokens: Light theme with Sky accent by default, Spanish language (`es`), brand signature `"GymHub by @medandresparra"`.
