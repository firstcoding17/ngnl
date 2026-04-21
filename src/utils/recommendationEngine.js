import {
  buildPreviewAnalysisRecommendations,
  buildPreprocessingRecommendations,
  buildStructuredTaskRecommendations,
  summarizeDataset,
} from '@/utils/datasetImport';
import { getMlModelAvailability } from '@/utils/mlArtifacts';
import {
  buildRuntimeStatusDisplay,
  collectArtifactRequirements,
  collectArtifactWarnings,
  inferArtifactRuntimeState,
} from '@/utils/runtimeStatus';

function uniqueStrings(values = []) {
  return Array.from(
    new Set(
      values
        .map((value) => String(value ?? '').trim())
        .filter(Boolean)
    )
  );
}

function createRecommendation(category, item, label, reason, options = {}) {
  return {
    id: String(options.id || `${category}:${item}`),
    category: String(category || '').trim(),
    item: String(item || '').trim(),
    label: String(label || '').trim(),
    reason: String(reason || '').trim(),
    priority: Number(options.priority || 50),
    confidence: String(options.confidence || '').trim(),
    availability: String(options.availability || 'suggested').trim(),
    requirements: uniqueStrings(options.requirements || []),
    warnings: uniqueStrings(options.warnings || []),
    nextAction: options.nextAction || null,
    signals: Array.isArray(options.signals) ? options.signals.filter(Boolean) : [],
  };
}

function sortRecommendations(items = [], limit = 6) {
  return [...items]
    .sort((left, right) => {
      if ((right.priority || 0) !== (left.priority || 0)) return (right.priority || 0) - (left.priority || 0);
      return String(left.label || '').localeCompare(String(right.label || ''));
    })
    .slice(0, limit);
}

function dedupeRecommendations(items = []) {
  const next = [];
  const seen = new Set();
  for (const item of items || []) {
    const key = `${item.category}:${item.item}:${item.label}`;
    if (seen.has(key)) continue;
    seen.add(key);
    next.push(item);
  }
  return next;
}

function detectHighCardinalityColumns(summary = {}) {
  const columnProfiles = summary.columnProfiles || {};
  return (summary.categoricalColumns || [])
    .map((column) => ({
      column,
      uniqueCount: Number(columnProfiles[column]?.uniqueCount || 0),
      averageTextLength: Number(columnProfiles[column]?.averageTextLength || 0),
    }))
    .filter((item) => item.uniqueCount >= 16)
    .sort((left, right) => right.uniqueCount - left.uniqueCount || left.column.localeCompare(right.column));
}

function estimateTextStats(summary = {}) {
  const columnProfiles = summary.columnProfiles || {};
  const textColumns = Array.isArray(summary.textColumns) ? summary.textColumns : [];
  const averages = textColumns.map((column) => Number(columnProfiles[column]?.averageTextLength || 0)).filter((value) => value > 0);
  return {
    textColumnCount: textColumns.length,
    averageTextLength: averages.length
      ? Math.round(averages.reduce((sum, value) => sum + value, 0) / averages.length)
      : 0,
  };
}

function buildSummaryFromDataset(dataset = null, dataType = 'tabular') {
  if (!dataset) return null;
  const rows = Array.isArray(dataset.rows) ? dataset.rows : [];
  const columns = Array.isArray(dataset.columns) ? dataset.columns : [];
  if (!rows.length && !columns.length) return null;
  const freshSummary = summarizeDataset(rows, columns, dataType);
  return {
    ...freshSummary,
    rowCount: Number(dataset.meta?.rowCount ?? freshSummary.rowCount ?? rows.length),
    colCount: Number(dataset.meta?.colCount ?? freshSummary.colCount ?? columns.length),
    missingCount: Number(dataset.meta?.missingCount ?? freshSummary.missingCount ?? 0),
    missingByColumn: dataset.meta?.missingByColumn || freshSummary.missingByColumn || {},
    columnTypes: dataset.meta?.columnTypes || freshSummary.columnTypes || {},
    columnProfiles: dataset.meta?.columnProfiles || freshSummary.columnProfiles || {},
    numericColumns: dataset.meta?.numericColumns || freshSummary.numericColumns || [],
    categoricalColumns: dataset.meta?.categoricalColumns || freshSummary.categoricalColumns || [],
    dateColumns: dataset.meta?.dateColumns || freshSummary.dateColumns || [],
    textColumns: dataset.meta?.textColumns || freshSummary.textColumns || [],
    binaryLikeColumns: dataset.meta?.binaryLikeColumns || freshSummary.binaryLikeColumns || [],
    imageColumns: dataset.meta?.imageColumns || freshSummary.imageColumns || [],
    previewColumns: freshSummary.previewColumns || [],
    sampleRows: freshSummary.sampleRows || [],
    preferredType: dataType,
  };
}

