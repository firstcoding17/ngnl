import {
  buildRuntimeStatusDisplay,
  collectArtifactRequirements,
  collectArtifactWarnings,
  inferArtifactRuntimeState,
  resolveArtifactRuntimeReason,
} from '@/utils/runtimeStatus';
import { buildRecommendationPromptSuggestions } from '@/utils/recommendationEngine';

function uniqueStrings(values = []) {
  return Array.from(
    new Set(
      values
        .map((value) => String(value ?? '').trim())
        .filter(Boolean)
    )
  );
}

function formatValue(value) {
  if (Array.isArray(value)) return value.map((item) => String(item || '').trim()).filter(Boolean).join(', ');
  if (value && typeof value === 'object') return JSON.stringify(value);
  return String(value ?? '').trim();
}

function formatEntries(section = {}, limit = 3) {
  return Object.entries(section || {})
    .map(([label, value]) => {
      const text = formatValue(value);
      if (!text) return '';
      return `${label}: ${text}`;
    })
    .filter(Boolean)
    .slice(0, limit);
}

function compactSummary(text = '') {
  return String(text || '')
    .replace(/\s+/g, ' ')
    .trim();
}

function reportRuntimeArtifact(report = null) {
  if (!report) return null;
  return {
    availability: report.status || '',
    availabilityReason: report.sections?.runtime?.reason || '',
    requirements: Array.isArray(report.sections?.runtime?.requirements) ? report.sections.runtime.requirements : [],
    warnings: Array.isArray(report.sections?.runtime?.warnings) ? report.sections.runtime.warnings : [],
    status: report.status || '',
  };
}

function inferResultKind(context = {}) {
  const artifact = context.primaryArtifact || null;
  const report = context.primaryReport || null;
  return String(
    report?.type
    || artifact?.kind
    || context.analysis?.resultType
    || context.analysis?.method
    || context.task?.type
    || 'analysis'
  ).trim().toLowerCase();
}

function buildScopeTitle(context = {}) {
  if (context.analysis?.title) return context.analysis.title;
  if (context.task?.title) return context.task.title;
  return context.dashboard?.title || 'Current dashboard';
}

function buildScopeLabel(context = {}) {
  if (context.analysis?.title) return `Analysis: ${context.analysis.title}`;
  if (context.task?.title) return `Task: ${context.task.title}`;
  return `Dashboard: ${context.dashboard?.title || 'Untitled dashboard'}`;
}

function buildResultBasisSummary(context = {}) {
  const report = context.primaryReport || null;
  const artifact = context.primaryArtifact || null;
  const executionSummary = compactSummary(
    context.analysis?.executionSummary
    || context.task?.executionSummary
    || ''
  );

  const resultLines = [
    ...formatEntries(report?.sections?.results, 3),
    ...formatEntries(report?.sections?.overview, 2),
  ];

  const artifactSummary = compactSummary(artifact?.summary || '');
  const lines = uniqueStrings([
    executionSummary,
    artifactSummary,
    ...resultLines,
  ]).slice(0, 4);

  if (!lines.length) {
    return 'No saved artifact or report is attached to the current selection yet.';
  }
  return lines.join(' ');
}

function buildInterpretationSummary(context = {}) {
  const report = context.primaryReport || null;
  const interpretation = formatEntries(report?.sections?.interpretation, 3);
  if (interpretation.length) return interpretation.join(' ');

  const warnings = uniqueStrings([
    ...collectArtifactWarnings(context.primaryArtifact),
    ...(Array.isArray(report?.sections?.runtime?.warnings) ? report.sections.runtime.warnings : []),
  ]);

  if (warnings.length) return `Watch-outs: ${warnings.slice(0, 3).join(' ')}`;
  return 'Interpretation is limited because no structured report notes were saved yet.';
}

function buildValidationSummary(context = {}) {
  const report = context.primaryReport || null;
  const resultRuntime = context.resultRuntimeArtifact || null;
  const caveats = uniqueStrings([
    ...formatEntries(report?.sections?.interpretation, 4),
    ...collectArtifactWarnings(context.primaryArtifact),
    ...(Array.isArray(report?.sections?.runtime?.warnings) ? report.sections.runtime.warnings : []),
    ...(Array.isArray(resultRuntime?.warnings) ? resultRuntime.warnings : []),
  ]).slice(0, 4);

  if (caveats.length) return caveats.join(' ');
  return 'Validate the target columns, row counts, and runtime mode before trusting this result.';
}

