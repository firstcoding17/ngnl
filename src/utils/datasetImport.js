import Papa from 'papaparse';
import { inferColumnTypes } from './colTypes';

let xlsxModulePromise = null;

async function loadXLSX() {
  if (!xlsxModulePromise) {
    xlsxModulePromise = import('xlsx');
  }
  return xlsxModulePromise;
}

function normalizeCell(value) {
  if (value === undefined || value === null) return '';
  return value;
}

function normalizeRows(rows, columns = []) {
  if (!Array.isArray(rows)) return [];
  return rows
    .filter((row) => row && typeof row === 'object')
    .map((row) => {
      const next = {};
      const targetColumns = columns.length ? columns : Object.keys(row);
      targetColumns.forEach((column) => {
        next[column] = normalizeCell(row[column]);
      });
      return next;
    })
    .filter((row) => Object.values(row).some((value) => String(value ?? '').trim() !== ''));
}

function normalizeColumns(rows, preferredColumns = []) {
  if (Array.isArray(preferredColumns) && preferredColumns.length) {
    return preferredColumns.map((column) => String(column));
  }
  return Object.keys(rows?.[0] || {}).map((column) => String(column));
}

function readJsonRows(text) {
  const parsed = JSON.parse(text);
  if (Array.isArray(parsed)) return parsed;
  if (Array.isArray(parsed?.data)) return parsed.data;
  throw new Error('JSON must be an array of objects or contain a data array.');
}

function columnValueStats(rows, column) {
  const values = (rows || []).map((row) => row?.[column]).filter((value) => value !== '' && value !== null && value !== undefined);
  const unique = new Set(values.map((value) => String(value)));
  const totalTextLength = values.reduce((sum, value) => sum + String(value).length, 0);
  return {
    uniqueCount: unique.size,
    averageTextLength: values.length ? Math.round(totalTextLength / values.length) : 0,
  };
}

function looksLikeImageReference(value) {
  const text = String(value ?? '').trim().toLowerCase();
  if (!text) return false;
  if (text.startsWith('data:image/')) return true;
  if (/\.(png|jpe?g|gif|bmp|webp|svg|tiff?)($|\?)/i.test(text)) return true;
  if ((text.startsWith('http://') || text.startsWith('https://')) && /(image|img|photo|thumbnail|assets)/i.test(text)) return true;
  return false;
}

function detectImageColumns(rows, columns = [], preferredType = 'tabular') {
  return (columns || []).filter((column) => {
    const values = (rows || []).map((row) => row?.[column]).filter((value) => value !== '' && value !== null && value !== undefined);
    if (!values.length) return false;
    const imageHits = values.filter((value) => looksLikeImageReference(value)).length;
    if (!imageHits) return false;
    if (preferredType === 'image') return imageHits >= Math.max(1, Math.ceil(values.length * 0.4));
    return imageHits >= Math.max(2, Math.ceil(values.length * 0.6));
  });
}

export function summarizeDataset(rows, columns, preferredType = 'tabular') {
  const safeRows = Array.isArray(rows) ? rows : [];
  const safeColumns = Array.isArray(columns) ? columns : [];
  const columnTypes = inferColumnTypes(safeRows, safeColumns);
  const columnProfiles = Object.fromEntries(
    safeColumns.map((column) => [column, columnValueStats(safeRows, column)])
  );
  const missingByColumn = {};
  let missingCount = 0;

  safeColumns.forEach((column) => {
    const missing = safeRows.filter((row) => row?.[column] === '' || row?.[column] === null || row?.[column] === undefined).length;
    missingByColumn[column] = missing;
    missingCount += missing;
  });

  const numericColumns = safeColumns.filter((column) => columnTypes[column] === 'number');
  const dateColumns = safeColumns.filter((column) => columnTypes[column] === 'date');
  const categoricalColumns = safeColumns.filter((column) => columnTypes[column] === 'category');
  const imageColumns = detectImageColumns(safeRows, safeColumns, preferredType);
  const imageColumnSet = new Set(imageColumns);
  const textColumns = categoricalColumns.filter((column) =>
    !imageColumnSet.has(column) && (columnProfiles[column]?.averageTextLength || 0) >= 18
  );
  const binaryLikeColumns = categoricalColumns.filter((column) => (columnProfiles[column]?.uniqueCount || 0) === 2);
  const sampleRows = safeRows.slice(0, 6);

  return {
    rowCount: safeRows.length,
    colCount: safeColumns.length,
    missingCount,
    missingByColumn,
    sampleRows,
    columnTypes,
    columnProfiles,
    numericColumns,
    dateColumns,
    categoricalColumns,
    textColumns,
    binaryLikeColumns,
    imageColumns,
    previewColumns: safeColumns.slice(0, 8),
    preferredType,
  };
}