function pickStructuredTarget(summary = {}, dataType = 'tabular', task = null) {
  const explicitTarget = String(
    task?.options?.targetColumn
    || ''
  ).trim();
  if (explicitTarget) {
    const numericColumns = new Set(summary.numericColumns || []);
    const binaryLikeColumns = new Set(summary.binaryLikeColumns || []);
    const categoricalColumns = new Set(summary.categoricalColumns || []);
    return {
      column: explicitTarget,
      kind: numericColumns.has(explicitTarget) ? 'regression' : categoricalColumns.has(explicitTarget) || binaryLikeColumns.has(explicitTarget) ? 'classification' : '',
      confidence: 'high',
      reason: `The current task already targets ${explicitTarget}.`,
    };
  }
  const structured = buildStructuredTaskRecommendations(summary, dataType);
  const topModeling = structured.find((item) => ['regression', 'classification'].includes(item.type));
  if (!topModeling) return null;
  return {
    column: topModeling.targetColumn || '',
    kind: topModeling.type,
    confidence: topModeling.confidence || 'medium',
    reason: topModeling.reason || '',
  };
}

function buildAnalysisRecommendations(summary = {}, context = {}) {
  const items = [];
  const dataType = String(context.dataType || summary.preferredType || 'tabular');
  const structured = buildStructuredTaskRecommendations(summary, dataType);
  const hasJoinedSource = !!context.datasetLinkArtifact?.status || !!context.dashboard?.datasetLinks?.preparedDatasetId;
  const currentRuntimeState = inferArtifactRuntimeState(context.primaryArtifact || null);
  const selectedTaskType = String(context.task?.type || '').trim().toLowerCase();
  const currentReportType = String(context.primaryReport?.type || '').trim().toLowerCase();

  structured.forEach((item, index) => {
    const basePriority = item.type === 'distribution' ? 82 : 96 - index * 4;
    items.push(createRecommendation(
      'analysis',
      item.type,
      item.label,
      item.reason,
      {
        priority: basePriority,
        confidence: item.confidence || 'medium',
        nextAction: {
          type: 'task-template',
          value: item.type,
        },
        signals: [dataType, item.targetColumn ? `target:${item.targetColumn}` : 'target:none'],
      }
    ));
  });

  if ((summary.numericColumns || []).length >= 2 && !structured.some((item) => item.type === 'distribution')) {
    items.push(createRecommendation(
      'analysis',
      'distribution',
      'Distribution analysis',
      'Multiple numeric columns are available, so a distribution-first pass is still a safe baseline.',
      {
        priority: 80,
        confidence: 'medium',
        nextAction: { type: 'task-template', value: 'distribution' },
      }
    ));
  }

  if ((summary.numericColumns || []).length >= 2 && !structured.some((item) => item.type === 'regression') && !structured.some((item) => item.type === 'classification')) {
    items.push(
      createRecommendation(
        'analysis',
        'pca',
        'PCA view',
        'The dataset is numeric enough for an unsupervised projection, and no clear target stands out yet.',
        {
          priority: 88,
          confidence: 'high',
          nextAction: { type: 'ml-task', value: 'dim_reduction:pca' },
          signals: ['numeric:no-target'],
        }
      ),
      createRecommendation(
        'analysis',
        'clustering',
        'Clustering analysis',
        'Several numeric columns are available without a clear target, so clustering can surface natural groups.',
        {
          priority: 86,
          confidence: 'medium',
          nextAction: { type: 'ml-task', value: 'clustering:kmeans' },
          signals: ['numeric:no-target'],
        }
      )
    );
  }

  if ((summary.textColumns || []).length > 0) {
    const textStats = estimateTextStats(summary);
    items.push(createRecommendation(
      'analysis',
      'text-overview',
      'Text overview',
      `The dataset includes ${textStats.textColumnCount} text column(s), so a lightweight overview is a good first checkpoint.`,
      {
        priority: 90,
        confidence: 'high',
        nextAction: { type: 'task-template', value: 'text-analysis' },
        signals: ['text-columns'],
      }
    ));
  }

  if ((summary.imageColumns || []).length > 0) {
    items.push(createRecommendation(
      'analysis',
      'image-analysis',
      'Image feature analysis',
      `${summary.imageColumns.length} image reference column(s) are available, so feature extraction or OCR is ready to branch from the current dataset.`,
      {
        priority: 90,
        confidence: 'high',
        nextAction: { type: 'task-template', value: 'image-analysis' },
        signals: ['image-columns'],
      }
    ));
  }

  if (hasJoinedSource) {
    const joinWarnings = [
      ...(Array.isArray(context.datasetLinkArtifact?.warnings) ? context.datasetLinkArtifact.warnings : []),
      ...(Array.isArray(context.datasetLinkArtifact?.errors) ? context.datasetLinkArtifact.errors : []),
    ];
    items.push(createRecommendation(
      'analysis',
      'joined-summary',
      'Joined-source summary',
      joinWarnings.length
        ? `A linked source is ready, but there are join cautions to review first: ${joinWarnings.slice(0, 2).join(' ')}`
        : 'A linked source is ready, so a joined summary or correlation pass should come before deeper modeling.',
      {
        priority: 92,
        confidence: 'high',
        nextAction: { type: 'panel', value: 'stat:report' },
        warnings: joinWarnings,
        signals: ['joined-source'],
      }
    ));
  }

  if ((currentReportType.includes('corr') || String(context.primaryArtifact?.kind || '').includes('corr')) && !selectedTaskType.includes('regression')) {
    items.push(createRecommendation(
      'next-step',
      'corr-to-regression',
      'Follow correlation with regression',
      'A saved correlation result exists, so regression is the next best step if one numeric outcome matters.',
      {
        priority: 93,
        confidence: 'medium',
        nextAction: { type: 'task-template', value: 'regression' },
        signals: ['artifact:correlation'],
      }
    ));
  }

  if ((currentReportType.includes('classification') || String(context.primaryArtifact?.kind || '').includes('ml-model')) && selectedTaskType === 'classification') {
    items.push(createRecommendation(
      'next-step',
      'classification-follow-up',
      'Inspect confusion matrix and class balance',
      'Classification finished, so the next step is to inspect which classes fail and whether imbalance is driving the result.',
      {
        priority: 91,
        confidence: 'high',
        nextAction: { type: 'panel', value: 'stat:tests' },
        signals: ['task:classification'],
      }
    ));
  }

  if (currentRuntimeState === 'blocked') {
    items.push(createRecommendation(
      'analysis',
      'blocked-fallback-analysis',
      'Use graph and statistics while the runtime is blocked',
      'The current runtime is blocked, so a chart-first and statistics-first review is the safest fallback path.',
      {
        priority: 98,
        confidence: 'high',
        availability: 'blocked',
        requirements: collectArtifactRequirements(context.primaryArtifact || null),
        warnings: collectArtifactWarnings(context.primaryArtifact || null),
        nextAction: { type: 'panel', value: 'graph+stat' },
        signals: ['runtime:blocked'],
      }
    ));
  }

  return sortRecommendations(dedupeRecommendations(items), 6);
}