function buildResultRuntimeArtifact(context = {}) {
  return reportRuntimeArtifact(context.primaryReport) || context.primaryArtifact || null;
}

function buildRuntimeExplanation(context = {}) {
  const resultArtifact = context.resultRuntimeArtifact || null;
  const assistantArtifact = context.assistantRuntimeArtifact || null;
  const resultDisplay = buildRuntimeStatusDisplay(resultArtifact);
  const assistantDisplay = buildRuntimeStatusDisplay(assistantArtifact);

  const lines = [];
  if (resultDisplay.show) {
    lines.push(`Current result status: ${resultDisplay.state}. ${resultDisplay.reason || 'The saved artifact is available for reuse.'}`);
    if (resultDisplay.requirements.length) lines.push(`Requirements: ${resultDisplay.requirements.slice(0, 2).join(' ')}`);
    if (resultDisplay.warnings.length) lines.push(`Warnings: ${resultDisplay.warnings.slice(0, 2).join(' ')}`);
  } else {
    lines.push('Current result status: warning. No saved artifact or report is attached yet.');
  }
  if (assistantDisplay.show) {
    lines.push(`Assistant runtime: ${assistantDisplay.state}. ${assistantDisplay.reason || 'The chat assistant is ready.'}`);
  }
  return lines.join(' ');
}

function buildNextSteps(context = {}) {
  const recommendationNext = Array.isArray(context.recommendationSummary?.categories?.nextStep)
    ? context.recommendationSummary.categories.nextStep.map((item) => item.reason).filter(Boolean)
    : [];
  if (recommendationNext.length) return uniqueStrings(recommendationNext).slice(0, 4);

  const report = context.primaryReport || null;
  const reportNext = Array.isArray(report?.sections?.nextSteps) ? report.sections.nextSteps : [];
  if (reportNext.length) return uniqueStrings(reportNext).slice(0, 4);

  const kind = inferResultKind(context);
  if (kind.includes('corr')) {
    return [
      'Validate the strongest pairs with a scatter or regression view.',
      'Run group comparison tests if a category column may explain the pattern.',
      'Check whether highly correlated fields should be reduced before modeling.',
    ];
  }
  if (kind.includes('test') || kind.includes('anova') || kind.includes('ttest') || kind.includes('chisq')) {
    return [
      'Visualize the compared groups before making a final call.',
      'Run a follow-up model if group differences may drive the target.',
      'Check sample size and assumptions before trusting the p-value.',
    ];
  }
  if (kind.includes('regression')) {
    return [
      'Compare one additional regression model or feature set.',
      'Review residual behavior and feature selection.',
      'Test whether the prepared dataset should replace the source dataset for this task.',
    ];
  }
  if (kind.includes('classification')) {
    return [
      'Inspect the confusion matrix and class balance before iterating.',
      'Try another classifier or rebalance the target classes.',
      'Review which features matter most for the current label.',
    ];
  }
  if (kind.includes('cluster') || kind.includes('dbscan') || kind.includes('kmeans')) {
    return [
      'Project the clusters with PCA for an easier visual check.',
      'Compare alternative cluster counts or density settings.',
      'Review whether a smaller feature set gives cleaner group separation.',
    ];
  }
  if (kind.includes('pca')) {
    return [
      'Use the PCA projection for clustering or charting next.',
      'Check which source features dominate the first components.',
      'Decide whether a lower-dimensional feature table is good enough for modeling.',
    ];
  }
  if (kind.includes('text')) {
    return [
      'Use the derived text features for PCA or clustering.',
      'Attach a target column if you want text classification or regression.',
      'Compare TF-IDF, sentiment, and embedding outputs before choosing one.',
    ];
  }
  if (kind.includes('image')) {
    return [
      'Project the image feature table with PCA to inspect separation.',
      'Attach labels if you want a lightweight image classification run.',
      'Review failures and fallback counts before expanding the runtime.',
    ];
  }
  return [
    'Start with one chart and one statistical check for the current dataset.',
    'Use the saved runtime summary to decide whether preparation is complete.',
    'Open the next analysis only after the current result looks trustworthy.',
  ];
}

