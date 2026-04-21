# AWS Demo Deploy Runbook

## Goal
Use one short, repeatable procedure for professor demo deployment so we can:
- build the right frontend bundle
- deploy without mixing local staging env into production-like hosting
- verify the demo immediately after deploy
- roll back quickly if the demo path is not healthy

This runbook is intentionally small and should be used together with:
- [`deploy-build-runbook.md`](./deploy-build-runbook.md)
- [`deploy-preflight-runbook.md`](./deploy-preflight-runbook.md)

## Quick sequence
1. confirm env, build, example datasets, and local verification state
2. run `VUE_APP_API_BASE=https://api.example.com npm run build:deploy`
3. deploy backend, then frontend
4. run API preflight
5. run UI preflight
6. if either fails, roll back immediately

## 1. Pre-deploy Checklist

Confirm all of these before touching the AWS demo server.

### Env
- frontend deploy build uses the real API base through `VUE_APP_API_BASE`
- backend demo env is already prepared on AWS
- use a dedicated demo or preflight API key for smoke checks
- confirm the public frontend URL and API URL you will test after deploy

### Build
Run:

```bash
cd swwseos
VUE_APP_API_BASE=https://api.example.com npm run build:deploy
```

Expected:
- build passes
- no local hostnames are used in `VUE_APP_API_BASE`

### Example datasets
Keep these ready for post-deploy smoke:
- `tests/e2e/fixtures/demo_regression_revenue.csv`
- `tests/e2e/fixtures/demo_text_reviews.csv`
- `tests/e2e/fixtures/demo_join_profiles.csv`
- `tests/e2e/fixtures/demo_join_feedback.csv`

### Core test state
Before deploy, the local baseline should already be green:
- local staging up
- local smoke pass
- deploy preflight API script pass
- deploy UI preflight pass

Minimum confidence target before deploy:
- `build:deploy` passes
- `bash scripts/local-staging-up.sh` passes
- `bash scripts/smoke-local-staging.sh` passes

## 2. Deploy Procedure

Use your existing AWS deployment method for file copy, service restart, nginx, or process manager. Do not change production config during the demo window unless required.

Recommended order:
1. build the frontend deploy bundle
2. deploy backend release
3. deploy frontend release
4. restart or reload only the required services
5. confirm the public frontend and API URLs

Minimum frontend build command:

```bash
cd swwseos
VUE_APP_API_BASE=https://api.example.com npm run build:deploy
```

If your AWS procedure has a standard release command, use that exact command after the build step rather than improvising during the demo.

## 3. Post-deploy Smoke Checklist

### API preflight
Run:

```bash
DEPLOY_FRONTEND_URL=https://demo.example.com \
DEPLOY_API_BASE=https://api.example.com \
DEPLOY_API_KEY=your-demo-key \
bash scripts/deploy-preflight.sh
```

Must pass:
- `/auth/verify`
- `/mcp/chat`
- `/ml/run`
- `/api/image-features`

Quick accept criteria:
- auth succeeds
- chat returns a healthy mode and non-empty guidance
- ML/image return `direct` or `fallback` with explicit reasons
- no critical endpoint is `blocked` without a demo-safe alternative

### UI preflight
Run:

```bash
cd swwseos
PLAYWRIGHT_SKIP_WEBSERVER=1 \
PLAYWRIGHT_BASE_URL=https://demo.example.com \
PLAYWRIGHT_API_BASE=https://api.example.com \
PLAYWRIGHT_TEST_API_KEY=your-demo-key \
npm run test:e2e:deploy-preflight
```

This checks 3 demo-safe flows:
1. structured regression
2. text runtime
3. multi-dataset join

### Manual spot-check
Open the public frontend and confirm:
- main page opens
- key entry works
- one recent or example dashboard opens
- runtime status block is visible where relevant
- right panel and chat panel still open normally

If time is tight, these are the highest-value manual checks:
1. key entry works
2. one structured demo dashboard completes
3. chat panel opens and explains the current result

## 4. Rollback Criteria

Roll back immediately if any of these are true after deploy:
- frontend root does not load
- `/auth/verify` fails
- `deploy-preflight.sh` fails on auth, chat, ML, or image runtime
- UI preflight fails on any of the 3 core flows
- professor demo path depends on a feature that now shows `blocked` without an acceptable fallback

Simple rollback decision rule:
- if API preflight fails, roll back
- if UI preflight fails, roll back
- if the only issue is `fallback` and the flow is still usable, continue with caution

## 5. Rollback Procedure

Use the previous known-good release for both frontend and backend.

Recommended order:
1. stop further demo interaction on the broken release
2. restore the previous backend release
3. restore the previous frontend release
4. restart or reload only the required services
5. rerun the API preflight
6. rerun the UI preflight if time allows

Minimum rollback success condition:
- frontend loads
- `/auth/verify` succeeds
- one structured demo flow works again

Rollback checklist:
- previous backend release restored
- previous frontend release restored
- required services restarted or reloaded
- API preflight rerun
- if time allows, UI preflight rerun

## 6. Demo-day Notes

- Prefer one dedicated demo API key that is not shared with smoke runs from another machine.
- Keep one structured dataset and one text or multi-dataset demo path ready in case an optional direct runtime falls back.
- If a runtime shows `fallback`, that is acceptable as long as:
  - the artifact is produced
  - the report is produced
  - the UI explains the reason clearly
- Avoid deploying immediately before the live demo unless the pre-deploy checks and post-deploy smoke both pass cleanly.

## 7. Known Limitations

- `direct` runtime depends on optional packages installed on the AWS server.
  - ML: `sklearn`
  - image runtime: `opencv-python`
  - OCR: `pytesseract` and `tesseract`
- Some tasks may show `fallback` instead of `direct` on AWS even though the flow remains usable.
- Frontend build still reports an asset size warning.
- Frontend build still reports a `browserslist` data warning.
- These warnings are not current blockers for the professor demo, but they should stay on the post-demo cleanup list.