function scoreColumnName(column = '', patterns = []) {
  const normalized = String(column || '').trim().toLowerCase();
  return patterns.reduce((score, pattern) => (pattern.test(normalized) ? score + 1 : score), 0);
}

function isLikelyIdentifierColumn(column = '', profile = {}, rowCount = 0) {
  const normalized = String(column || '').trim().toLowerCase();
  if (!normalized) return false;
  if (/(^id$|^id_|_id$|identifier|uuid|index|rownum|row_id|customerid|orderid|userid|accountid|code$)/i.test(normalized)) {
    return true;
  }
  return false;
}

function sortStructuredCandidates(items = []) {
  return [...items].sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return String(a.column || '').localeCompare(String(b.column || ''));
  });
}

export function buildStructuredTaskRecommendations(summary, dataType = 'tabular') {
  if (!summary || !['tabular', 'multimodal'].includes(dataType)) return [];

  const rowCount = Number(summary.rowCount || 0);
  const colCount = Number(summary.colCount || 0);
  const columnProfiles = summary.columnProfiles || {};
  const textColumns = new Set(summary.textColumns || []);
  const imageColumns = new Set(summary.imageColumns || []);
  const dateColumns = new Set(summary.dateColumns || []);
  const binaryLikeColumns = new Set(summary.binaryLikeColumns || []);
  const categoricalColumns = (summary.categoricalColumns || []).filter(
    (column) => !textColumns.has(column) && !imageColumns.has(column) && !dateColumns.has(column)
  );
  const numericColumns = summary.numericColumns || [];
  const usablePredictorCount = Math.max(
    0,
    colCount - (textColumns.size + imageColumns.size > 0 ? 0 : 1)
  );

  const classificationCandidates = sortStructuredCandidates(
    categoricalColumns
      .map((column) => {
        const profile = columnProfiles[column] || {};
        const uniqueCount = Number(profile.uniqueCount || 0);
        if (uniqueCount < 2) return null;
        const idLike = isLikelyIdentifierColumn(column, profile, rowCount);
        if (idLike) return null;
        const labelScore = scoreColumnName(column, [
          /target/,
          /label/,
          /class/,
          /status/,
          /outcome/,
          /result/,
          /churn/,
          /segment/,
          /group/,
          /type/,
          /flag/,
          /approved/,
        ]);
        const binaryScore = binaryLikeColumns.has(column) ? 4 : 0;
        const compactCardinalityScore = uniqueCount <= 6 ? 2 : uniqueCount <= 12 ? 1 : 0;
        const score = labelScore * 2 + binaryScore + compactCardinalityScore + 1;
        return {
          column,
          score,
          uniqueCount,
          binaryLike: binaryLikeColumns.has(column),
        };
      })
      .filter(Boolean)
  );

  const regressionCandidates = sortStructuredCandidates(
    numericColumns
      .map((column) => {
        const profile = columnProfiles[column] || {};
        const uniqueCount = Number(profile.uniqueCount || 0);
        const idLike = isLikelyIdentifierColumn(column, profile, rowCount);
        if (idLike || uniqueCount < 4) return null;
        const targetLikeScore = scoreColumnName(column, [
          /revenue/,
          /sales/,
          /price/,
          /amount/,
          /total/,
          /profit/,
          /margin/,
          /value/,
          /score/,
          /rate/,
          /days/,
          /duration/,
        ]);
        const predictorLikePenalty = scoreColumnName(column, [
          /visits/,
          /sessions/,
          /tickets/,
          /clicks/,
          /impressions/,
          /leads/,
          /ad_/,
          /spend/,
          /cost/,
          /count/,
        ]);
        const spreadScore = uniqueCount >= Math.max(6, Math.min(12, Math.floor(rowCount * 0.5) || 6)) ? 2 : 1;
        const score = targetLikeScore * 3 + spreadScore + 1 - predictorLikePenalty;
        return {
          column,
          score,
          uniqueCount,
        };
      })
      .filter(Boolean)
  );

  const recommendations = [];
  const topClassification = classificationCandidates[0] || null;
  const topRegression = regressionCandidates[0] || null;

  if (topClassification && topClassification.score >= 4) {
    recommendations.push({
      type: 'classification',
      label: 'Classification analysis',
      targetColumn: topClassification.column,
      confidence: topClassification.binaryLike ? 'high' : 'medium',
      reason: topClassification.binaryLike
        ? `${topClassification.column} looks like a binary outcome column, so classification is the clearest next step.`
        : `${topClassification.column} looks like a compact categorical outcome column (${topClassification.uniqueCount} classes), so classification is a strong next step.`,
    });
  }

  if (topRegression && topRegression.score >= 4) {
    recommendations.push({
      type: 'regression',
      label: 'Regression analysis',
      targetColumn: topRegression.column,
      confidence: 'medium',
      reason: `${topRegression.column} looks like a continuous numeric outcome column, and ${Math.max(1, usablePredictorCount)} other columns can support a regression baseline.`,
    });
  }

  if (!recommendations.length) {
    recommendations.push({
      type: 'distribution',
      label: 'Start with graph and statistics',
      targetColumn: '',
      confidence: 'high',
      reason: 'No clear target candidate stands out yet, so distribution and correlation checks are the safest first step.',
    });
  } else if (!recommendations.some((item) => item.type === 'distribution')) {
    recommendations.push({
      type: 'distribution',
      label: 'Graph and statistics check',
      targetColumn: '',
      confidence: 'medium',
      reason: 'Validate the main drivers with distribution and correlation checks before committing to a model path.',
    });
  }

  return recommendations.slice(0, 3);
}