function buildSuggestedPrompts(context = {}) {
  const statusLabel = buildRuntimeStatusDisplay(context.resultRuntimeArtifact || context.assistantRuntimeArtifact).label || 'runtime';
  const prompts = [
    {
      label: 'Summarize current focus',
      prompt: 'Summarize the current task and analysis for me.',
      reason: 'Get a compact overview of the current dashboard context.',
    },
    {
      label: 'Explain current result',
      prompt: 'What do these results mean?',
      reason: 'Interpret the saved artifact and report in plain language.',
    },
    {
      label: 'Explain runtime status',
      prompt: `Why is this running in ${statusLabel} mode?`,
      reason: 'Clarify direct, fallback, warning, or blocked runtime states.',
    },
    {
      label: 'Recommend next analysis',
      prompt: 'What analysis should I run next?',
      reason: 'Use the current result to pick the safest next step.',
    },
    {
      label: 'Check trust and limits',
      prompt: 'What should I validate before trusting this result?',
      reason: 'Review assumptions, caveats, and runtime limitations.',
    },
  ];
  return uniqueStrings([
    ...prompts.map((item) => JSON.stringify(item)),
    ...buildRecommendationPromptSuggestions(context.recommendationSummary).map((item) => JSON.stringify(item)),
  ]).map((item) => JSON.parse(item)).slice(0, 6);
}

function buildSummaryCard(context = {}) {
  const topRecommendation = context.recommendationSummary?.top?.[0] || null;
  return {
    title: 'Current selection',
    body: [
      buildScopeLabel(context),
      `${context.dataset?.name || 'untitled'} · ${context.dataset?.rowCount || 0} rows / ${context.dataset?.columnCount || 0} cols`,
      buildResultBasisSummary(context),
      topRecommendation ? `Top recommendation: ${topRecommendation.label}` : '',
    ].filter(Boolean).join(' | '),
  };
}

function buildRuntimeCard(context = {}) {
  const resultArtifact = context.resultRuntimeArtifact || null;
  const assistantArtifact = context.assistantRuntimeArtifact || null;
  const resultDisplay = buildRuntimeStatusDisplay(resultArtifact);
  const assistantDisplay = buildRuntimeStatusDisplay(assistantArtifact);
  const body = [
    resultDisplay.show ? `Result: ${resultDisplay.state}${resultDisplay.reason ? ` - ${resultDisplay.reason}` : ''}` : '',
    assistantDisplay.show ? `Assistant: ${assistantDisplay.state}${assistantDisplay.reason ? ` - ${assistantDisplay.reason}` : ''}` : '',
  ].filter(Boolean).join(' | ');
  return {
    title: 'Runtime status',
    body: body || 'Runtime details are not available yet.',
  };
}

function buildNextStepCard(context = {}) {
  const nextSteps = buildNextSteps(context);
  return {
    title: 'Recommended next steps',
    body: nextSteps.map((step, index) => `${index + 1}. ${step}`).join(' '),
  };
}

export function buildAnalysisAssistantContext(input = {}) {
  const primaryArtifact = input.artifacts?.stat
    || input.artifacts?.ml
    || input.artifacts?.textFeature
    || input.artifacts?.imageFeature
    || input.artifacts?.textOverview
    || null;
  const primaryReport = input.analysis?.report
    || input.task?.report
    || input.task?.taskReport
    || null;
  const resultRuntimeArtifact = buildResultRuntimeArtifact({
    primaryArtifact,
    primaryReport,
  });

  return {
    dashboard: input.dashboard || {},
    task: input.task || {},
    analysis: input.analysis || {},
    dataset: input.dataset || {},
    artifacts: input.artifacts || {},
    recommendationSummary: input.recommendationSummary || null,
    primaryArtifact,
    primaryReport,
    resultRuntimeArtifact,
    assistantRuntimeArtifact: input.assistantRuntimeArtifact || null,
  };
}

export function buildAnalysisAssistantPrompts(context = {}) {
  return buildSuggestedPrompts(context);
}

