function jsonHeaders() {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const key = localStorage.getItem('beta_api_key') || '';
  if (key) headers['X-API-Key'] = key;
  return headers;
}

async function parseStatResponse(res: Response, fallbackMsg: string) {
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

export async function runStatDescribe(rows: any[], columns: string[], options?: { topNCat?: number }) {
  // PASS1 uses all columns by default.
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
export async function runStatCorr(rows: any[], options?: { topNPairs?: number }) {
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
export async function runStatTTest(rows:any[], value:string, group:string){
  const res = await fetch('/stat/run', {
    method:'POST',
    headers: jsonHeaders(),
    body: JSON.stringify({ op:'ttest', rows, args:{ value, group } })
  });
  return parseStatResponse(res, 'stat ttest failed');
}

export async function runStatChiSq(rows:any[], a:string, b:string){
  const res = await fetch('/stat/run', {
    method:'POST',
    headers: jsonHeaders(),
    body: JSON.stringify({ op:'chisq', rows, args:{ a, b } })
  });
  return parseStatResponse(res, 'stat chisq failed');
}
export async function runStatOLS(
  rows:any[],
  y:string,
  x:string[],
  options?: { addIntercept?: boolean; dummy?: boolean; dropFirst?: boolean; robust?: 'HC3' | 'HC1' | null }
){
  const res = await fetch('/stat/run', {
    method:'POST',
    headers: jsonHeaders(),
    body: JSON.stringify({
      op:'ols',
      rows,
      args:{ y, x },
      options: {
        addIntercept: options?.addIntercept ?? true,
        dummy: options?.dummy ?? true,
        dropFirst: options?.dropFirst ?? true,
        robust: options?.robust ?? null,
      }
    })
  });
  return parseStatResponse(res, 'stat ols failed');
}

