# Screenshot Plan

기준 메모:
- 대부분의 화면은 공개 데모 URL에서 캡처했습니다.
- `titanic_06_ml_result.png`, `imdb_05_classification_result.png`, `catsdogs_04_result.png`, `oil_06_final_report.png`는 2026-05-02에 로컬 staging에서 실제 실행 후 재캡처해 교체했습니다.
- 위 4장은 임시 대체본입니다. 공개 서버 preflight가 통과하면 공개 서버 기준으로 다시 캡처해 최종본으로 교체해야 합니다.
- API 키는 모든 스크린샷에서 제거하거나 가려지지 않도록 입력 이후 화면만 사용했습니다.

| 파일명 | 시나리오 | 화면 목적 | 강조 요소 | 문서용 캡션 | 비고 |
| --- | --- | --- | --- | --- | --- |
| `common_01_api_key.png` | 공통 | API 키 입력 게이트 확인 | `API Key` 입력창 / 확인 버튼 | 전달받은 API 키를 입력해 테스트 환경에 접속합니다. | 실제 배포 URL 첫 진입 화면입니다. |
| `common_02_main_screen.png` | 공통 | 메인 작업 화면 소개 | `File` / `Graph` / `Stat` 탭 | 메인 화면에서 데이터 업로드, 그래프 생성, 통계 분석 기능으로 이동할 수 있습니다. | 현재 배포 UI는 대시보드형 워크스페이스 구조입니다. |
| `titanic_01_upload.png` | Titanic | CSV 업로드 시작 화면 | `File` 탭 / 업로드 영역 / `titanic_train_subset_400.csv` | File 메뉴에서 Titanic CSV 파일을 업로드합니다. | 400행 subset을 사용했습니다. |
| `titanic_02_table_preview.png` | Titanic | 업로드 후 테이블 미리보기 | `Survived` / `Pclass` / `Sex` | 업로드된 데이터는 표 형태로 미리 확인할 수 있습니다. | 같은 표에서 `Age`, `Fare`도 확인 가능합니다. |
| `titanic_03_graph_setting.png` | Titanic | 생존률 그래프 설정 화면 | `Graph` 탭 / 차트 설정 영역 / 축 선택 영역 | 분석할 컬럼과 그래프 종류를 선택해 시각화를 생성합니다. | 현재 UI는 별도 Generate 버튼 없이 설정 즉시 갱신됩니다. |
| `titanic_04_graph_result.png` | Titanic | 성별 생존률 그래프 결과 | 생성된 막대 그래프 / `female` 막대 / `male` 막대 | 그래프를 통해 성별에 따른 생존률 차이를 확인할 수 있습니다. | 결과가 잘 보이도록 차트 영역 중심으로 캡처했습니다. |
| `titanic_05_stat_result.png` | Titanic | 통계 분석 결과 확인 | `Stat` 탭 / 통계 리포트 제목 / 요약 카드 | 통계 분석을 통해 변수 간 관계를 수치로 확인할 수 있습니다. | 배포 환경에서는 기초통계 리포트가 가장 안정적으로 생성됐습니다. |
| `titanic_06_ml_result.png` | Titanic | ML 분류 결과 확인 | target=`Survived` / accuracy / confusion matrix | 선택한 target을 기준으로 분류 모델을 실행하고 핵심 성능 지표를 확인할 수 있습니다. | 로컬 staging에서 재캡처한 실제 결과 화면입니다. fallback runtime으로 UI 차단 없이 결과가 생성됐습니다. |
| `error_titanic_ml_optional.png` | Titanic 오류 보조 | 초기 blocked 상태 보조 기록 | `Train model` 버튼 / 비활성 상태 / 오류 단계 | 초기 공개 배포 점검 시 학습 단계가 막혀 있던 상태를 별도 기록했습니다. | 복구 전 상태를 남겨둔 참고용 보조 캡처입니다. |
| `imdb_01_table_preview.png` | IMDb | 텍스트 데이터 테이블 확인 | `review_text` / `label` / 예시 행 | 리뷰 텍스트와 감성 라벨이 포함된 데이터를 업로드합니다. | positive 200건, negative 200건 subset입니다. |
| `imdb_02_text_column_select.png` | IMDb | 텍스트 컬럼 선택 화면 | Text column 드롭다운 / `review_text` / target 영역 | 분석할 텍스트 컬럼을 선택합니다. | 문서 가독성을 위해 핵심 선택 상태만 남겼습니다. |
| `imdb_03_text_runtime.png` | IMDb | 텍스트 분석 방식 선택 | 분석 방식 선택 / `tfidf` / 실행 버튼 | 텍스트 데이터를 분석할 방법을 선택하고 실행합니다. | 초기 공통 흐름 설명용 캡처입니다. |
| `imdb_04_text_result.png` | IMDb | 텍스트 feature 결과 확인 | TF-IDF 결과 카드 / 파생 feature 수 / 상위 용어 | 분석 결과는 feature, 요약 카드 형태로 확인할 수 있습니다. | 실제 artifact가 생성된 화면입니다. |
| `imdb_05_classification_result.png` | IMDb | 텍스트 분류 결과 확인 | target=`label` / classification metrics / confusion matrix | 텍스트 feature를 활용해 긍정·부정 분류 결과를 확인할 수 있습니다. | 로컬 staging에서 재캡처한 실제 결과 화면입니다. semantic feature와 fallback classification 결과가 함께 표시됩니다. |
| `catsdogs_01_upload.png` | Cats vs Dogs | 이미지 데이터 업로드 화면 | 업로드 영역 / 지원 파일 선택 / manifest 파일명 | 이미지 파일 또는 이미지 폴더 정보를 담은 파일을 업로드합니다. | 문서용으로 CSV manifest 방식을 사용했습니다. |
| `catsdogs_02_preview.png` | Cats vs Dogs | 이미지 데이터 미리보기 | preview 영역 / `label` / 이미지 행 요약 | 업로드된 이미지 데이터는 미리보기 화면에서 확인할 수 있습니다. | 배포 UI 특성상 썸네일보다는 이미지 행 요약이 먼저 표시됩니다. |
| `catsdogs_03_analysis_setting.png` | Cats vs Dogs | 이미지 분석 설정 화면 | image column / `label` / 실행 설정 영역 | 이미지 분석에 사용할 라벨과 분석 방식을 설정합니다. | `Use source dataset` 기준으로 설정했습니다. |
| `catsdogs_04_result.png` | Cats vs Dogs | 이미지 분류 결과 확인 | target=`label` / accuracy·f1 / confusion matrix | 이미지 데이터에 대한 분류 결과와 핵심 성능 지표를 확인할 수 있습니다. | 로컬 staging에서 재캡처한 실제 결과 화면입니다. fallback runtime이 작동해 결과 생성까지 완료됐습니다. |
| `catsdogs_05_limitations.png` | Cats vs Dogs | 이미지 기능 제한 안내 | blocked 안내 / 의존성 안내 / 제한 문구 | 이미지 기능은 테스트 단계이며 일부 런타임이나 형식에 제한이 있을 수 있습니다. | 초기 공개 배포 점검에서 남겨둔 제한 안내 화면입니다. |
| `ecommerce_01_table_preview.png` | E-Commerce | 혼합 데이터 테이블 확인 | `Age` / `Rating` / `Review Text` | 하나의 데이터 안에 숫자형, 범주형, 텍스트 컬럼이 함께 포함될 수 있습니다. | `Recommended IND`도 같은 표에서 확인됩니다. |
| `ecommerce_02_structured_graph.png` | E-Commerce | 정형 그래프 결과 확인 | `Department Name` / `Rating` / 그래프 결과 | 정형 컬럼을 기준으로 평점 분포나 카테고리별 차이를 확인합니다. | 부서별 평균 평점 그래프입니다. |
| `ecommerce_03_text_analysis_setting.png` | E-Commerce | 텍스트 분석 설정 화면 | `Review Text` / `tfidf` / 실행 버튼 | 리뷰 텍스트 컬럼을 선택해 텍스트 분석을 실행합니다. | 혼합 데이터에서도 텍스트 파이프라인을 같은 방식으로 사용합니다. |
| `ecommerce_04_mixed_result.png` | E-Commerce | 혼합 분석 결과 확인 | `Rating` 관련 결과 / 텍스트 결과 / 요약 카드 | 정형 데이터와 텍스트 분석 결과를 함께 해석할 수 있습니다. | 일부 후속 ML 추천은 blocked 상태로 표시됩니다. |
| `oil_01_mcp_prompt.png` | Oil MCP | MCP 요청 입력 화면 | MCP 입력창 / 분석 프롬프트 / 실행 버튼 | 복합적인 국제 이슈를 자연어로 입력해 분석을 요청합니다. | 실제 MCP 패널에 프롬프트를 직접 입력한 화면입니다. |
| `oil_02_analysis_plan.png` | Oil MCP | 분석 계획 확인 | 분석 축 / 사용 데이터 소스 / 초기 응답 영역 | MCP는 복합 질문을 가격, 공급, 수요, 뉴스, 거시경제 분석으로 나누어 처리합니다. | 자동 계획 카드가 아닌 초기 응답 섹션 기준 캡처입니다. |
| `oil_03_price_chart.png` | Oil MCP | 가격 분석 결과 | Brent/WTI 그래프 / 변동 구간 / 축 정보 | 원유 가격 추세와 변동 구간을 시각적으로 확인합니다. | FRED 가격 데이터를 long format으로 준비했습니다. |
| `oil_04_supply_risk.png` | Oil MCP | 공급망 리스크 데이터 화면 | 공급 리스크 표 / 뉴스 집계 / 위험 컬럼 | 공급망 관점에서 원유 시장의 주요 리스크를 정리합니다. | Reuters headline 집계 테이블 기반입니다. |
| `oil_05_news_event_analysis.png` | Oil MCP | 뉴스/이벤트 분석 결과 | 주요 키워드 feature / 결과 테이블 / 텍스트 artifact | 뉴스와 이벤트 데이터를 함께 분석해 시장 위험 신호를 확인합니다. | 뉴스 텍스트에서 파생된 feature dataset 화면입니다. |
| `oil_06_final_report.png` | Oil MCP | 최종 요약 리포트 확인 | 핵심 요약 / 공급 리스크 / Korea watchpoints | 최종 리포트에서는 가격, 공급망, 한국 경제 관찰 포인트를 함께 요약해 확인할 수 있습니다. | 로컬 staging에서 재캡처한 실제 follow-up summary 결과 화면입니다. |
| `oil_07_sources_confidence.png` | Oil MCP | 출처와 신뢰도 정리 | `source_name` / 업데이트 주기 / 신뢰도 메모 | 복합 이슈 분석에서는 사용한 데이터 출처와 한계를 함께 기록하는 것이 중요합니다. | 현재 UI는 출처 카탈로그 테이블 형태로 보여줍니다. |
