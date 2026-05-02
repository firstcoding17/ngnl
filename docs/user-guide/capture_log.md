# Capture Log

## 실행 환경

- 초기 문서 캡처 기준: 공개 데모 URL `http://43.203.72.134/`
- blocked/error 복구 검증 기준: 로컬 staging
  - frontend: `http://127.0.0.1:44180`
  - backend: `http://127.0.0.1:45180`
- 실행 시각
  - 초기 문서 캡처: `2026-05-01`
  - blocked/error 복구 및 재캡처: `2026-05-02`
- 접근 방식: API key gate
- 자동화 방식: Playwright 기반 브라우저 자동화 + targeted smoke/preflight
- API 키: 로그, 문서, 스크린샷에 남기지 않음
- 산출물 경로: `swwseos/docs/user-guide/`

## 사용한 데이터셋

- Titanic: `titanic_train_subset_400.csv`
- IMDb: `imdb_reviews_subset_400.csv`
- Cats vs Dogs: `cats_vs_dogs_small_manifest_100.csv`
- Women’s E-Commerce Clothing Reviews: `womens_ecommerce_reviews_subset_400.csv`
- Oil MCP: `oil_prices_fred_long_730.csv`, `oil_news_daily_31.csv`, `oil_public_sources_catalog.csv`, `oil_market_news_joined_365.csv`

## subset 생성 여부

- 예. `swwseos/scripts/prepare_user_guide_datasets.py`로 문서용 subset을 생성했습니다.
- Titanic: 400행
- IMDb: 400행
- Cats vs Dogs: cat 50장 + dog 50장, 총 100장
- Women’s E-Commerce Clothing Reviews: 400행
- Oil MCP: 가격 730행 long format, 뉴스 일별 집계 31행, 조인 데이터 365행

## 문제 재현 및 원인 분류

| 항목 | 공개 배포 재현 상태 | 로컬 staging 재현 상태 | 주원인 분류 | 세부 판단 |
| --- | --- | --- | --- | --- |
| Titanic ML blocked | `Train model` 단계가 blocked 또는 비활성처럼 보였음 | fallback classification 결과 생성 성공 | `기타 런타임 문제` | 공개 배포는 현재 저장소와 다른 backend 라우트 상태로 보였고, 로컬에서는 frontend gating 없이 실행됐습니다. direct ML의 선택적 의존성(`scikit-learn`)은 없지만 fallback은 정상 동작했습니다. |
| IMDb downstream classification blocked | 공개 배포에서 downstream 분류 결과가 blocked 상태였음 | semantic feature + fallback classification 성공 | `기타 런타임 문제` | 로컬 코드 기준으로는 막히지 않았고, 공개 배포가 최신 backend/runtime을 반영하지 못한 상태로 보였습니다. direct estimator 관점에서는 `backend dependency 부족`도 함께 확인됐습니다. |
| Cats vs Dogs image runtime blocked | 공개 배포에서 image runtime이 blocked 상태였음 | fallback classification 결과 생성 성공 | `기타 런타임 문제` | 공개 배포는 image backend 경로가 누락된 상태였고, 로컬은 fallback 경로로 결과를 생성했습니다. direct image runtime 관점에서는 `opencv-python` 부재가 확인됐습니다. |
| Oil MCP follow-up summary 오류 | 공개 배포에서 `MCP chat request failed` 발생 | follow-up summary 응답 성공 | `기타 런타임 문제` | 공개 배포는 `/mcp/chat` 동작이 현재 저장소와 일치하지 않았습니다. 로컬에서는 route는 정상이었고, follow-up summary 품질을 높이기 위해 MCP summary 로직을 보강했습니다. |

## 의존성 점검 결과

- 로컬 Python 환경 점검 결과
  - `pandas`: 설치됨
  - `numpy`: 설치됨
  - `statsmodels`: 설치됨
  - `scikit-learn`: 미설치
  - `opencv-python`: 미설치
  - `shap`: 미설치
  - `pytesseract`: 미설치
- 판단
  - direct ML/image runtime은 선택적 의존성 영향이 있습니다.
  - 현재 저장소 코드는 fallback runtime을 이미 제공하므로, 의존성 부재가 곧바로 “전체 기능 blocked”를 뜻하지는 않습니다.

## 수정 내용

- backend
  - `swwseos_server/services/services/mcpOrchestrator.js`
  - `swwseos_server/services/services/mcpRouteHandlers.js`
  - Oil follow-up summary 프롬프트를 history 기반으로 더 잘 처리하도록 rule-based MCP summary 로직을 보강했습니다.
- test
  - `swwseos_server/tests/test_mcp_manual_flow.js`
  - Oil follow-up summary 케이스를 추가했습니다.
- ops/docs
  - `swwseos_server/requirements-optional.txt`
  - `swwseos_server/README.md`
  - optional Python runtime 설치 경로를 정리했습니다.
- capture
  - `swwseos/scripts/capture_user_guide_screenshots.js`
  - output path override와 IMDb classification 재캡처 흐름을 보강했습니다.

## 실행한 기능

- Titanic: CSV 업로드, 테이블 preview, 생존률 그래프, 통계 리포트, ML classification
- IMDb: CSV 업로드, `review_text` 선택, semantic text feature 생성, downstream classification
- Cats vs Dogs: manifest 업로드, image task 설정, fallback classification
- Oil MCP: dataset context 연결, follow-up summary 요청, final report 카드 확인

