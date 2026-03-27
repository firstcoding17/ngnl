# swwseos

## Project setup
```
npm install
```

### Compiles and hot-reloads for development
```
npm run serve
```

### Compiles and minifies for production
```
npm run build
```

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

### Customize configuration
See [Configuration Reference](https://cli.vuejs.org/config/).
