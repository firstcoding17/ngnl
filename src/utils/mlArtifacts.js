function cloneValue(value) {
  if (Array.isArray(value)) return value.map((item) => cloneValue(item));
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, cloneValue(item)]));
  }
  return value;
}

function fmtMetric(value, digits = 3) {
  return Number.isFinite(Number(value)) ? Number(value).toFixed(digits) : '-';
}

const MODEL_REQUIREMENTS = {
  xgboost: 'Install xgboost and wire an XGBoost estimator into swwseos_server/scripts/ml_run.py to enable this model.',
  lightgbm: 'Install lightgbm and add the LightGBM estimator to swwseos_server/scripts/ml_run.py to enable this model.',
  catboost: 'Install catboost and add the CatBoost estimator to swwseos_server/scripts/ml_run.py to enable this model.',
  tabnet: 'Install pytorch-tabnet and add a TabNet training path to swwseos_server/scripts/ml_run.py to enable this model.',
  ft_transformer: 'Install rtdl and add an FT-Transformer training path to swwseos_server/scripts/ml_run.py to enable this model.',
  torch_mlp: 'Add a PyTorch training runtime to the backend to enable this model.',
  tf_mlp: 'Add a TensorFlow training runtime to the backend to enable this model.',
  autoencoder: 'Add an autoencoder backend runtime to enable this model.',
  naive: 'Add a naive forecasting runtime to the backend to enable this model.',
  arima: 'Install the required time-series dependencies and wire an ARIMA backend runtime to enable this model.',
  exp_smoothing: 'Install the required time-series dependencies and wire an exponential smoothing backend runtime to enable this model.',
};