function buildPreprocessingItems(summary = {}, context = {}) {
  const dataType = String(context.dataType || summary.preferredType || 'tabular');
  const base = buildPreprocessingRecommendations(summary, dataType);
  const items = [];
  const labelMap = {
    'handle-missing': 'Handle missing values',
    'binary-mapping': 'Binary 0/1 encoding',
    'categorical-encoding': 'Categorical encoding',
    'date-features': 'Date feature expansion',
    tfidf: 'TF-IDF transform',
    sentiment: 'Sentiment scoring',
    embedding: 'Hash-vector embedding',
    'image-preview': 'Image preview check',
    'image-embedding': 'Image feature extraction',
  };

  base.forEach((item) => {
    const label = labelMap[item.id] || item.label || item.id;
    let reason = item.reason || '';
    if (!reason) {
      if (item.id === 'handle-missing') reason = 'Missing values are present, so filling or auditing them should come first.';
      else if (item.id === 'binary-mapping') reason = 'Binary-like categorical values are easier to model after 0/1 encoding.';
      else if (item.id === 'categorical-encoding') reason = 'Categorical predictors exist, so encoding them is the next safe step.';
      else if (item.id === 'date-features') reason = 'Date columns are available and can be expanded into more useful cyclic features.';
      else if (item.id === 'tfidf') reason = 'Text columns are available, so TF-IDF can convert them into an immediate feature table.';
      else if (item.id === 'sentiment') reason = 'Text columns are available, so sentiment scoring can add a lightweight semantic signal.';
      else if (item.id === 'embedding') reason = 'Text columns are available, so the current embedding runtime can create a reusable feature table.';
      else if (item.id === 'image-preview') reason = 'Image references are present, so preview checks should happen before deeper extraction.';
      else if (item.id === 'image-embedding') reason = 'Image references are present, so feature extraction can prepare a downstream model path.';
    }
    items.push(createRecommendation(
      'preprocessing',
      item.id,
      label,
      reason,
      {
        priority: item.recommended ? 92 : 68,
        confidence: item.recommended ? 'high' : 'medium',
        nextAction: { type: 'preprocessing', value: item.id },
        signals: [dataType, item.group || 'preprocessing'],
      }
    ));
  });

  const highCardColumns = detectHighCardinalityColumns(summary);
  if (highCardColumns.length) {
    items.push(createRecommendation(
      'preprocessing',
      'high-cardinality-review',
      'High-cardinality categorical review',
      `${highCardColumns[0].column} has many unique values, so frequency-style encoding or a reduced category strategy is safer than a wide one-hot expansion.`,
      {
        priority: 82,
        confidence: 'medium',
        nextAction: { type: 'preprocessing', value: 'high-cardinality-review' },
        signals: ['high-cardinality'],
      }
    ));
  }

  const joinWarnings = [
    ...(Array.isArray(context.datasetLinkArtifact?.warnings) ? context.datasetLinkArtifact.warnings : []),
    ...(Array.isArray(context.datasetLinkArtifact?.errors) ? context.datasetLinkArtifact.errors : []),
  ];
  if (joinWarnings.length) {
    items.push(createRecommendation(
      'preprocessing',
      'join-warning-review',
      'Resolve join warnings',
      `The linked dataset flow raised cautions: ${joinWarnings.slice(0, 2).join(' ')}`,
      {
        priority: 94,
        confidence: 'high',
        availability: 'warning',
        warnings: joinWarnings,
        nextAction: { type: 'dataset-link', value: 'review' },
        signals: ['join-warning'],
      }
    ));
  }

  return sortRecommendations(dedupeRecommendations(items), 6);
}

