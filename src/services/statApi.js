function jsonHeaders() {
  const headers = { 'Content-Type': 'application/json' };
  const key = localStorage.getItem('beta_api_key') || '';
  if (key) headers['X-API-Key'] = key;
  return headers;
}

async function parseStatResponse(res, fallbackMsg) {
  if (!res.ok) throw new Error(fallbackMsg);
  const data = await res.json();
  if (data?.ok === false) {
    const code = data.code ? ` [${data.code}]` : '';
    throw new Error(`${data.message || fallbackMsg}${code}`);
  }
  return data;
}

export async function getStatCapabilities() {
  const res = await fetch('/stat/capabilities', {
    method: 'GET',
    headers: jsonHeaders(),
  });
  const data = await parseStatResponse(res, 'stat capability check failed');
  return data?.data || { scipy: false, statsmodels: false };
}

export async function runStatDescribe(rows, columns, options) {
  const res = await fetch('/stat/run', {
    method: 'POST',
    headers: jsonHeaders(),
    body: JSON.stringify({
      op: 'describe',
      rows,
      options: { topNCat: options?.topNCat ?? 10 }
    })
  });
  return parseStatResponse(res, 'stat describe failed');
}

export async function runStatCorr(rows, options) {
  const res = await fetch('/stat/run', {
    method: 'POST',
    headers: jsonHeaders(),
    body: JSON.stringify({
      op: 'corr',
      rows,
      options: { topNPairs: options?.topNPairs ?? 20 }
    })
  });
  return parseStatResponse(res, 'stat corr failed');
}

export async function runStatTTest(rows, value, group) {
  const res = await fetch('/stat/run', {
    method: 'POST',
    headers: jsonHeaders(),
    body: JSON.stringify({ op: 'ttest', rows, args: { value, group } })
  });
  return parseStatResponse(res, 'stat ttest failed');
}

export async function runStatChiSq(rows, a, b) {
  const res = await fetch('/stat/run', {
    method: 'POST',
    headers: jsonHeaders(),
    body: JSON.stringify({ op: 'chisq', rows, args: { a, b } })
  });
  return parseStatResponse(res, 'stat chisq failed');
}

export async function runStatOLS(rows, y, x, options) {
  const res = await fetch('/stat/run', {
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
  return parseStatResponse(res, 'stat ols failed');
}

export async function runStatAnova(rows, value, group) {
  const res = await fetch('/stat/run', {
    method: 'POST',
    headers: jsonHeaders(),
    body: JSON.stringify({ op: 'anova', rows, args: { value, group } })
  });
  return parseStatResponse(res, 'stat anova failed');
}

export async function runStatNormality(rows, column) {
  const res = await fetch('/stat/run', {
    method: 'POST',
    headers: jsonHeaders(),
    body: JSON.stringify({ op: 'normality', rows, args: { column } })
  });
  return parseStatResponse(res, 'stat normality failed');
}

export async function runStatMeanCI(rows, column, confidence = 0.95) {
  const res = await fetch('/stat/run', {
    method: 'POST',
    headers: jsonHeaders(),
    body: JSON.stringify({ op: 'ci_mean', rows, args: { column, confidence } })
  });
  return parseStatResponse(res, 'stat ci_mean failed');
}

export async function runStatMannWhitney(rows, value, group) {
  const res = await fetch('/stat/run', {
    method: 'POST',
    headers: jsonHeaders(),
    body: JSON.stringify({ op: 'mannwhitney', rows, args: { value, group } })
  });
  return parseStatResponse(res, 'stat mannwhitney failed');
}

export async function runStatWilcoxon(rows, a, b) {
  const res = await fetch('/stat/run', {
    method: 'POST',
    headers: jsonHeaders(),
    body: JSON.stringify({ op: 'wilcoxon', rows, args: { a, b } })
  });
  return parseStatResponse(res, 'stat wilcoxon failed');
}

export async function runStatKruskal(rows, value, group) {
  const res = await fetch('/stat/run', {
    method: 'POST',
    headers: jsonHeaders(),
    body: JSON.stringify({ op: 'kruskal', rows, args: { value, group } })
  });
  return parseStatResponse(res, 'stat kruskal failed');
}

export async function runStatTukey(rows, value, group, alpha = 0.05) {
  const res = await fetch('/stat/run', {
    method: 'POST',
    headers: jsonHeaders(),
    body: JSON.stringify({ op: 'tukey', rows, args: { value, group, alpha } })
  });
  return parseStatResponse(res, 'stat tukey failed');
}

export async function runStatPairwiseAdjusted(rows, value, group, pAdjust = 'holm') {
  const res = await fetch('/stat/run', {
    method: 'POST',
    headers: jsonHeaders(),
    body: JSON.stringify({ op: 'pairwise_adjusted', rows, args: { value, group, pAdjust } })
  });
  return parseStatResponse(res, 'stat pairwise_adjusted failed');
}
