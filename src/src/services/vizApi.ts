function jsonHeaders() {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const key = localStorage.getItem('beta_api_key') || '';
  if (key) headers['X-API-Key'] = key;
  return headers;
}

export async function prepareChart(spec: any, rows: any[], endpoint = '/viz/prepare') {
  const max = 5000;
  const S = rows.length > max ? rows.slice(0, max) : rows;
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: jsonHeaders(),
    body: JSON.stringify({ rows: S, spec })
  });
  if (!res.ok) throw new Error('viz/prepare failed');
  return res.json(); // { fig_json }
}
export async function aggregateChart(spec: any, rows: any[], endpoint = '/viz/aggregate') {
  // Send only required columns for aggregation.
  const cols = [spec.x, spec.y, spec.hue].filter(Boolean);
  const trimmed = rows.map(r => {
    const o:any = {};
    for (const c of cols) o[c] = r[c as string];
    return o;
  });
  const max = 200000; // Client-side cap
  const S = trimmed.length > max ? trimmed.slice(0, max) : trimmed;

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: jsonHeaders(),
    body: JSON.stringify({ rows: S, spec })
  });
  if (!res.ok) throw new Error('viz/aggregate failed');
  return res.json(); // { result, meta }
}