function buildModelRecommendations(summary = {}, context = {}) {
  const items = [];
  const target = pickStructuredTarget(summary, context.dataType, context.task);
  if (!target?.kind) return items;

  const capabilitySource = context.primaryArtifact?.capabilities
    || context.task?.options?.mlArtifact?.capabilities
    || context.analysis?.options?.mlArtifact?.capabilities
    || {};
  const capabilityError = String(context.primaryArtifact?.availability === 'blocked' ? context.primaryArtifact?.availabilityReason || '' : '').trim();
  const taskType = target.kind;

  const modelChoices = taskType === 'regression'
    ? ['linear', 'forest', 'hgb']
    : ['linear', 'forest', 'hgb'];

  modelChoices.forEach((model, index) => {
    const availability = Object.keys(capabilitySource || {}).length
      ? getMlModelAvailability(taskType, model, capabilitySource, capabilityError)
      : null;
    const label = availability?.requestedLabel
      || (model === 'linear'
        ? taskType === 'regression' ? 'Linear baseline' : 'Logistic baseline'
        : model === 'forest'
          ? 'Random forest'
          : 'Hist Gradient Boosting');

    const simpleModelBoost = model === 'linear' ? 6 : 0;
    const fallbackBoost = availability?.status === 'fallback' && model === 'linear' ? 8 : 0;
    const blockedPenalty = availability?.status === 'blocked' ? -18 : 0;
    const priority = 92 - index * 8 + simpleModelBoost + fallbackBoost + blockedPenalty;
    const reason = availability
      ? `${availability.reason} ${target.reason}`.trim()
      : taskType === 'regression'
        ? `${label} is a strong first regression baseline for ${target.column}.`
        : `${label} is a strong first classification baseline for ${target.column}.`;

    items.push(createRecommendation(
      'model',
      `${taskType}:${model}`,
      label,
      reason,
      {
        priority,
        confidence: target.confidence || 'medium',
        availability: availability?.status === 'runnable' ? 'direct' : availability?.status || 'suggested',
        requirements: availability?.requirements || [],
        warnings: availability?.notes || [],
        nextAction: { type: 'model', value: `${taskType}:${model}` },
        signals: [taskType, target.column ? `target:${target.column}` : 'target:none'],
      }
    ));
  });

  if ((summary.rowCount || 0) < 40) {
    items.unshift(createRecommendation(
      'model',
      `${taskType}:small-data`,
      'Keep the first model simple',
      `The dataset only has ${summary.rowCount || 0} rows, so a simpler baseline is safer than a high-capacity model.`,
      {
        priority: 97,
        confidence: 'high',
        availability: 'suggested',
        nextAction: { type: 'model', value: `${taskType}:linear` },
        signals: ['small-data'],
      }
    ));
  }

  return sortRecommendations(dedupeRecommendations(items), 5);
}