const ML_MODEL_CATALOG = {
  regression: [
    { value: 'linear', label: 'Linear regression', requiresSklearn: true, runtimeImplemented: true },
    { value: 'tree', label: 'Decision tree', requiresSklearn: true, runtimeImplemented: true },
    { value: 'forest', label: 'Random forest', requiresSklearn: true, runtimeImplemented: true },
    { value: 'extra_trees', label: 'Extra Trees', requiresSklearn: true, runtimeImplemented: true },
    { value: 'adaboost', label: 'AdaBoost', requiresSklearn: true, runtimeImplemented: true },
    { value: 'svm', label: 'SVM (SVR)', requiresSklearn: true, runtimeImplemented: true },
    { value: 'voting', label: 'Voting ensemble', requiresSklearn: true, runtimeImplemented: true },
    { value: 'elasticnet', label: 'ElasticNet', requiresSklearn: true, runtimeImplemented: true },
    { value: 'hgb', label: 'Hist Gradient Boosting', requiresSklearn: true, runtimeImplemented: true },
    { value: 'nn', label: 'Neural network', requiresSklearn: true, runtimeImplemented: true },
    {
      value: 'xgboost',
      label: 'XGBoost',
      requiresSklearn: true,
      runtimeImplemented: false,
      capability: 'xgboost',
      blockedReason: 'The current backend does not expose an XGBoost regression runtime yet.',
    },
    {
      value: 'lightgbm',
      label: 'LightGBM',
      requiresSklearn: true,
      runtimeImplemented: false,
      capability: 'lightgbm',
      blockedReason: 'The current backend does not expose a LightGBM regression runtime yet.',
    },
    {
      value: 'catboost',
      label: 'CatBoost',
      requiresSklearn: true,
      runtimeImplemented: false,
      capability: 'catboost',
      blockedReason: 'The current backend does not expose a CatBoost regression runtime yet.',
    },
    {
      value: 'tabnet',
      label: 'TabNet',
      requiresSklearn: true,
      runtimeImplemented: false,
      capability: 'pytorch_tabnet',
      blockedReason: 'The current backend does not expose a TabNet regression runtime yet.',
    },
    {
      value: 'ft_transformer',
      label: 'FT-Transformer',
      requiresSklearn: true,
      runtimeImplemented: false,
      capability: 'rtdl',
      blockedReason: 'The current backend does not expose an FT-Transformer regression runtime yet.',
    },
    {
      value: 'torch_mlp',
      label: 'PyTorch MLP',
      requiresSklearn: true,
      runtimeImplemented: false,
      blockedReason: 'A PyTorch MLP regression runtime is not wired into the backend yet.',
    },
    {
      value: 'tf_mlp',
      label: 'TensorFlow MLP',
      requiresSklearn: true,
      runtimeImplemented: false,
      blockedReason: 'A TensorFlow MLP regression runtime is not wired into the backend yet.',
    },
  ],
  classification: [
    { value: 'linear', label: 'Logistic baseline', requiresSklearn: true, runtimeImplemented: true },
    { value: 'tree', label: 'Decision tree', requiresSklearn: true, runtimeImplemented: true },
    { value: 'forest', label: 'Random forest', requiresSklearn: true, runtimeImplemented: true },
    { value: 'extra_trees', label: 'Extra Trees', requiresSklearn: true, runtimeImplemented: true },
    { value: 'adaboost', label: 'AdaBoost', requiresSklearn: true, runtimeImplemented: true },
    { value: 'svm', label: 'SVM (SVC)', requiresSklearn: true, runtimeImplemented: true },
    { value: 'calibrated', label: 'Calibrated forest', requiresSklearn: true, runtimeImplemented: true },
    { value: 'voting', label: 'Voting ensemble', requiresSklearn: true, runtimeImplemented: true },
    { value: 'hgb', label: 'Hist Gradient Boosting', requiresSklearn: true, runtimeImplemented: true },
    { value: 'nb', label: 'Naive Bayes', requiresSklearn: true, runtimeImplemented: true },
    { value: 'knn', label: 'KNN', requiresSklearn: true, runtimeImplemented: true },
    { value: 'nn', label: 'Neural network', requiresSklearn: true, runtimeImplemented: true },
    {
      value: 'xgboost',
      label: 'XGBoost',
      requiresSklearn: true,
      runtimeImplemented: false,
      capability: 'xgboost',
      blockedReason: 'The current backend does not expose an XGBoost classification runtime yet.',
    },
    {
      value: 'lightgbm',
      label: 'LightGBM',
      requiresSklearn: true,
      runtimeImplemented: false,
      capability: 'lightgbm',
      blockedReason: 'The current backend does not expose a LightGBM classification runtime yet.',
    },
    {
      value: 'catboost',
      label: 'CatBoost',
      requiresSklearn: true,
      runtimeImplemented: false,
      capability: 'catboost',
      blockedReason: 'The current backend does not expose a CatBoost classification runtime yet.',
    },
    {
      value: 'tabnet',
      label: 'TabNet',
      requiresSklearn: true,
      runtimeImplemented: false,
      capability: 'pytorch_tabnet',
      blockedReason: 'The current backend does not expose a TabNet classification runtime yet.',
    },
    {
      value: 'ft_transformer',
      label: 'FT-Transformer',
      requiresSklearn: true,
      runtimeImplemented: false,
      capability: 'rtdl',
      blockedReason: 'The current backend does not expose an FT-Transformer classification runtime yet.',
    },
    {
      value: 'torch_mlp',
      label: 'PyTorch MLP',
      requiresSklearn: true,
      runtimeImplemented: false,
      blockedReason: 'A PyTorch MLP classification runtime is not wired into the backend yet.',
    },
    {
      value: 'tf_mlp',
      label: 'TensorFlow MLP',
      requiresSklearn: true,
      runtimeImplemented: false,
      blockedReason: 'A TensorFlow MLP classification runtime is not wired into the backend yet.',
    },
  ],
  anomaly: [
    { value: 'isolation_forest', label: 'Isolation Forest', requiresSklearn: true, runtimeImplemented: true },
    {
      value: 'autoencoder',
      label: 'Autoencoder',
      requiresSklearn: true,
      runtimeImplemented: false,
      blockedReason: 'An autoencoder anomaly runtime is not wired into the backend yet.',
    },
  ],
  clustering: [
    { value: 'kmeans', label: 'K-Means', requiresSklearn: true, runtimeImplemented: true },
    { value: 'dbscan', label: 'DBSCAN', requiresSklearn: true, runtimeImplemented: true },
  ],
  dim_reduction: [
    { value: 'pca', label: 'PCA', requiresSklearn: true, runtimeImplemented: true },
  ],
  timeseries: [
    { value: 'moving_avg', label: 'Moving average', requiresSklearn: false, runtimeImplemented: true },
    {
      value: 'naive',
      label: 'Naive forecast',
      requiresSklearn: false,
      runtimeImplemented: false,
      blockedReason: 'A naive forecasting runtime is not wired into the backend yet.',
    },
    {
      value: 'arima',
      label: 'ARIMA',
      requiresSklearn: false,
      runtimeImplemented: false,
      blockedReason: 'An ARIMA backend runtime is not wired into the backend yet.',
    },
    {
      value: 'exp_smoothing',
      label: 'Exponential smoothing',
      requiresSklearn: false,
      runtimeImplemented: false,
      blockedReason: 'An exponential smoothing backend runtime is not wired into the backend yet.',
    },
  ],
};