export function buildPreprocessingRecommendations(summary, dataType = 'tabular') {
  if (!summary) return [];

  const items = [];
  if (summary.missingCount > 0) {
    items.push({
      id: 'handle-missing',
      label: '결측치 처리',
      group: '기본 정리',
      recommended: true,
      reason: `${summary.missingCount.toLocaleString()}개의 결측치가 감지되어 기본 정리가 필요합니다.`,
    });
  }
  if (summary.binaryLikeColumns.length > 0 && ['tabular', 'multimodal'].includes(dataType)) {
    items.push({
      id: 'binary-mapping',
      label: '이진 텍스트를 0/1로 변환',
      group: '정형 데이터',
      recommended: true,
      reason: `${summary.binaryLikeColumns.length}개의 이진 후보 컬럼이 있어 바로 수치화할 수 있습니다.`,
    });
  }
  if (summary.categoricalColumns.length > 0 && ['tabular', 'multimodal'].includes(dataType)) {
    items.push({
      id: 'categorical-encoding',
      label: '범주형 인코딩',
      group: '정형 데이터',
      recommended: true,
      reason: `${summary.categoricalColumns.length}개의 범주형 컬럼이 있어 모델 입력 전 인코딩이 유용합니다.`,
    });
  }
  if (summary.dateColumns.length > 0 && ['tabular', 'multimodal'].includes(dataType)) {
    items.push({
      id: 'date-features',
      label: '날짜형 파생 변수 생성',
      group: '정형 데이터',
      recommended: true,
      reason: `${summary.dateColumns.length}개의 날짜형 컬럼을 기준으로 시계열/주기 패턴을 만들 수 있습니다.`,
    });
  }
  if (summary.textColumns.length > 0 && ['text', 'multimodal'].includes(dataType)) {
    items.push(
      {
        id: 'tfidf',
        label: 'TF-IDF 변환',
        group: '텍스트',
        recommended: true,
        reason: `${summary.textColumns.length}개의 텍스트 컬럼에서 키워드 기반 특징을 바로 만들 수 있습니다.`,
      },
      {
        id: 'sentiment',
        label: '감정 점수화',
        group: '텍스트',
        recommended: false,
        reason: '자유 텍스트를 빠르게 수치화해 분류/회귀 입력으로 활용할 수 있습니다.',
      },
      {
        id: 'embedding',
        label: '임베딩 변환',
        group: '고급 옵션',
        recommended: false,
        reason: '문맥 정보를 유지한 표현이 필요할 때 고급 옵션으로 사용할 수 있습니다.',
      },
    );
  }
  if (Array.isArray(summary.imageColumns) && summary.imageColumns.length > 0 && ['image', 'multimodal'].includes(dataType)) {
    items.push(
      {
        id: 'image-preview',
        label: '이미지 기본 미리보기',
        group: '이미지',
        recommended: true,
        reason: '이미지 품질과 라벨 연결 여부를 빠르게 확인하는 기본 단계입니다.',
      },
      {
        id: 'image-embedding',
        label: '이미지 특징 추출',
        group: '이미지',
        recommended: false,
        reason: '분류나 검색을 위한 특징 벡터가 필요할 때 사용합니다.',
      },
    );
  }

  return items;
}