function buildRuntimeRecommendations(summary = {}, context = {}) {
  const items = [];
  const textStats = estimateTextStats(summary);
  const selectedRuntimeState = buildRuntimeStatusDisplay(context.primaryArtifact || null);

  if ((summary.textColumns || []).length > 0) {
    items.push(
      createRecommendation(
        'runtime',
        'text-tfidf',
        'TF-IDF runtime',
        'TF-IDF is the fastest way to turn the current text columns into a reusable feature table.',
        {
          priority: 88,
          confidence: 'high',
          availability: 'direct',
          nextAction: { type: 'runtime', value: 'text:tfidf' },
          signals: ['text-runtime'],
        }
      ),
      createRecommendation(
        'runtime',
        'text-semantic',
        'Semantic text runtime',
        textStats.averageTextLength >= 40
          ? 'Longer text is present, so the semantic concept runtime should surface richer downstream signal than plain sentiment.'
          : 'Semantic text runtime is available and can add higher-level concepts before PCA or classification.',
        {
          priority: 90,
          confidence: 'high',
          availability: 'direct',
          nextAction: { type: 'runtime', value: 'text:semantic' },
          signals: ['text-runtime', 'semantic'],
        }
      ),
      createRecommendation(
        'runtime',
        'text-embedding',
        'Embedding runtime',
        'The embedding runtime is available, but it currently uses a heuristic hash-vector representation rather than a full semantic encoder.',
        {
          priority: 72,
          confidence: 'medium',
          availability: 'fallback',
          warnings: ['This embedding runtime currently uses the heuristic hash-vector slice.'],
          nextAction: { type: 'runtime', value: 'text:embedding' },
          signals: ['text-runtime', 'heuristic'],
        }
      )
    );
  }

  if ((summary.imageColumns || []).length > 0) {
    const imageArtifact = context.artifacts?.imageFeature || context.primaryArtifact;
    const ocrArtifact = context.artifacts?.imageOcr || null;
    const imageState = imageArtifact ? buildRuntimeStatusDisplay(imageArtifact) : null;
    const ocrState = ocrArtifact ? buildRuntimeStatusDisplay(ocrArtifact) : null;

    items.push(
      createRecommendation(
        'runtime',
        'image-features',
        'Image feature runtime',
        imageState?.reason || 'Image preview and feature extraction can prepare a downstream PCA or classification path.',
        {
          priority: 90,
          confidence: 'high',
          availability: imageState?.state || 'suggested',
          requirements: imageState?.requirements || [],
          warnings: imageState?.warnings || [],
          nextAction: { type: 'runtime', value: 'image:features' },
          signals: ['image-runtime'],
        }
      ),
      createRecommendation(
        'runtime',
        'image-ocr',
        'OCR text extraction',
        ocrState?.reason || 'OCR can turn image references into a text table that feeds the existing text runtime path.',
        {
          priority: 84,
          confidence: 'medium',
          availability: ocrState?.state || 'suggested',
          requirements: ocrState?.requirements || [],
          warnings: ocrState?.warnings || [],
          nextAction: { type: 'runtime', value: 'image:ocr' },
          signals: ['image-runtime', 'ocr'],
        }
      )
    );
  }

  if (selectedRuntimeState.state === 'blocked') {
    items.push(createRecommendation(
      'runtime',
      'runtime-blocked-fallback',
      'Use a fallback-safe path',
      selectedRuntimeState.reason || 'The current runtime is blocked, so stay with graph, stats, or a simpler direct path first.',
      {
        priority: 99,
        confidence: 'high',
        availability: 'blocked',
        requirements: selectedRuntimeState.requirements || [],
        warnings: selectedRuntimeState.warnings || [],
        nextAction: { type: 'runtime', value: 'fallback-safe' },
        signals: ['runtime:blocked'],
      }
    ));
  } else if (selectedRuntimeState.state === 'fallback') {
    items.push(createRecommendation(
      'runtime',
      'runtime-fallback-note',
      'Fallback runtime is acceptable for this step',
      selectedRuntimeState.reason || 'The current runtime completed through a fallback path, so the next safe move is to interpret it before expanding scope.',
      {
        priority: 79,
        confidence: 'medium',
        availability: 'fallback',
        requirements: selectedRuntimeState.requirements || [],
        warnings: selectedRuntimeState.warnings || [],
        nextAction: { type: 'runtime', value: 'review-fallback' },
        signals: ['runtime:fallback'],
      }
    ));
  }

  return sortRecommendations(dedupeRecommendations(items), 6);
}

