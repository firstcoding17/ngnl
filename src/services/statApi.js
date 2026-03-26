import { authFetch, jsonHeaders, parseJsonResponse } from '@/api/fetchClient';

export async function getStatCapabilities() {
  const res = await authFetch('/stat/capabilities', {
    method: 'GET',
    headers: jsonHeaders(),
  });
  const data = await parseJsonResponse(res, 'stat capability check failed');
  return data?.data || { scipy: false, statsmodels: false };
}

export async function runStatDescribe(rows, columns, options) {
  const res = await authFetch('/stat/run', {
    method: 'POST',
    headers: jsonHeaders(),
    body: JSON.stringify({
      op: 'describe',
      rows,
      options: { topNCat: options?.topNCat ?? 10 }
    })
  });
  return parseJsonResponse(res, 'stat describe failed');
}

export async function runStatCorr(rows, options) {
  const res = await authFetch('/stat/run', {
    method: 'POST',
    headers: jsonHeaders(),
    body: JSON.stringify({
      op: 'corr',
      rows,
      options: { topNPairs: options?.topNPairs ?? 20 }
    })
  });
  return parseJsonResponse(res, 'stat corr failed');
}

export async function runStatTTest(rows, value, group) {
  const res = await authFetch('/stat/run', {
    method: 'POST',
    headers: jsonHeaders(),
    body: JSON.stringify({ op: 'ttest', rows, args: { value, group } })
  });
  return parseJsonResponse(res, 'stat ttest failed');
}

export async function runStatChiSq(rows, a, b) {
  const res = await authFetch('/stat/run', {
    method: 'POST',
    headers: jsonHeaders(),
    body: JSON.stringify({ op: 'chisq', rows, args: { a, b } })
  });
  return parseJsonResponse(res, 'stat chisq failed');
}

export async function runStatOLS(rows, y, x, options) {
  const res = await authFetch('/stat/run', {
    method: 'POST',
    headers: jsonHeaders(),
    body: JSON.stringify({
      op: 'ols',
      rows,
      args: { y, x },
      options: {
        addIntercept: options?.addIntercept ?? true,
        dummy: options?.dummy ?? true,
        dropFirst: options?.dropFirst ?? true,
        robust: options?.robust ?? null
      }
    })
  });
  return parseJsonResponse(res, 'stat ols failed');
}

export async function runStatAnova(rows, value, group) {
  const res = await authFetch('/stat/run', {
    method: 'POST',
    headers: jsonHeaders(),
    body: JSON.stringify({ op: 'anova', rows, args: { value, group } })
  });
  return parseJsonResponse(res, 'stat anova failed');
}

export async function runStatNormality(rows, column) {
  const res = await authFetch('/stat/run', {
    method: 'POST',
    headers: jsonHeaders(),
    body: JSON.stringify({ op: 'normality', rows, args: { column } })
  });
  return parseJsonResponse(res, 'stat normality failed');
}

export async function runStatMeanCI(rows, column, confidence = 0.95) {
  const res = await authFetch('/stat/run', {
    method: 'POST',
    headers: jsonHeaders(),
    body: JSON.stringify({ op: 'ci_mean', rows, args: { column, confidence } })
  });
  return parseJsonResponse(res, 'stat ci_mean failed');
}

export async function runStatMannWhitney(rows, value, group) {
  const res = await authFetch('/stat/run', {
    method: 'POST',
    headers: jsonHeaders(),
    body: JSON.stringify({ op: 'mannwhitney', rows, args: { value, group } })
  });
  return parseJsonResponse(res, 'stat mannwhitney failed');
}

export async function runStatWilcoxon(rows, a, b) {
  const res = await authFetch('/stat/run', {
    method: 'POST',
    headers: jsonHeaders(),
    body: JSON.stringify({ op: 'wilcoxon', rows, args: { a, b } })
  });
  return parseJsonResponse(res, 'stat wilcoxon failed');
}

export async function runStatKruskal(rows, value, group) {
  const res = await authFetch('/stat/run', {
    method: 'POST',
    headers: jsonHeaders(),
    body: JSON.stringify({ op: 'kruskal', rows, args: { value, group } })
  });
  return parseJsonResponse(res, 'stat kruskal failed');
}

export async function runStatTukey(rows, value, group, alpha = 0.05) {
  const res = await authFetch('/stat/run', {
    method: 'POST',
    headers: jsonHeaders(),
    body: JSON.stringify({ op: 'tukey', rows, args: { value, group, alpha } })
  });
  return parseJsonResponse(res, 'stat tukey failed');
}

export async function runStatPairwiseAdjusted(rows, value, group, pAdjust = 'holm') {
  const res = await authFetch('/stat/run', {
    method: 'POST',
    headers: jsonHeaders(),
    body: JSON.stringify({ op: 'pairwise_adjusted', rows, args: { value, group, pAdjust } })
  });
  return parseJsonResponse(res, 'stat pairwise_adjusted failed');
}
