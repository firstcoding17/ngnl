import { authFetch, jsonHeaders, parseJsonResponse } from '@/api/fetchClient';

export async function prepareChart(spec: any, rows: any[], endpoint = '/viz/prepare') {
  const max = 5000;
  const S = rows.length > max ? rows.slice(0, max) : rows;
  const res = await authFetch(endpoint, {
    method: 'POST',
    headers: jsonHeaders(),
    body: JSON.stringify({ rows: S, spec })
  });
  return parseJsonResponse(res, 'viz/prepare failed');
}
export async function aggregateChart(spec: any, rows: any[], endpoint = '/viz/aggregate') {
  // Send only required columns for aggregation.
  const cols = [spec.x, spec.y, spec.hue, spec.size].filter(Boolean);
  const trimmed = rows.map(r => {
    const o:any = {};
    for (const c of cols) o[c] = r[c as string];
    return o;
  });
  const max = 200000; // Client-side cap
  const S = trimmed.length > max ? trimmed.slice(0, max) : trimmed;

  const res = await authFetch(endpoint, {
    method: 'POST',
    headers: jsonHeaders(),
    body: JSON.stringify({ rows: S, spec })
  });
  return parseJsonResponse(res, 'viz/aggregate failed');
}