export function buildPreviewAnalysisRecommendations(summary, dataType = 'tabular') {
  if (!summary) return [];

  const items = [
    {
      id: 'distribution',
      label: '분포 미리보기',
      reason: '데이터가 어떤 범위와 분포를 가지는지 먼저 확인합니다.',
      recommended: summary.numericColumns.length > 0,
    },
    {
      id: 'missingness',
      label: '결측치 분석',
      reason: '누락 패턴이 있는지 먼저 확인해 전처리 우선순위를 잡습니다.',
      recommended: summary.missingCount > 0,
    },
  ];

  if (summary.numericColumns.length >= 2) {
    items.push({
      id: 'correlation',
      label: '상관관계 미리보기',
      reason: '수치형 컬럼 사이의 관계를 먼저 확인해 회귀나 특징 선택에 도움을 줍니다.',
      recommended: true,
    });
  }
  if (summary.textColumns.length > 0 && ['text', 'multimodal'].includes(dataType)) {
    items.push({
      id: 'text-overview',
      label: '텍스트 길이/빈도 확인',
      reason: '문장 길이와 주요 텍스트 패턴을 먼저 파악합니다.',
      recommended: true,
    });
  }
  if (summary.categoricalColumns.length > 0) {
    items.push({
      id: 'class-balance',
      label: '클래스 불균형 확인',
      reason: '분류 문제 여부와 타깃 편중을 빠르게 확인합니다.',
      recommended: true,
    });
  }

  return items;
}

export async function readDatasetFile(file, preferredType = 'tabular') {
  const fileName = String(file?.name || 'dataset').trim() || 'dataset';
  const extension = fileName.includes('.') ? fileName.split('.').pop().toLowerCase() : '';

  if (extension === 'json' || /application\/json/i.test(String(file?.type || ''))) {
    const rawText = (await file.text()).replace(/^\uFEFF/, '');
    const rows = normalizeRows(readJsonRows(rawText));
    const columns = normalizeColumns(rows);
    return {
      name: fileName.replace(/\.[^.]+$/, ''),
      source: 'file',
      format: 'json',
      rows,
      columns,
      summary: summarizeDataset(rows, columns, preferredType),
    };
  }

  if (extension === 'xlsx' || extension === 'xls' || /sheet/i.test(String(file?.type || ''))) {
    const XLSX = await loadXLSX();
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: 'array' });
    const firstSheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[firstSheetName];
    const rows = normalizeRows(XLSX.utils.sheet_to_json(sheet, { defval: '' }));
    const columns = normalizeColumns(rows);
    return {
      name: fileName.replace(/\.[^.]+$/, ''),
      source: 'file',
      format: 'xlsx',
      rows,
      columns,
      summary: summarizeDataset(rows, columns, preferredType),
    };
  }

  const rawText = (await file.text()).replace(/^\uFEFF/, '');
  const parsed = Papa.parse(rawText, {
    header: true,
    skipEmptyLines: 'greedy',
    worker: false,
  });

  if (Array.isArray(parsed.errors) && parsed.errors.length && !Array.isArray(parsed.data)) {
    throw new Error(parsed.errors[0]?.message || 'CSV parsing failed.');
  }

  const parsedRows = Array.isArray(parsed.data) ? parsed.data : [];
  const columns = Array.isArray(parsed.meta?.fields) && parsed.meta.fields.length
    ? parsed.meta.fields.map((field) => String(field))
    : normalizeColumns(parsedRows);
  const rows = normalizeRows(parsedRows, columns);

  return {
    name: fileName.replace(/\.[^.]+$/, ''),
    source: 'file',
    format: 'csv',
    rows,
    columns,
    summary: summarizeDataset(rows, columns, preferredType),
    diagnostics: {
      rawLength: rawText.length,
      parsedRows: parsedRows.length,
      parsedFields: columns,
    },
  };
}