export function buildAnalysisAssistantSummary(context = {}) {
  const report = context.primaryReport || null;
  const artifact = context.primaryArtifact || null;
  return {
    title: buildScopeTitle(context),
    scope: buildScopeLabel(context),
    taskTitle: context.task?.title || '',
    analysisTitle: context.analysis?.title || '',
    dataset: `${context.dataset?.name || 'untitled'} · ${context.dataset?.rowCount || 0} rows / ${context.dataset?.columnCount || 0} cols`,
    resultLabel: report?.title || artifact?.kind || 'No saved result yet',
    resultSummary: buildResultBasisSummary(context),
    runtimeState: inferArtifactRuntimeState(context.resultRuntimeArtifact || context.assistantRuntimeArtifact || null),
  };
}

export function buildAnalysisAssistantReply(promptText, context = {}) {
  const prompt = String(promptText || '').toLowerCase();
  const summaryText = buildResultBasisSummary(context);
  const nextSteps = buildNextSteps(context);
  const suggestions = buildSuggestedPrompts(context);

  if (
    prompt.includes('status')
    || prompt.includes('fallback')
    || prompt.includes('blocked')
    || prompt.includes('direct')
    || prompt.includes('runtime')
    || prompt.includes('environment')
  ) {
    return {
      text: buildRuntimeExplanation(context),
      cards: [buildRuntimeCard(context), buildSummaryCard(context)],
      suggestions,
      warnings: uniqueStrings([
        ...collectArtifactWarnings(context.resultRuntimeArtifact),
        ...collectArtifactWarnings(context.assistantRuntimeArtifact),
      ]).slice(0, 3),
    };
  }

  if (prompt.includes('next') || prompt.includes('recommend') || prompt.includes('what should i') || prompt.includes('what analysis')) {
    return {
      text: [
        `Current focus: ${buildScopeLabel(context)}.`,
        `Suggested next step: ${nextSteps[0] || 'Start with a descriptive summary and one chart.'}`,
        nextSteps[1] ? `After that: ${nextSteps[1]}` : '',
      ].filter(Boolean).join(' '),
      cards: [buildNextStepCard(context), buildSummaryCard(context)],
      suggestions,
      warnings: [],
    };
  }

  if (
    prompt.includes('trust')
    || prompt.includes('limit')
    || prompt.includes('validate')
    || prompt.includes('careful')
    || prompt.includes('risk')
  ) {
    const requirements = uniqueStrings([
      ...collectArtifactRequirements(context.resultRuntimeArtifact),
      ...collectArtifactRequirements(context.assistantRuntimeArtifact),
    ]).slice(0, 3);
    return {
      text: buildValidationSummary(context),
      cards: [
        buildSummaryCard(context),
        {
          title: 'Validation checklist',
          body: requirements.length
            ? requirements.map((item, index) => `${index + 1}. ${item}`).join(' ')
            : 'Check the runtime mode, attached dataset, and any warnings before sharing this result.',
        },
      ],
      suggestions,
      warnings: uniqueStrings([
        ...collectArtifactWarnings(context.resultRuntimeArtifact),
        ...collectArtifactWarnings(context.assistantRuntimeArtifact),
      ]).slice(0, 3),
    };
  }

  if (
    prompt.includes('mean')
    || prompt.includes('interpret')
    || prompt.includes('insight')
    || prompt.includes('finding')
    || prompt.includes('result')
  ) {
    return {
      text: [
        `Current result: ${summaryText}`,
        buildInterpretationSummary(context),
      ].filter(Boolean).join(' '),
      cards: [
        buildSummaryCard(context),
        {
          title: 'Interpretation',
          body: buildInterpretationSummary(context),
        },
      ],
      suggestions,
      warnings: [],
    };
  }

  return {
    text: [
      `Current focus: ${buildScopeLabel(context)}.`,
      `Dataset: ${context.dataset?.name || 'untitled'} with ${context.dataset?.rowCount || 0} rows and ${context.dataset?.columnCount || 0} columns.`,
      `Latest result: ${summaryText}`,
      `Next step: ${nextSteps[0] || 'Start with a descriptive check and one chart.'}`,
    ].join(' '),
    cards: [buildSummaryCard(context), buildRuntimeCard(context), buildNextStepCard(context)],
    suggestions,
    warnings: [],
  };
}