function buildCapabilitiesSnapshot(capabilities = {}) {
  return {
    sklearn: !!capabilities?.sklearn,
    pandas: !!capabilities?.pandas,
    numpy: !!capabilities?.numpy,
    statsmodels: !!capabilities?.statsmodels,
    shap: !!capabilities?.shap,
    xgboost: !!capabilities?.xgboost,
    lightgbm: !!capabilities?.lightgbm,
    catboost: !!capabilities?.catboost,
    pytorch_tabnet: !!capabilities?.pytorch_tabnet,
    rtdl: !!capabilities?.rtdl,
    deepLearningMode: capabilities?.deepLearningMode || '',
    fallbackModels: cloneValue(capabilities?.fallbackModels || {}),
  };
}

function sanitizeRequest(request = {}) {
  const safeRequest = cloneValue(request || {});
  safeRequest.task = String(safeRequest.task || '').trim().toLowerCase();
  safeRequest.model = String(safeRequest.model || '').trim().toLowerCase();
  safeRequest.args = safeRequest.args && typeof safeRequest.args === 'object' ? cloneValue(safeRequest.args) : {};
  safeRequest.options = safeRequest.options && typeof safeRequest.options === 'object' ? cloneValue(safeRequest.options) : {};
  safeRequest.args.target = safeRequest.args.target != null ? String(safeRequest.args.target || '') : '';
  safeRequest.args.features = Array.isArray(safeRequest.args.features)
    ? safeRequest.args.features.map((value) => String(value)).filter(Boolean)
    : [];
  if (safeRequest.args.timeColumn != null) {
    safeRequest.args.timeColumn = String(safeRequest.args.timeColumn || '');
  }
  return safeRequest;
}

function buildRequirements(task = '', capabilities = {}) {
  const requirements = [];
  if (!capabilities?.sklearn && ['regression', 'classification', 'anomaly', 'clustering', 'dim_reduction'].includes(task)) {
    requirements.push('Install scikit-learn on the backend to enable the full ML estimator set.');
  }
  if (['regression', 'classification'].includes(task) && (!capabilities?.pandas || !capabilities?.numpy)) {
    requirements.push('Install pandas and numpy on the backend to enable the linear fallback runtime.');
  }
  if (['clustering', 'dim_reduction'].includes(task) && (!capabilities?.pandas || !capabilities?.numpy)) {
    requirements.push('Install pandas and numpy on the backend to enable the unsupervised fallback runtime.');
  }
  if (task === 'classification' && !capabilities?.statsmodels) {
    requirements.push('Install statsmodels on the backend to unlock the logistic fallback path for binary classification.');
  }
  return requirements;
}

function getModelRequirementMessage(model = '') {
  return MODEL_REQUIREMENTS[String(model || '').toLowerCase()] || '';
}

function getCatalogEntry(task = '', model = '') {
  const normalizedTask = String(task || '').trim().toLowerCase();
  const normalizedModel = String(model || '').trim().toLowerCase();
  return (ML_MODEL_CATALOG[normalizedTask] || []).find((entry) => entry.value === normalizedModel) || null;
}

function supportsLinearFallback(task = '', capabilities = {}) {
  const fallbackModels = Array.isArray(capabilities?.fallbackModels?.[task]) ? capabilities.fallbackModels[task] : [];
  return (
    ['regression', 'classification'].includes(String(task || ''))
    && !capabilities?.sklearn
    && !!capabilities?.pandas
    && !!capabilities?.numpy
    && fallbackModels.includes('linear')
  );
}

