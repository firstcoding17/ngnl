import {
  collectArtifactRequirements,
  collectArtifactWarnings,
  inferArtifactRuntimeState,
  resolveArtifactRuntimeReason,
} from '@/utils/runtimeStatus';

function cloneValue(value) {
  if (Array.isArray(value)) return value.map((item) => cloneValue(item));
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, cloneValue(item)]));
  }
  return value;
}

function fmtNumber(value, digits = 3) {
  return Number.isFinite(Number(value)) ? Number(value).toFixed(digits) : '-';
}

function humanize(value = '') {
  const normalized = String(value || '').trim().toLowerCase();
  const aliases = {
    pca: 'PCA',
    tfidf: 'TF-IDF',
    dbscan: 'DBSCAN',
    ocr: 'OCR',
    ml: 'ML',
  };
  if (aliases[normalized]) return aliases[normalized];
  return String(value || '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (match) => match.toUpperCase());
}

function joinValues(values = []) {
  if (!Array.isArray(values)) return String(values || '').trim();
  const cleaned = values.map((value) => String(value || '').trim()).filter(Boolean);
  return cleaned.length ? cleaned.join(', ') : '-';
}

function limitList(values = [], count = 4) {
  return Array.isArray(values) ? values.filter(Boolean).slice(0, count) : [];
}

function summarizeRequest(request = {}) {
  const safeRequest = request && typeof request === 'object' ? request : {};
  const args = safeRequest.args && typeof safeRequest.args === 'object' ? safeRequest.args : {};
  const options = safeRequest.options && typeof safeRequest.options === 'object' ? safeRequest.options : {};
  const lines = [];

  if (safeRequest.op) lines.push(`op=${safeRequest.op}`);
  if (safeRequest.task) lines.push(`task=${safeRequest.task}`);
  if (safeRequest.model) lines.push(`model=${safeRequest.model}`);
  if (safeRequest.method) lines.push(`method=${safeRequest.method}`);
  if (safeRequest.textColumn) lines.push(`text=${safeRequest.textColumn}`);
  if (safeRequest.imageColumn) lines.push(`image=${safeRequest.imageColumn}`);
  if (args.target) lines.push(`target=${args.target}`);
  if (Array.isArray(args.features) && args.features.length) lines.push(`features=${args.features.join(', ')}`);
  ['value', 'group', 'a', 'b', 'column'].forEach((key) => {
    if (args[key]) lines.push(`${key}=${args[key]}`);
  });
  Object.entries(options).forEach(([key, value]) => {
    if (value == null || value === '') return;
    lines.push(`${key}=${Array.isArray(value) ? value.join(', ') : value}`);
  });

  return lines.length ? lines.join(' / ') : 'default request';
}

function collectUsedColumns(artifact = null) {
  const request = artifact?.normalizedRequest || artifact?.request || {};
  const args = request?.args && typeof request.args === 'object' ? request.args : {};
  const columns = new Set();

  [
    request?.textColumn,
    request?.imageColumn,
    request?.targetColumn,
    args?.target,
    args?.value,
    args?.group,
    args?.a,
    args?.b,
    args?.column,
  ].forEach((value) => {
    const nextValue = String(value || '').trim();
    if (nextValue) columns.add(nextValue);
  });

  if (Array.isArray(args?.features)) {
    args.features.map((value) => String(value || '').trim()).filter(Boolean).forEach((value) => columns.add(value));
  }

  return Array.from(columns);
}

function findTable(result, name) {
  return Array.isArray(result?.tables) ? result.tables.find((table) => table?.name === name) || null : null;
}

function buildRuntimeSection(artifact = null) {
  const status = inferArtifactRuntimeState(artifact);
  return {
    availability: status,
    reason: resolveArtifactRuntimeReason(artifact) || (status === 'direct' ? 'The runtime completed without a blocking dependency issue.' : ''),
    requirements: collectArtifactRequirements(artifact),
    warnings: collectArtifactWarnings(artifact),
  };
}

function buildBaseReport({
  type,
  title,
  dashboard,
  task,
  analysis = null,
  artifact,
  sourceDataset = null,
  derivedDataset = null,
  inputs = {},
  results = {},
  interpretation = {},
  nextSteps = [],
}) {
  const status = inferArtifactRuntimeState(artifact);
  const generatedAt = new Date().toISOString();
  const request = artifact?.normalizedRequest || artifact?.request || {};
  const targetColumn = [
    request?.targetColumn,
    request?.args?.target,
    task?.options?.targetColumn,
  ].find((value) => String(value || '').trim()) || '';

  return {
    title: title || `${analysis?.title || task?.title || humanize(type)} report`,
    type,
    status,
    sourceArtifactKind: String(artifact?.kind || '').trim(),
    sourceSignature: String(artifact?.signature || '').trim(),
    generatedAt,
    sections: {
      overview: {
        'Analysis name': analysis?.title || task?.title || humanize(type),
        'Task type': humanize(task?.type || request?.task || type),
        'Analysis method': humanize(analysis?.method || request?.op || request?.method || request?.model || type),
        'Used dataset': derivedDataset?.name || sourceDataset?.name || '-',
        Dashboard: dashboard?.title || '-',
        'Generated at': generatedAt,
        'Run status': status,
      },
      inputs: {
        sourceDatasetId: artifact?.sourceDatasetId || sourceDataset?.id || '',
        derivedDatasetId: artifact?.derivedDatasetId || derivedDataset?.id || '',
        'Used columns': joinValues(collectUsedColumns(artifact)),
        'Target column': targetColumn || '-',
        'Preprocessing mode': task?.preprocessingMode || '-',
        'Request parameters': summarizeRequest(request),
        ...inputs,
      },
      results: {
        'Result summary': artifact?.summary || '-',
        ...results,
      },
      interpretation,
      nextSteps: Array.isArray(nextSteps) ? nextSteps.filter(Boolean) : [],
      runtime: buildRuntimeSection(artifact),
    },
  };
}

function buildCorrReport(context) {
  const topPairs = findTable(context.artifact?.result, 'top_pairs');
  let strongestPositive = '-';
  let strongestNegative = '-';

  if (Array.isArray(topPairs?.rows)) {
    const rows = topPairs.rows
      .map((row) => ({
        a: row[topPairs.columns.indexOf('col_a')],
        b: row[topPairs.columns.indexOf('col_b')],
        corr: Number(row[topPairs.columns.indexOf('corr')]),
      }))
      .filter((item) => item.a && item.b && Number.isFinite(item.corr));
    const positive = [...rows].filter((item) => item.corr >= 0).sort((left, right) => right.corr - left.corr)[0];
    const negative = [...rows].filter((item) => item.corr < 0).sort((left, right) => left.corr - right.corr)[0];
    if (positive) strongestPositive = `${positive.a} ~ ${positive.b} (r=${fmtNumber(positive.corr)})`;
    if (negative) strongestNegative = `${negative.a} ~ ${negative.b} (r=${fmtNumber(negative.corr)})`;
  }

  return buildBaseReport({
    ...context,
    type: 'correlation',
    title: `${context.analysis?.title || 'Correlation'} report`,
    results: {
      'Strongest positive correlation': strongestPositive,
      'Strongest negative correlation': strongestNegative,
      'Pair count reviewed': Array.isArray(topPairs?.rows) ? topPairs.rows.length : 0,
      'Result note': context.artifact?.result?.summary?.conclusion || 'Correlation pairs were reviewed across numeric columns.',
    },
    interpretation: {
      'What this means': context.artifact?.result?.summary?.conclusion || 'Variables with strong correlation move together and may be useful for follow-up modeling.',
      'Watch carefully': 'Correlation can highlight multicollinearity or candidate relationships, but it does not prove causation.',
      'Current limits': 'This report summarizes pairwise relationships only and does not control for confounders.',
    },
    nextSteps: [
      'Open a scatter plot for the strongest variable pair.',
      'Review multicollinearity before fitting a regression model.',
      'Choose a regression or classification task if the target is clear.',
    ],
  });
}

function buildTestsReport(context) {
  const request = context.artifact?.request || {};
  const stats = context.artifact?.result?.summary?.stats || {};
  const pValue = Number(stats?.p_value);
  const decision = Number.isFinite(pValue)
    ? (pValue < 0.05 ? 'Reject the null hypothesis at 0.05.' : 'Do not reject the null hypothesis at 0.05.')
    : 'Decision unavailable.';
  const op = String(request?.op || context.artifact?.result?.op || '').toLowerCase();

  return buildBaseReport({
    ...context,
    type: 'stat-tests',
    title: `${humanize(op || 'Stat test')} report`,
    results: {
      'Test type': humanize(op || 'stat test'),
      Statistic: stats?.t_stat ?? stats?.chi2 ?? stats?.f_stat ?? stats?.w_stat ?? '-',
      'P-value': Number.isFinite(pValue) ? fmtNumber(pValue, 4) : '-',
      Decision: decision,
      'Effect summary': context.artifact?.result?.summary?.conclusion || context.artifact?.summary || '-',
    },
    interpretation: {
      'What this means': context.artifact?.result?.summary?.conclusion || 'Review whether the observed difference is large enough and stable enough to matter.',
      'Watch carefully': 'Check sample size, normality assumptions, and variance balance before treating the outcome as final.',
      'Current limits': 'This result is based on a single test configuration and may need follow-up validation or post-hoc analysis.',
    },
    nextSteps: [
      op === 'anova' ? 'Add a post-hoc comparison to locate which groups differ.' : 'Review whether a follow-up test or model is needed.',
      'Open the related group summary or box plot for context.',
      'Promote the strongest finding into a regression or classification workflow if the target is actionable.',
    ],
  });
}

function buildRegressionReport(context) {
  const metrics = context.artifact?.result?.metrics || {};
  const topFeatures = limitList(context.artifact?.result?.featureImportance, 3)
    .map((item) => `${item?.feature || 'feature'} (${fmtNumber(item?.importance, 4)})`);

  return buildBaseReport({
    ...context,
    type: 'regression',
    title: `${context.analysis?.title || context.task?.title || 'Regression'} report`,
    results: {
      'R^2': fmtNumber(metrics?.r2, 4),
      MAE: fmtNumber(metrics?.mae, 4),
      RMSE: fmtNumber(metrics?.rmse, 4),
      'Top variables': topFeatures.length ? topFeatures.join(', ') : '-',
    },
    interpretation: {
      'What this means': `The current model explains ${fmtNumber(Number(metrics?.r2 || 0) * 100, 1)}% of target variance when R^2 is available.`,
      'Watch carefully': 'Compare error metrics against the business tolerance and review residual spread before trusting the forecast.',
      'Current limits': 'Fallback runtimes or small datasets can understate model headroom compared with a richer estimator search.',
    },
    nextSteps: [
      'Review feature selection and target leakage risks.',
      'Compare another regression model or preprocessing configuration.',
      'Inspect residual diagnostics before promoting this model.',
    ],
  });
}

function buildClassificationReport(context) {
  const metrics = context.artifact?.result?.metrics || {};
  const labels = context.artifact?.result?.errorAnalysis?.labels || [];
  const matrix = context.artifact?.result?.errorAnalysis?.matrix || [];
  const matrixSummary = Array.isArray(matrix) && labels.length
    ? labels.map((label, index) => `${label}: ${(matrix[index] || []).join('/')}`).join(' | ')
    : '-';

  return buildBaseReport({
    ...context,
    type: 'classification',
    title: `${context.analysis?.title || context.task?.title || 'Classification'} report`,
    results: {
      Accuracy: fmtNumber(metrics?.accuracy, 4),
      'Precision (weighted)': fmtNumber(metrics?.precision_weighted, 4),
      'Recall (weighted)': fmtNumber(metrics?.recall_weighted, 4),
      'F1 (weighted)': fmtNumber(metrics?.f1_weighted, 4),
      'Confusion matrix': matrixSummary,
    },
    interpretation: {
      'What this means': 'Use the confusion matrix and weighted metrics together to judge whether the classifier is useful across classes.',
      'Watch carefully': 'Class imbalance and fallback baselines can inflate one metric while hiding weak minority-class behavior.',
      'Current limits': 'This summary does not yet include threshold tuning or calibration review.',
    },
    nextSteps: [
      'Check class balance and misclassification hotspots.',
      'Review whether more informative features or balancing are needed.',
      'Compare a different classifier once the baseline is understood.',
    ],
  });
}

function buildClusteringReport(context) {
  const metrics = context.artifact?.result?.metrics || {};
  const clusterSummary = limitList(context.artifact?.result?.clusterSummary, 6)
    .map((item) => `cluster ${item?.cluster}: ${item?.count}`)
    .join(', ');

  return buildBaseReport({
    ...context,
    type: 'clustering',
    title: `${humanize(context.artifact?.request?.model || 'clustering')} report`,
    results: {
      'Cluster count': metrics?.cluster_count ?? '-',
      'Cluster sizes': clusterSummary || '-',
      Inertia: fmtNumber(metrics?.inertia, 4),
      Silhouette: fmtNumber(metrics?.silhouette, 4),
      'Noise ratio': fmtNumber(metrics?.noise_ratio, 4),
    },
    interpretation: {
      'What this means': 'The reported cluster sizes show how the dataset segments under the current feature set and parameters.',
      'Watch carefully': 'Small or highly imbalanced clusters may indicate unstable segmentation or noisy inputs.',
      'Current limits': 'Cluster quality still depends heavily on feature scaling, distance assumptions, and parameter choices.',
    },
    nextSteps: [
      'Open a PCA projection to inspect separation visually.',
      'Try a different clustering parameter set or feature slice.',
      'Review whether noise-heavy groups need preprocessing first.',
    ],
  });
}

function buildPcaReport(context) {
  const metrics = context.artifact?.result?.metrics || {};
  const explained = Array.isArray(context.artifact?.result?.explainedVarianceRatio)
    ? context.artifact.result.explainedVarianceRatio.map((value) => fmtNumber(value, 3)).join(', ')
    : '-';

  return buildBaseReport({
    ...context,
    type: 'pca',
    title: `${humanize(context.artifact?.request?.model || 'pca')} report`,
    results: {
      'Explained variance ratio': explained,
      'Explained variance total': fmtNumber(metrics?.explained_variance_total, 4),
      'Component count': metrics?.component_count ?? '-',
      'Projection preview': Array.isArray(context.artifact?.result?.projectionPreview) ? `${context.artifact.result.projectionPreview.length} projected rows stored` : '-',
    },
    interpretation: {
      'What this means': 'PCA compresses the feature space so we can inspect dominant directions of variance more easily.',
      'Watch carefully': 'Lower explained variance means more information is lost in the projection.',
      'Current limits': 'PCA is linear and may miss nonlinear structure or class separation.',
    },
    nextSteps: [
      'Use the projection for a 2D or 3D scatter review.',
      'Try clustering on the projected features.',
      'Revisit feature engineering if the explained variance stays low.',
    ],
  });
}

function buildTextFeaturesReport(context) {
  const result = context.artifact?.result || {};
  const method = String(context.artifact?.request?.method || result?.method || '').trim();

  return buildBaseReport({
    ...context,
    type: 'text-features',
    title: `${humanize(method || 'text features')} report`,
    results: {
      'Feature count': result?.featureCount ?? 0,
      'Top terms / tokens': joinValues([
        ...(Array.isArray(result?.topTerms) ? result.topTerms.slice(0, 4) : []),
        ...(Array.isArray(result?.topTokens) ? result.topTokens.slice(0, 4).map((item) => item?.token) : []),
      ]),
      'Top semantic concepts': Array.isArray(result?.topConcepts)
        ? joinValues(result.topConcepts.slice(0, 4).map((item) => `${item?.concept} (${item?.score})`))
        : '-',
      'Average chars / words': `${result?.avgCharLength ?? 0} / ${result?.avgWordCount ?? 0}`,
      'Sentiment summary': result?.sentimentStats ? `avg ${result.sentimentStats.avg}, min ${result.sentimentStats.min}, max ${result.sentimentStats.max}` : '-',
      'Embedding dims': result?.embeddingDims ?? 0,
      'Semantic dims': result?.semanticDims ?? 0,
      'Runtime class': result?.runtimeClass || '-',
    },
    interpretation: {
      'What this means': 'The derived feature table summarizes the text shape so downstream PCA or supervised tasks can reuse it directly.',
      'Watch carefully': result?.runtimeClass === 'semantic'
        ? 'This semantic slice uses a concept lexicon runtime, so it captures broad meaning clusters but not full transformer semantics.'
        : 'Heuristic sentiment or hash-vector embeddings are lightweight helpers, not semantic models.',
      'Current limits': result?.runtimeClass === 'semantic'
        ? 'Transformer-grade semantic encoders and LLM-based interpretation are still outside this runtime slice.'
        : 'Advanced semantic embeddings and LLM-based interpretation are still outside this runtime slice.',
    },
    nextSteps: [
      'Open PCA on the derived text feature table.',
      'Connect the feature table to classification or regression if a target is available.',
      'Upgrade to a semantic embedding runtime when richer language meaning is required.',
    ],
  });
}

function buildImageFeaturesReport(context) {
  const result = context.artifact?.result || {};
  const labels = Array.isArray(result?.labelSummary)
    ? result.labelSummary.slice(0, 4).map((item) => `${item?.label}: ${item?.count}`).join(', ')
    : '-';

  return buildBaseReport({
    ...context,
    type: 'image-features',
    title: `${humanize(context.artifact?.request?.mode || 'image features')} report`,
    results: {
      'Feature count': result?.featureCount ?? 0,
      'Average width / height': `${result?.avgWidth ?? 0} / ${result?.avgHeight ?? 0}`,
      'Processed / failed': `${result?.processedCount ?? 0} / ${result?.failedCount ?? 0}`,
      'Direct / fallback extracts': `${result?.directCount ?? 0} / ${result?.fallbackCount ?? 0}`,
      'Label summary': labels || '-',
    },
    interpretation: {
      'What this means': 'The runtime built a reusable feature table and preview summary from the image manifest.',
      'Watch carefully': 'Fallback extraction can keep the flow moving, but direct OpenCV features will usually be richer.',
      'Current limits': 'OCR, vision embeddings, and multimodal fusion are not part of this slice yet.',
    },
    nextSteps: [
      'Open PCA on the derived image feature table.',
      'Run a classification baseline if labels are available.',
      'Enable the direct OpenCV runtime if richer image features are needed.',
    ],
  });
}

function buildImageOcrReport(context) {
  const result = context.artifact?.result || {};
  const tokens = Array.isArray(result?.topTokens)
    ? result.topTokens.slice(0, 5).map((item) => `${item?.token}: ${item?.count}`).join(', ')
    : '-';
  const labels = Array.isArray(result?.labelSummary)
    ? result.labelSummary.slice(0, 4).map((item) => `${item?.label}: ${item?.count}`).join(', ')
    : '-';

  return buildBaseReport({
    ...context,
    type: 'image-ocr',
    title: `${humanize(context.artifact?.request?.mode || 'OCR')} report`,
    results: {
      'Extracted text rows': result?.extractedCount ?? 0,
      'Average text length': result?.avgTextLength ?? 0,
      'Average confidence': result?.avgConfidence ?? 0,
      'Top OCR tokens': tokens || '-',
      'Label summary': labels || '-',
    },
    interpretation: {
      'What this means': 'The image runtime extracted a reusable text column that can feed preview or downstream text feature pipelines.',
      'Watch carefully': 'Fallback OCR derives text from image references, so it is useful for routing and smoke coverage but not a substitute for real OCR.',
      'Current limits': 'High-quality OCR still depends on pytesseract plus a Tesseract binary on the backend.',
    },
    nextSteps: [
      'Open the OCR-derived dataset preview and inspect extracted text rows.',
      'Create a text analysis task on the OCR-derived dataset for TF-IDF, sentiment, or embedding features.',
      'Install direct OCR dependencies if richer extraction quality is required.',
    ],
  });
}

function rankStatus(values = []) {
  const order = {
    blocked: 4,
    warning: 3,
    fallback: 2,
    direct: 1,
  };
  return values.reduce((current, value) => {
    const normalized = String(value || '').trim().toLowerCase();
    if (!normalized) return current;
    if (!current) return normalized;
    return (order[normalized] || 0) > (order[current] || 0) ? normalized : current;
  }, '');
}

export function buildTaskSummaryReportSourceSignature(task = null) {
  if (!task) return '';

  const taskRuntimeReport = task?.options?.report || null;
  const analysisReports = Array.isArray(task?.analyses)
    ? task.analyses.map((analysis) => analysis?.options?.report).filter(Boolean)
    : [];
  const allReports = [taskRuntimeReport, ...analysisReports].filter(Boolean);

  return JSON.stringify({
    taskId: task?.id || '',
    taskUpdatedAt: Number(task?.updatedAt || 0),
    taskStatus: String(task?.status || ''),
    taskExecutionSummary: String(task?.options?.executionSummary || ''),
    taskReportSignature: String(taskRuntimeReport?.sourceSignature || ''),
    taskReportStatus: String(taskRuntimeReport?.status || ''),
    analyses: Array.isArray(task?.analyses)
      ? task.analyses.map((analysis) => ({
        id: analysis?.id || '',
        updatedAt: Number(analysis?.updatedAt || 0),
        status: String(analysis?.status || ''),
        executionSummary: String(analysis?.options?.executionSummary || ''),
        reportType: String(analysis?.options?.report?.type || ''),
        reportStatus: String(analysis?.options?.report?.status || ''),
        reportSignature: String(analysis?.options?.report?.sourceSignature || ''),
      }))
      : [],
    reportKinds: allReports.map((report) => report?.type || ''),
  });
}

export function buildTaskSummaryReport({
  dashboard = null,
  task = null,
  sourceDataset = null,
  derivedDataset = null,
} = {}) {
  if (!task) return null;

  const taskRuntimeReport = task?.options?.report || null;
  const analysisReports = Array.isArray(task?.analyses)
    ? task.analyses.map((analysis) => analysis?.options?.report).filter(Boolean)
    : [];
  const allReports = [taskRuntimeReport, ...analysisReports].filter(Boolean);
  if (!allReports.length && !task?.options?.executionSummary) return null;

  const status = rankStatus(allReports.map((report) => report?.status)) || 'direct';
  const findings = [];
  if (task?.options?.executionSummary) findings.push(task.options.executionSummary);
  allReports.forEach((report) => {
    const value = String(report?.sections?.results?.['Result summary'] || '').trim();
    if (value) findings.push(value);
  });

  const nextSteps = Array.from(new Set(
    allReports.flatMap((report) => Array.isArray(report?.sections?.nextSteps) ? report.sections.nextSteps : [])
  )).slice(0, 5);

  const requirements = Array.from(new Set(
    allReports.flatMap((report) => Array.isArray(report?.sections?.runtime?.requirements) ? report.sections.runtime.requirements : [])
  ));
  const warnings = Array.from(new Set(
    allReports.flatMap((report) => Array.isArray(report?.sections?.runtime?.warnings) ? report.sections.runtime.warnings : [])
  ));

  const blockedCount = allReports.filter((report) => report?.status === 'blocked').length;
  const fallbackCount = allReports.filter((report) => report?.status === 'fallback').length;
  const warningCount = allReports.filter((report) => report?.status === 'warning').length;

  const sourceSignature = buildTaskSummaryReportSourceSignature(task);

  return {
    title: `${task?.title || 'Task'} summary report`,
    type: 'task-summary',
    status,
    sourceArtifactKind: 'task-summary',
    sourceSignature,
    generatedAt: new Date().toISOString(),
    sections: {
      overview: {
        'Task name': task?.title || '-',
        'Task type': humanize(task?.type || ''),
        'Included analyses': Array.isArray(task?.analyses) ? task.analyses.length : 0,
        'Used dataset': derivedDataset?.name || sourceDataset?.name || '-',
        Dashboard: dashboard?.title || '-',
        'Run status': status,
      },
      inputs: {
        sourceDatasetId: sourceDataset?.id || task?.options?.sourceDatasetId || '',
        derivedDatasetId: derivedDataset?.id || task?.options?.derivedDatasetId || '',
        Datasets: joinValues(task?.datasetIds || []),
        'Preprocessing mode': task?.preprocessingMode || '-',
        'Included analyses': joinValues((task?.analyses || []).map((analysis) => analysis?.title || analysis?.method)),
      },
      results: {
        'Key findings': Array.from(new Set(findings.filter(Boolean))).slice(0, 4).join(' | ') || '-',
        'Blocked analyses': blockedCount,
        'Fallback analyses': fallbackCount,
        'Warning analyses': warningCount,
        'Report types': joinValues(allReports.map((report) => report?.type)),
      },
      interpretation: {
        'What this means': `This task bundles ${allReports.length} saved report${allReports.length === 1 ? '' : 's'} into one reusable summary view.`,
        'Watch carefully': blockedCount
          ? 'One or more analyses are blocked and need environment or input fixes before the task is considered complete.'
          : fallbackCount
            ? 'Some analyses relied on fallback runtimes, so treat the results as baseline evidence.'
            : 'The task summary reflects the latest saved analysis reports.',
        'Current limits': 'This summary only reflects saved analysis artifacts and does not replace the full artifact-level detail.',
      },
      nextSteps,
      runtime: {
        availability: status,
        reason: blockedCount
          ? `${blockedCount} analysis report(s) are blocked.`
          : fallbackCount
            ? `${fallbackCount} analysis report(s) used fallback runtimes.`
            : warningCount
              ? `${warningCount} analysis report(s) include warnings.`
              : 'All saved analysis reports are ready.',
        requirements,
        warnings,
      },
    },
    generatedFromAnalysisIds: Array.isArray(task?.analyses) ? task.analyses.map((analysis) => analysis.id) : [],
  };
}

export function buildAnalysisReport({
  dashboard = null,
  task = null,
  analysis = null,
  artifact = null,
  sourceDataset = null,
  derivedDataset = null,
} = {}) {
  if (!artifact?.kind) return null;

  const context = {
    dashboard: cloneValue(dashboard || {}),
    task: cloneValue(task || {}),
    analysis: cloneValue(analysis || {}),
    artifact: cloneValue(artifact || {}),
    sourceDataset: cloneValue(sourceDataset || {}),
    derivedDataset: cloneValue(derivedDataset || {}),
  };

  if (artifact.kind === 'stat-corr') return buildCorrReport(context);
  if (artifact.kind === 'stat-tests') return buildTestsReport(context);
  if (artifact.kind === 'text-features') return buildTextFeaturesReport(context);
  if (artifact.kind === 'image-features') return buildImageFeaturesReport(context);
  if (artifact.kind === 'image-ocr') return buildImageOcrReport(context);
  if (artifact.kind === 'ml-unsupervised') {
    const taskType = String(artifact?.request?.task || artifact?.normalizedRequest?.task || '').toLowerCase();
    if (taskType === 'dim_reduction') return buildPcaReport(context);
    return buildClusteringReport(context);
  }
  if (artifact.kind === 'ml-model') {
    const taskType = String(artifact?.request?.task || artifact?.normalizedRequest?.task || '').toLowerCase();
    if (taskType === 'classification') return buildClassificationReport(context);
    return buildRegressionReport(context);
  }

  return buildBaseReport({
    ...context,
    type: humanize(artifact.kind),
    title: `${humanize(artifact.kind)} report`,
    interpretation: {
      'What this means': artifact.summary || 'A runtime artifact was generated for this analysis.',
      'Watch carefully': 'Review the saved runtime evidence before sharing conclusions.',
      'Current limits': 'A type-specific narrative has not been added for this artifact yet.',
    },
    nextSteps: ['Review the saved artifact and decide whether a follow-up analysis is needed.'],
  });
}