## 실행한 검증 명령

- `cd swwseos_server && npm run test:mcp-manual`
- `cd swwseos_server && npm run test:mcp`
- `cd swwseos && PLAYWRIGHT_TEST_API_KEY=local-e2e-test-key npm run test:e2e -- tests/e2e/ml-availability.spec.js tests/e2e/text-semantic-runtime.spec.js tests/e2e/image-runtime.spec.js`
- `bash scripts/local-staging-up.sh`
- `bash scripts/smoke-local-staging.sh`
- `bash scripts/reset-local-staging-e2e.sh`
- `bash -lc 'export DEPLOY_FRONTEND_URL="http://127.0.0.1:44180"; export DEPLOY_API_BASE="http://127.0.0.1:45180"; export DEPLOY_API_KEY="local-staging-test-key"; export DEPLOY_CURL_BIN="curl.exe"; bash scripts/deploy-preflight.sh'`
- `cd swwseos && PLAYWRIGHT_SKIP_WEBSERVER=1 PLAYWRIGHT_BASE_URL=http://127.0.0.1:44180 PLAYWRIGHT_API_BASE=http://127.0.0.1:45180 PLAYWRIGHT_TEST_API_KEY=local-staging-test-key npm run test:e2e:deploy-preflight`
- `cd swwseos && NGNL_CAPTURE_BASE_URL=http://127.0.0.1:44180 NGNL_CAPTURE_OUTPUT_DIR=artifacts/runtime-recovery-screenshots NGNL_CAPTURE_RESULTS_PATH=artifacts/runtime-recovery-results.json node scripts/capture_user_guide_screenshots.js`

## 검증 결과

- MCP manual test: 통과
- MCP automated test: 통과
- ML/text/image e2e availability: 통과
- local staging up: 통과
- local staging smoke: 통과
- local deploy preflight(API): 통과
- local deploy preflight(UI): 통과
- recovery screenshot recapture: 통과

## 공개 배포 점검 결과

- 공개 URL 점검에서 다음 증상이 확인됐습니다.
  - `/mcp/chat`: `405 Not Allowed`
  - `/ml/run`: `405`
  - `/api/image-features`: `404`
  - `/ml/capabilities`: backend JSON 대신 SPA HTML fallback처럼 응답
- 해석
  - 현재 공개 배포는 로컬에서 검증한 최신 backend route set과 일치하지 않습니다.
  - 따라서 공개 배포에서 보였던 blocked/error는 단순 frontend gating 문제라기보다 “배포된 backend 상태 불일치”에 가깝습니다.

## 배포 및 preflight 상태

- 로컬 staging 기준 preflight: 완료
- 원격 재배포: 미수행
- 원격 배포 후 preflight: 미수행
- 미수행 사유
  - 현재 작업 환경에서 사용 가능한 SSH private key가 없었습니다.
  - `$HOME\\.ssh`에는 `known_hosts`만 있었고, 배포에 사용할 키 파일이 없었습니다.
  - `$HOME\\.aws`와 `AWS_*` 환경변수도 확인되지 않았습니다.
  - `ssh ubuntu@43.203.72.134` 비대화형 접속은 `Permission denied (publickey)`로 실패했습니다.

## 수정 전/후 상태 비교

| 화면 | 수정 전 | 수정 후 |
| --- | --- | --- |
| `titanic_06_ml_result.png` | 공개 배포 blocked 화면 | 로컬 staging fallback classification 결과 화면으로 교체 |
| `imdb_05_classification_result.png` | 공개 배포 blocked 화면 | 로컬 staging semantic + classification 결과 화면으로 교체 |
| `catsdogs_04_result.png` | 공개 배포 blocked 화면 | 로컬 staging fallback image classification 결과 화면으로 교체 |
| `oil_06_final_report.png` | 공개 배포 follow-up error 화면 | 로컬 staging follow-up summary 결과 화면으로 교체 |

## 교체한 화면

- `titanic_06_ml_result.png`
- `imdb_05_classification_result.png`
- `catsdogs_04_result.png`
- `oil_06_final_report.png`

## 유지한 화면

- 위 4장을 제외한 나머지 기존 정상 캡처는 유지했습니다.

## 공개 서버 최종본 정책

- 현재 문서 폴더의 4개 복구 화면은 로컬 staging에서 임시로 교체한 실제 실행 화면입니다.
- 최종 사용자 가이드에는 공개 서버 preflight 통과 후 다시 캡처한 공개 서버 기준 이미지로만 사용해야 합니다.
- 공개 서버 재캡처 대상
  - `titanic_06_ml_result.png`
  - `imdb_05_classification_result.png`
  - `catsdogs_04_result.png`
  - `oil_06_final_report.png`

## 아직 캡처하지 못한 화면

- 없음

## 남은 리스크

- 문서 폴더의 최종 4개 교체 화면은 “공개 배포 재배포 후 캡처”가 아니라 “로컬 staging에서 기능 복구 확인 후 재캡처한 실제 실행 화면”입니다.
- direct runtime 품질을 AWS에서도 동일하게 보장하려면 optional dependency 설치와 최신 backend 배포가 추가로 필요합니다.