function getFallbackEffectiveModel(task = '', requestedModel = '', capabilities = {}) {
  const normalizedTask = String(task || '').trim().toLowerCase();
  const normalizedModel = String(requestedModel || '').trim().toLowerCase();
  const fallbackModels = Array.isArray(capabilities?.fallbackModels?.[normalizedTask]) ? capabilities.fallbackModels[normalizedTask] : [];
  if (!fallbackModels.length || !capabilities?.pandas || !capabilities?.numpy) return '';
  if (['regression', 'classification'].includes(normalizedTask) && fallbackModels.includes('linear')) {
    return 'linear';
  }
  if (['clustering', 'dim_reduction'].includes(normalizedTask) && fallbackModels.includes(normalizedModel)) {
    return normalizedModel;
  }
  return '';
}

function getMlArtifactKind(task = '') {
  return ['clustering', 'dim_reduction'].includes(String(task || '').trim().toLowerCase())
    ? 'ml-unsupervised'
    : 'ml-model';
}

export function getMlTaskModelCatalog(task = '') {
  return cloneValue(ML_MODEL_CATALOG[String(task || '').trim().toLowerCase()] || []);
}

export function getMlModelAvailability(task = '', model = '', capabilities = {}, capabilityError = '') {
  const normalizedTask = String(task || '').trim().toLowerCase();
  const catalog = getMlTaskModelCatalog(normalizedTask);
  const defaultModel = catalog[0]?.value || '';
  const requestedModel = String(model || defaultModel || '').trim().toLowerCase();
  const entry = getCatalogEntry(normalizedTask, requestedModel) || catalog[0] || null;
  const requestedLabel = entry?.label || requestedModel || 'model';
  const requirements = buildRequirements(normalizedTask, capabilities);
  const notes = [];
  const fallbackEffectiveModel = getFallbackEffectiveModel(normalizedTask, entry?.value || requestedModel, capabilities);
  const hasFallback = !!fallbackEffectiveModel;

  if (!normalizedTask) {
    return {
      status: 'blocked',
      requestedModel,
      requestedLabel,
      effectiveModel: '',
      reason: 'The ML preset is missing its task type.',
      requirements,
      notes,
    };
  }

  if (capabilityError && !Object.keys(capabilities || {}).length) {
    return {
      status: 'blocked',
      requestedModel,
      requestedLabel,
      effectiveModel: '',
      reason: capabilityError,
      requirements,
      notes,
    };
  }

  if (!entry) {
    const reason = `The selected model '${requestedModel || 'unknown'}' is not supported for ${normalizedTask}.`;
    return {
      status: 'blocked',
      requestedModel,
      requestedLabel,
      effectiveModel: '',
      reason,
      requirements,
      notes,
    };
  }

  const runtimeRequirement = getModelRequirementMessage(entry.value);
  const blockedBaseReason = entry.blockedReason || `The selected model '${requestedLabel}' is not wired into the backend yet.`;
  const modelRequirements = runtimeRequirement ? [runtimeRequirement] : [];
  if (entry.capability && !capabilities?.[entry.capability]) {
    modelRequirements.unshift(runtimeRequirement || `Install the backend package required for ${requestedLabel}.`);
  }
  const mergedRequirements = Array.from(new Set([...requirements, ...modelRequirements]));

  if (entry.runtimeImplemented === false) {
    return {
      status: 'blocked',
      requestedModel: entry.value,
      requestedLabel,
      effectiveModel: '',
      reason: blockedBaseReason,
      requirements: mergedRequirements,
      notes,
    };
  }

  if (entry.requiresSklearn !== false && !capabilities?.sklearn) {
    if (hasFallback) {
      if (normalizedTask === 'regression' || normalizedTask === 'classification') {
        if (entry.value === 'linear') {
          notes.push('scikit-learn is unavailable, so the backend will use the linear fallback runtime.');
        } else {
          notes.push(`Requested ${requestedLabel} cannot run directly without scikit-learn, so the backend will use the linear baseline.`);
        }
      } else if (normalizedTask === 'clustering' || normalizedTask === 'dim_reduction') {
        notes.push(`scikit-learn is unavailable, so the backend will use the numpy fallback runtime for ${requestedLabel}.`);
      }
      if (normalizedTask === 'classification' && !capabilities?.statsmodels) {
        notes.push('Binary classification fallback may degrade to a majority-class baseline because statsmodels is unavailable.');
      }
      return {
        status: 'fallback',
        requestedModel: entry.value,
        requestedLabel,
        effectiveModel: fallbackEffectiveModel,
        reason: capabilities?.sklearn === false
          ? 'scikit-learn is unavailable in the current backend environment.'
          : `${normalizedTask} training is unavailable in this backend environment.`,
        requirements: mergedRequirements,
        notes,
      };
    }
    return {
      status: 'blocked',
      requestedModel: entry.value,
      requestedLabel,
      effectiveModel: '',
      reason: capabilityError || `${requestedLabel} requires scikit-learn on the backend.`,
      requirements: mergedRequirements,
      notes,
    };
  }

  return {
    status: 'runnable',
    requestedModel: entry.value,
    requestedLabel,
    effectiveModel: entry.value,
    reason: `${requestedLabel} can run directly in the current backend environment.`,
    requirements: mergedRequirements,
    notes,
  };
}

