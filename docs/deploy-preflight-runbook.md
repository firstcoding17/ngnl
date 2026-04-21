# Deploy Preflight Runbook

## Goal
Run one quick API preflight plus one real UI smoke after AWS demo deployment without changing product code.

This runbook is intentionally split in two layers:
- API preflight: fast endpoint and runtime check
- UI preflight: real upload -> runtime -> artifact -> report -> chat flows

## Required environment

### API preflight
```bash
export DEPLOY_FRONTEND_URL=https://demo.example.com
export DEPLOY_API_BASE=https://api.example.com
export DEPLOY_API_KEY=your-demo-key
```

Optional:
```bash
export DEPLOY_CLIENT_ID=deploy-preflight-custom-client
```

### UI preflight
```bash
cd swwseos
export PLAYWRIGHT_SKIP_WEBSERVER=1
export PLAYWRIGHT_BASE_URL=https://demo.example.com
export PLAYWRIGHT_API_BASE=https://api.example.com
export PLAYWRIGHT_TEST_API_KEY=your-demo-key
```

Use a dedicated demo/preflight API key when possible so smoke runs do not collide with human demo sessions.
Do not run the API preflight and the UI preflight in parallel with the same key. Run them sequentially.

## Preflight checklist
Before running the script or UI smoke, confirm:
- frontend root is reachable
- backend API base is reachable
- a dedicated demo or preflight API key is ready
- the deployed frontend is pointing at the intended backend base
- optional runtimes may still appear as `fallback` and are acceptable if the reason is explicit

## 1. API preflight

Run:
```bash
bash scripts/deploy-preflight.sh
```

This checks:
- frontend `/`
- frontend `/key`
- backend `/healthz`
- `GET /auth/verify`
- `POST /mcp/chat`
- `GET /ml/capabilities`
- `POST /ml/run`
- `GET /api/image-features/capabilities`
- `POST /api/image-features`
- `POST /auth/logout`

### What to look for
- auth verify returns `200` and a session token
- MCP chat returns `200` and a non-empty `mode/suggestions/cards` summary
- ML run returns `200` and prints a derived state:
  - `direct`
  - `fallback`
  - `blocked`
- image runtime returns `200` and prints:
  - `state`
  - `effectiveRuntime`
  - processed/direct/fallback counts

The script does not assume direct-only execution. `fallback` is acceptable if the reason is explicit and the endpoint still produces a usable result.

### Endpoints covered
- `GET /auth/verify`
- `POST /mcp/chat`
- `POST /ml/run`
- `POST /api/image-features`

These are the minimum runtime-critical endpoints to verify before a live demo.

## 2. UI preflight

Run:
```bash
cd swwseos
npm run test:e2e:deploy-preflight
```

This spec uses three example flows:
1. structured regression dataset
2. text dataset with downstream text runtime
3. multi-dataset join with downstream stat/report/chat

Each flow checks:
- upload
- preview
- prepared or derived dataset creation
- artifact
- report
- right panel render
- chat explanation
- runtime status block visibility

### Why these three flows
- structured regression: verifies tabular upload, task/analysis creation, ML artifact/report, and chat
- text runtime: verifies derived text features, downstream ML, runtime status, and chat
- multi-dataset join: verifies joined/prepared source generation plus stat/report/chat on linked data

## Example datasets used by the UI preflight
- [`demo_regression_revenue.csv`](../tests/e2e/fixtures/demo_regression_revenue.csv)
- [`demo_text_reviews.csv`](../tests/e2e/fixtures/demo_text_reviews.csv)
- [`demo_join_profiles.csv`](../tests/e2e/fixtures/demo_join_profiles.csv)
- [`demo_join_feedback.csv`](../tests/e2e/fixtures/demo_join_feedback.csv)

## direct / fallback / blocked interpretation

### ML
- `direct`: backend ML runtime executed normally
- `fallback`: backend downgraded to a safe fallback runtime
- `blocked`: request could not produce a usable runtime result

### Image
- `direct`: OpenCV-backed runtime succeeded for all rows
- `fallback`: manifest/reference fallback produced a usable result
- `blocked`: no usable image runtime result

### Chat
The API currently exposes `mode` rather than direct/fallback/blocked. Use:
- `claude` or similar planner mode: direct-like
- `rule-based`: fallback-like but healthy
- request failure / empty response: blocked

## Recommended deployment sequence
1. deploy backend and frontend
2. run `bash scripts/deploy-preflight.sh`
3. run `cd swwseos && npm run test:e2e:deploy-preflight`
4. if either fails, classify the issue as:
   - product bug
   - environment / dependency issue
   - API base / deploy config issue
   - stale test expectation

The API preflight and UI preflight should use the same demo key only in sequence, not at the same time.

## Local staging reproduction
You can dry-run the exact same preflight locally:

```bash
bash scripts/local-staging-up.sh
DEPLOY_FRONTEND_URL="http://127.0.0.1:44180" \
DEPLOY_API_BASE="http://127.0.0.1:45180" \
DEPLOY_API_KEY="local-staging-test-key" \
bash scripts/deploy-preflight.sh

cd swwseos
PLAYWRIGHT_SKIP_WEBSERVER=1 \
PLAYWRIGHT_BASE_URL="http://127.0.0.1:44180" \
PLAYWRIGHT_API_BASE="http://127.0.0.1:45180" \
PLAYWRIGHT_TEST_API_KEY="local-staging-test-key" \
npm run test:e2e:deploy-preflight
```

If your local staging ports differ, use the values printed by `bash scripts/local-staging-up.sh`.