function buildNextStepRecommendations(summary = {}, context = {}) {
  const items = [];
  const reportType = String(context.primaryReport?.type || '').trim().toLowerCase();
  const artifactKind = String(context.primaryArtifact?.kind || '').trim().toLowerCase();
  const taskType = String(context.task?.type || '').trim().toLowerCase();
  const runtimeState = inferArtifactRuntimeState(context.primaryArtifact || null);

  if ((artifactKind.includes('text-features') || reportType.includes('text')) && (summary.numericColumns || []).length >= 2) {
    items.push(createRecommendation(
      'next-step',
      'text-downstream-pca',
      'Project text features with PCA',
      'A derived text feature table exists, so PCA is the fastest way to inspect whether the new feature space separates well.',
      {
        priority: 90,
        confidence: 'high',
        nextAction: { type: 'ml-task', value: 'dim_reduction:pca' },
        signals: ['artifact:text-features'],
      }
    ));
  }

  if ((artifactKind.includes('image-features') || reportType.includes('image')) && (summary.numericColumns || []).length >= 2) {
    items.push(createRecommendation(
      'next-step',
      'image-downstream-pca',
      'Project image features with PCA',
      'An image feature table is ready, so PCA is a safe next step before a larger classifier sweep.',
      {
        priority: 90,
        confidence: 'high',
        nextAction: { type: 'ml-task', value: 'dim_reduction:pca' },
        signals: ['artifact:image-features'],
      }
    ));
  }

  if (taskType === 'regression') {
    items.push(createRecommendation(
      'next-step',
      'regression-follow-up',
      'Review residuals and compare one more model',
      'Regression is already in play, so the best next step is to validate residual behavior and compare one stronger baseline.',
      {
        priority: 88,
        confidence: 'high',
        nextAction: { type: 'panel', value: 'model' },
        signals: ['task:regression'],
      }
    ));
  }

  if (taskType === 'classification') {
    items.push(createRecommendation(
      'next-step',
      'classification-imbalance-follow-up',
      'Inspect imbalance before widening the model sweep',
      'Classification is active, so the next step is to confirm whether imbalance or class overlap explains the current errors.',
      {
        priority: 89,
        confidence: 'high',
        nextAction: { type: 'panel', value: 'stat:tests' },
        signals: ['task:classification'],
      }
    ));
  }

  if (taskType === 'image-analysis' && String(context.task?.options?.imageMethod || '').trim() === 'ocr') {
    items.push(createRecommendation(
      'next-step',
      'ocr-to-text',
      'Reuse OCR text in a text analysis task',
      'OCR has created a text-style derived dataset, so the most natural next step is to run a text runtime on the extracted text column.',
      {
        priority: 92,
        confidence: 'high',
        nextAction: { type: 'task-template', value: 'text-analysis' },
        signals: ['runtime:ocr'],
      }
    ));
  }

  if (runtimeState === 'blocked') {
    items.push(createRecommendation(
      'next-step',
      'blocked-requirements',
      'Prepare the direct runtime or switch to a fallback-safe analysis',
      'The current result is blocked, so either install the required runtime dependencies or stay with descriptive stats and graphs for now.',
      {
        priority: 99,
        confidence: 'high',
        availability: 'blocked',
        requirements: collectArtifactRequirements(context.primaryArtifact || null),
        warnings: collectArtifactWarnings(context.primaryArtifact || null),
        nextAction: { type: 'panel', value: 'graph+stat' },
        signals: ['runtime:blocked'],
      }
    ));
  } else if (runtimeState === 'fallback') {
    items.push(createRecommendation(
      'next-step',
      'fallback-follow-up',
      'Validate the fallback output before scaling up',
      'The current result completed with a fallback runtime, so validate it with one chart or one stats pass before committing to the next model.',
      {
        priority: 84,
        confidence: 'medium',
        availability: 'fallback',
        warnings: collectArtifactWarnings(context.primaryArtifact || null),
        nextAction: { type: 'panel', value: 'stat+graph' },
        signals: ['runtime:fallback'],
      }
    ));
  }

  if (!items.length) {
    items.push(createRecommendation(
      'next-step',
      'default-next-step',
      'Start with one chart and one stats check',
      'No stronger follow-up signal is available yet, so a graph-plus-stats pass is the safest next move.',
      {
        priority: 72,
        confidence: 'medium',
        nextAction: { type: 'panel', value: 'graph+stat' },
      }
    ));
  }

  return sortRecommendations(dedupeRecommendations(items), 6);
}