export function getMlExecutionPlan(request = {}, capabilities = {}, capabilityError = '') {
  const normalizedRequest = sanitizeRequest(request);
  const task = normalizedRequest.task;
  const availability = getMlModelAvailability(task, normalizedRequest.model, capabilities, capabilityError);

  if (!normalizedRequest.model) {
    normalizedRequest.model = availability.requestedModel || '';
  }
  if (availability.effectiveModel) {
    normalizedRequest.model = availability.effectiveModel;
  }

  return {
    runnable: availability.status !== 'blocked',
    availability: availability.status,
    reason: availability.reason,
    requirements: availability.requirements,
    notes: availability.notes,
    requestedModel: availability.requestedModel || sanitizeRequest(request).model || '',
    effectiveModel: availability.effectiveModel || normalizedRequest.model || '',
    normalizedRequest,
    capabilities: buildCapabilitiesSnapshot(capabilities),
  };
}

export function buildMlRequestKey(request = {}, capabilities = {}) {
  const plan = getMlExecutionPlan(request, capabilities);
  const safeRequest = sanitizeRequest(request);
  const normalizedRequest = sanitizeRequest(plan.normalizedRequest);
  return JSON.stringify({
    task: normalizedRequest.task,
    requestedModel: plan.requestedModel || safeRequest.model || '',
    model: normalizedRequest.model,
    availability: plan.availability || 'runnable',
    args: normalizedRequest.args || {},
    options: normalizedRequest.options || {},
  });
}

function summarizeMlResult(result = {}, request = {}, meta = {}) {
  const task = String(result?.task || request?.task || '').toLowerCase();
  const requestedModel = meta.requestedModel || request?.model || result?.model || 'model';
  const effectiveModel = meta.effectiveModel || result?.model || request?.model || 'model';
  const availability = meta.availability || (result?.diagnostics?.runtime === 'fallback' ? 'fallback' : 'runnable');
  const metrics = result?.metrics || {};

  const modelPhrase = availability === 'fallback' && requestedModel && requestedModel !== effectiveModel
    ? `requested ${requestedModel}, executed ${effectiveModel}`
    : `model ${effectiveModel}`;
  const runtimePhrase = availability === 'fallback' ? 'fallback runtime' : 'direct runtime';

  if (task === 'regression') {
    return `Regression ready via ${runtimePhrase}; ${modelPhrase}. R2 ${fmtMetric(metrics.r2)}, MAE ${fmtMetric(metrics.mae)}, RMSE ${fmtMetric(metrics.rmse)}.`;
  }
  if (task === 'classification') {
    return `Classification ready via ${runtimePhrase}; ${modelPhrase}. Accuracy ${fmtMetric(metrics.accuracy)}, F1 ${fmtMetric(metrics.f1_weighted)}, precision ${fmtMetric(metrics.precision_weighted)}.`;
  }
  if (task === 'clustering') {
    const silhouette = metrics.silhouette != null ? `, silhouette ${fmtMetric(metrics.silhouette)}` : '';
    const inertia = metrics.inertia != null ? `, inertia ${fmtMetric(metrics.inertia)}` : '';
    return `Clustering ready via ${runtimePhrase}; ${modelPhrase}. Clusters ${fmtMetric(metrics.cluster_count, 0)}${silhouette}${inertia}.`;
  }
  if (task === 'dim_reduction') {
    return `Projection ready via ${runtimePhrase}; ${modelPhrase}. Explained variance ${fmtMetric(metrics.explained_variance_total)} across ${fmtMetric(metrics.component_count, 0)} components.`;
  }
  return `${task || 'ML'} result is ready via ${runtimePhrase} with ${effectiveModel}.`;
}

