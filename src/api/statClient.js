import http from './http';

const BASE = '/stat/run';

export async function statSummary(payload) {
  return (await http.post(BASE, { ...(payload || {}), op: 'describe' })).data;
}
export async function statCorr(payload) {
  return (await http.post(BASE, { ...(payload || {}), op: 'corr' })).data;
}
export async function statTtest(payload) {
  const p = payload || {};
  return (await http.post(BASE, {
    ...p,
    op: 'ttest',
    args: {
      value: p.value ?? p.valueCol ?? p.args?.value,
      group: p.group ?? p.groupCol ?? p.args?.group,
    },
  })).data;
}
export async function statChi2(payload) {
  const p = payload || {};
  return (await http.post(BASE, {
    ...p,
    op: 'chisq',
    args: {
      a: p.a ?? p.colA ?? p.args?.a,
      b: p.b ?? p.colB ?? p.args?.b,
    },
  })).data;
}
export async function statLinReg(payload) {
  const p = payload || {};
  return (await http.post(BASE, {
    ...p,
    op: 'ols',
    args: {
      y: p.y ?? p.target ?? p.args?.y,
      x: p.x ?? p.features ?? p.args?.x,
    },
    options: {
      ...(p.options || {}),
      ...(p.addIntercept !== undefined ? { addIntercept: p.addIntercept } : {}),
      ...(p.dummy !== undefined ? { dummy: p.dummy } : {}),
      ...(p.dropFirst !== undefined ? { dropFirst: p.dropFirst } : {}),
      ...(p.robust !== undefined ? { robust: p.robust } : {}),
    },
  })).data;
}

export async function statAnova(payload) {
  const p = payload || {};
  return (await http.post(BASE, {
    ...p,
    op: 'anova',
    args: {
      value: p.value ?? p.valueCol ?? p.args?.value,
      group: p.group ?? p.groupCol ?? p.args?.group,
    },
  })).data;
}

export async function statTukey(payload) {
  const p = payload || {};
  return (await http.post(BASE, {
    ...p,
    op: 'tukey',
    args: {
      value: p.value ?? p.valueCol ?? p.args?.value,
      group: p.group ?? p.groupCol ?? p.args?.group,
      alpha: p.alpha ?? p.args?.alpha ?? 0.05,
    },
  })).data;
}

export async function statPairwiseAdjusted(payload) {
  const p = payload || {};
  return (await http.post(BASE, {
    ...p,
    op: 'pairwise_adjusted',
    args: {
      value: p.value ?? p.valueCol ?? p.args?.value,
      group: p.group ?? p.groupCol ?? p.args?.group,
      pAdjust: p.pAdjust ?? p.args?.pAdjust ?? 'holm',
    },
  })).data;
}

export async function statNormality(payload) {
  const p = payload || {};
  return (await http.post(BASE, {
    ...p,
    op: 'normality',
    args: {
      column: p.column ?? p.valueCol ?? p.args?.column,
    },
  })).data;
}

export async function statMeanCI(payload) {
  const p = payload || {};
  return (await http.post(BASE, {
    ...p,
    op: 'ci_mean',
    args: {
      column: p.column ?? p.valueCol ?? p.args?.column,
      confidence: p.confidence ?? p.args?.confidence ?? 0.95,
    },
  })).data;
}

export async function statMannWhitney(payload) {
  const p = payload || {};
  return (await http.post(BASE, {
    ...p,
    op: 'mannwhitney',
    args: {
      value: p.value ?? p.valueCol ?? p.args?.value,
      group: p.group ?? p.groupCol ?? p.args?.group,
    },
  })).data;
}

export async function statWilcoxon(payload) {
  const p = payload || {};
  return (await http.post(BASE, {
    ...p,
    op: 'wilcoxon',
    args: {
      a: p.a ?? p.colA ?? p.args?.a,
      b: p.b ?? p.colB ?? p.args?.b,
    },
  })).data;
}

export async function statKruskal(payload) {
  const p = payload || {};
  return (await http.post(BASE, {
    ...p,
    op: 'kruskal',
    args: {
      value: p.value ?? p.valueCol ?? p.args?.value,
      group: p.group ?? p.groupCol ?? p.args?.group,
    },
  })).data;
}

export async function statRecommend(payload) {
  const p = payload || {};
  return (await http.post(BASE, {
    ...p,
    op: 'recommend',
    args: {
      goal: p.goal ?? p.args?.goal ?? 'auto',
      value: p.value ?? p.valueCol ?? p.args?.value,
      group: p.group ?? p.groupCol ?? p.args?.group,
      a: p.a ?? p.colA ?? p.args?.a,
      b: p.b ?? p.colB ?? p.args?.b,
    },
  })).data;
}

export async function statQuality(payload) {
  const p = payload || {};
  return (await http.post(BASE, {
    ...p,
    op: 'quality',
    args: {
      columns: p.columns ?? p.args?.columns,
      method: p.method ?? p.args?.method ?? 'iqr',
      iqrK: p.iqrK ?? p.args?.iqrK ?? 1.5,
      zThresh: p.zThresh ?? p.args?.zThresh ?? 3.0,
    },
  })).data;
}

export async function statQualityProcess(payload) {
  const p = payload || {};
  return (await http.post(BASE, {
    ...p,
    op: 'quality_process',
    args: {
      strategy: p.strategy ?? p.args?.strategy ?? 'exclude',
      method: p.method ?? p.args?.method ?? 'iqr',
      columns: p.columns ?? p.args?.columns,
      iqrK: p.iqrK ?? p.args?.iqrK ?? 1.5,
      zThresh: p.zThresh ?? p.args?.zThresh ?? 3.0,
      dropMissing: p.dropMissing ?? p.args?.dropMissing,
    },
  })).data;
}
