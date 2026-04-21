# Deploy Build Runbook

## Goal
Keep local staging builds and deploy builds separated so the frontend does not accidentally ship with the wrong API base.

## Shared API base
The frontend uses one explicit environment variable:

- `VUE_APP_API_BASE`

This single base is used by:
- `/auth/*`
- `/mcp/chat`
- `/ml/run`
- `/api/image-features`

That means chat, ML, and image runtime routes do not need their own extra frontend base variables today.

## Supported build commands

### Local staging build
Use this only for local staging-like verification:

```bash
VUE_APP_API_BASE=http://127.0.0.1:45180 npm run build:local-staging
```

Guardrail:
- this target rejects non-local API bases
- if you accidentally pass a deploy URL here, the build fails early

### Deploy build
Use this for deployment packaging:

```bash
VUE_APP_API_BASE=https://api.example.com npm run build:deploy
```

## Guardrails

### `npm run build`
This command is intentionally guarded.

It will fail unless you choose an explicit target through:
- `npm run build:local-staging`
- `npm run build:deploy`

### Deploy guard
`npm run build:deploy` fails when `VUE_APP_API_BASE` points at:
- `127.0.0.1`
- `localhost`
- `0.0.0.0`
- `::1`

This prevents accidentally generating a deploy bundle that still points at local staging.

## Local staging workflow
Use the wrapper script:

```bash
bash scripts/local-staging-up.sh
```

That script now builds the frontend with:
- `npm run build:local-staging`
- `VUE_APP_API_BASE` set to the staging backend URL chosen by the script

So local staging and deploy builds no longer share the same generic build entry.

## Verification

### Deploy build check
```bash
cd swwseos
VUE_APP_API_BASE=https://api.example.com npm run build:deploy
```

### Local staging check
```bash
bash scripts/local-staging-up.sh
bash scripts/smoke-local-staging.sh
```

## Notes
- If the backend base changes, one `VUE_APP_API_BASE` update is enough for auth, chat, ML, and image runtime routes.
- Playwright local staging verification should use:
  - `PLAYWRIGHT_SKIP_WEBSERVER=1`
  - `PLAYWRIGHT_BASE_URL`
  - `PLAYWRIGHT_API_BASE`
  when reusing an already running local staging stack.