export function buildMlArtifactSignature(dataset, request = {}, capabilities = {}, plan = null) {
  const effectivePlan = plan || getMlExecutionPlan(request, capabilities);
  const normalizedRequest = sanitizeRequest(effectivePlan.normalizedRequest || request);
  return JSON.stringify({
    sourceDatasetId: dataset?.id || '',
    sourceVersion: Number(dataset?.version || 0),
    request: JSON.parse(buildMlRequestKey({
      ...sanitizeRequest(request),
      model: effectivePlan.requestedModel || sanitizeRequest(request).model || normalizedRequest.model,
      task: normalizedRequest.task,
      args: normalizedRequest.args,
      options: normalizedRequest.options,
    }, capabilities)),
  });
}

export function buildMlArtifact(dataset, request = {}, result = {}, capabilities = {}, plan = null) {
  const safeResult = cloneValue(result || {});
  const safeRequest = sanitizeRequest(request);
  const effectivePlan = plan || getMlExecutionPlan(safeRequest, capabilities);
  const mergedWarnings = [
    ...(Array.isArray(effectivePlan?.notes) ? effectivePlan.notes : []),
    ...(Array.isArray(safeResult?.warnings) ? safeResult.warnings : []),
  ];
  const warnings = Array.from(new Set(mergedWarnings));
  if (warnings.length) safeResult.warnings = warnings;
  const normalizedRequest = sanitizeRequest(effectivePlan.normalizedRequest || safeRequest);
  const effectiveModel = safeResult?.model || effectivePlan?.effectiveModel || normalizedRequest.model || '';
  const availability = effectivePlan?.availability || (safeResult?.diagnostics?.runtime === 'fallback' ? 'fallback' : 'runnable');

  return {
    kind: getMlArtifactKind(normalizedRequest.task),
    status: 'ready',
    availability,
    availabilityReason: effectivePlan?.reason || '',
    requestedModel: effectivePlan?.requestedModel || safeRequest.model || '',
    effectiveModel,
    createdAt: Date.now(),
    sourceDatasetId: dataset?.id || '',
    sourceVersion: Number(dataset?.version || 0),
    signature: buildMlArtifactSignature(dataset, safeRequest, capabilities, effectivePlan),
    request: safeRequest,
    normalizedRequest,
    result: safeResult,
    summary: summarizeMlResult(safeResult, safeRequest, {
      availability,
      requestedModel: effectivePlan?.requestedModel || safeRequest.model || '',
      effectiveModel,
    }),
    requirements: Array.from(new Set(effectivePlan?.requirements || [])),
    warnings,
    capabilities: buildCapabilitiesSnapshot(capabilities),
  };
}

export function buildMlBlockedArtifact(dataset, request = {}, capabilities = {}, reason = '', requirements = [], plan = null) {
  const safeRequest = sanitizeRequest(request);
  const effectivePlan = plan || getMlExecutionPlan(safeRequest, capabilities, reason);
  const normalizedRequest = sanitizeRequest(effectivePlan.normalizedRequest || safeRequest);
  const requestedModel = effectivePlan?.requestedModel || safeRequest.model || '';
  const artifactRequirements = Array.from(new Set([...(requirements || []), ...(effectivePlan.requirements || [])]));
  const summary = requestedModel
    ? `ML run is blocked for '${requestedModel}': ${reason || effectivePlan.reason || 'required backend support is unavailable.'}`
    : (reason
      ? `ML run is blocked: ${reason}`
      : `ML run is blocked for ${normalizedRequest.task || 'this preset'}.`);

  return {
    kind: getMlArtifactKind(normalizedRequest.task),
    status: 'blocked',
    availability: 'blocked',
    availabilityReason: reason || effectivePlan?.reason || '',
    requestedModel,
    effectiveModel: '',
    createdAt: Date.now(),
    sourceDatasetId: dataset?.id || '',
    sourceVersion: Number(dataset?.version || 0),
    signature: buildMlArtifactSignature(dataset, safeRequest, capabilities, effectivePlan),
    request: safeRequest,
    normalizedRequest,
    result: null,
    summary,
    requirements: artifactRequirements,
    warnings: Array.from(new Set(effectivePlan.notes || [])),
    capabilities: buildCapabilitiesSnapshot(capabilities),
    error: reason || effectivePlan?.reason || '',
  };
}