function flattenRecommendationCategories(categories = {}) {
  return sortRecommendations(
    dedupeRecommendations(
      Object.values(categories || {}).flatMap((items) => Array.isArray(items) ? items : [])
    ),
    8
  );
}

export function buildRecommendationSummary(input = {}) {
  const dataType = String(input.dataType || input.dashboard?.dataType || 'tabular').trim().toLowerCase();
  const dataset = input.dataset || null;
  const datasetSummary = input.datasetSummary || buildSummaryFromDataset(dataset, dataType) || null;
  if (!datasetSummary) {
    return {
      version: 'recommendation-engine-v1',
      generatedAt: Date.now(),
      context: {
        dataType,
        datasetId: dataset?.id || '',
        taskId: input.task?.id || '',
        analysisId: input.analysis?.id || '',
      },
      categories: {
        analysis: [],
        preprocessing: [],
        model: [],
        runtime: [],
        nextStep: [],
      },
      top: [],
      notes: ['No dataset profile is available yet. Upload or attach data before asking for recommendations.'],
    };
  }

  const context = {
    ...input,
    dataType,
    dataset,
    datasetSummary,
    primaryArtifact: input.primaryArtifact || input.artifacts?.ml || input.artifacts?.stat || input.artifacts?.textFeature || input.artifacts?.imageFeature || input.artifacts?.imageOcr || input.artifacts?.textOverview || null,
    primaryReport: input.primaryReport || input.analysis?.report || input.task?.report || input.task?.taskReport || null,
  };

  const categories = {
    analysis: buildAnalysisRecommendations(datasetSummary, context),
    preprocessing: buildPreprocessingItems(datasetSummary, context),
    model: buildModelRecommendations(datasetSummary, context),
    runtime: buildRuntimeRecommendations(datasetSummary, context),
    nextStep: buildNextStepRecommendations(datasetSummary, context),
  };

  const top = flattenRecommendationCategories(categories);
  const runtimeState = buildRuntimeStatusDisplay(context.primaryArtifact || null);
  const notes = uniqueStrings([
    runtimeState.reason,
    ...(runtimeState.requirements || []),
    ...(runtimeState.warnings || []),
    ...(Array.isArray(context.datasetLinkArtifact?.warnings) ? context.datasetLinkArtifact.warnings : []),
    ...(Array.isArray(context.datasetLinkArtifact?.errors) ? context.datasetLinkArtifact.errors : []),
  ]);

  return {
    version: 'recommendation-engine-v1',
    generatedAt: Date.now(),
    context: {
      dataType,
      datasetId: dataset?.id || '',
      datasetName: dataset?.name || '',
      rowCount: Number(datasetSummary.rowCount || 0),
      colCount: Number(datasetSummary.colCount || 0),
      taskId: input.task?.id || '',
      analysisId: input.analysis?.id || '',
      runtimeState: runtimeState.state || '',
    },
    profile: {
      numericColumns: Array.isArray(datasetSummary.numericColumns) ? datasetSummary.numericColumns.length : 0,
      categoricalColumns: Array.isArray(datasetSummary.categoricalColumns) ? datasetSummary.categoricalColumns.length : 0,
      textColumns: Array.isArray(datasetSummary.textColumns) ? datasetSummary.textColumns.length : 0,
      imageColumns: Array.isArray(datasetSummary.imageColumns) ? datasetSummary.imageColumns.length : 0,
      dateColumns: Array.isArray(datasetSummary.dateColumns) ? datasetSummary.dateColumns.length : 0,
      missingCount: Number(datasetSummary.missingCount || 0),
      linkedDatasetCount: Number(input.dashboard?.datasetLinks?.links?.length || 0),
    },
    categories,
    top,
    notes,
  };
}

export function summarizeRecommendationHeadline(summary = null, fallbackText = 'Start with one recommended action.') {
  const topItem = summary?.top?.[0] || null;
  if (!topItem) return fallbackText;
  return `${topItem.label}: ${topItem.reason}`;
}

export function buildRecommendationPromptSuggestions(summary = null) {
  const items = Array.isArray(summary?.top) ? summary.top.slice(0, 4) : [];
  return items.map((item) => ({
    label: item.label,
    prompt: `Why are you recommending ${item.label.toLowerCase()} next?`,
    reason: item.reason,
  }));
}
