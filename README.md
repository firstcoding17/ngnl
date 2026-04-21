# swwseos

## Project setup
```
npm install
```

### Compiles and hot-reloads for development
```
npm run serve
```

### Build guardrails
`npm run build` is intentionally guarded and will fail unless you choose an explicit build target.

Use one of these instead:

Local staging-style build:
```bash
VUE_APP_API_BASE=http://127.0.0.1:45180 npm run build:local-staging
```

This target only accepts a local loopback API base such as:
- `127.0.0.1`
- `localhost`
- `0.0.0.0`
- `::1`

Deploy build:
```bash
VUE_APP_API_BASE=https://api.example.com npm run build:deploy
```

This target rejects local loopback API bases on purpose.

The same `VUE_APP_API_BASE` is used by:
- `/auth/*`
- `/mcp/chat`
- `/ml/run`
- `/api/image-features`

That keeps auth, chat, ML, and image runtime calls on one explicit API base.

### Lints and fixes files
```
npm run lint
```

## Playwright E2E

Run this only against local or staging environments. Do not point Playwright at the production server IP. By default it uses frontend `127.0.0.1:4173` and backend `127.0.0.1:5100`.

### 1. Install dependencies
Frontend:
```bash
npm install
npm run test:e2e:install
```

Backend:
```bash
cd ../swwseos_server
npm install
```

### 2. Required environment variable
PowerShell:
```powershell
$env:PLAYWRIGHT_TEST_API_KEY='your-test-api-key'
```

Optional:
- `PLAYWRIGHT_BASE_URL`: override frontend base URL
- `PLAYWRIGHT_API_BASE`: override backend base URL
- `PLAYWRIGHT_FRONTEND_PORT`: defaults to `4173`
- `PLAYWRIGHT_BACKEND_PORT`: defaults to `5100`
- `PLAYWRIGHT_SKIP_WEBSERVER=1`: use already-running frontend/backend instances

### 3. Run tests
Auto-start frontend and backend:
```bash
npm run test:e2e
```

Run with a visible browser:
```bash
npm run test:e2e:headed
```

These commands automatically start:
- frontend: `npm run serve:e2e`
- backend: `cd ../swwseos_server && npm run start:e2e`

### 4. Included scenarios
- enter API key and complete `/auth/verify`
- upload CSV and confirm Workspace Log, preview, and DataGrid
- refresh and restore workspace draft
- block duplicate access from another browser context using the same API key
- verify Workspace Log updates, Save button state, and Recent Datasets rendering

### 5. Failure diagnostics
- HTML report: `playwright-report/`
- traces, videos, and screenshots are kept on failure
- `tests/e2e/fixtures/test.js` captures browser console output, page errors, request failures, and HTTP 4xx/5xx responses as test artifacts
- local staging smoke resets the E2E session state automatically through `POST /__e2e__/reset`
- Playwright uses the shared reset fixture only for local/e2e API bases by default
- if you intentionally run against a non-local environment that exposes the reset endpoint, opt in explicitly with `PLAYWRIGHT_E2E_RESET=1`

### Customize configuration
See [Configuration Reference](https://cli.vuejs.org/config/).

## Deploy build runbook
See [`docs/deploy-build-runbook.md`](./docs/deploy-build-runbook.md) for:
- local staging build vs deploy build separation
- required env vars
- guardrail behavior
- exact build and verification commands

## Deploy preflight
See [`docs/deploy-preflight-runbook.md`](./docs/deploy-preflight-runbook.md) for:
- post-deploy API preflight
- post-deploy UI smoke with example datasets
- direct / fallback / blocked interpretation
- the exact 4 runtime-critical endpoints to confirm before a demo:
  - `/auth/verify`
  - `/mcp/chat`
  - `/ml/run`
  - `/api/image-features`

## AWS demo deploy
See [`docs/aws-demo-deploy-runbook.md`](./docs/aws-demo-deploy-runbook.md) for:
- pre-deploy checklist
- safe demo deployment order
- post-deploy smoke steps
- rollback criteria and rollback order
- demo-day limitations and cautions
