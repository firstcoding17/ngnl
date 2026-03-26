import { authFetch, jsonHeaders, parseJsonResponse } from '@/api/fetchClient';

export async function prepareChart(spec, rows, endpoint = '/viz/prepare') {
  const max = 5000;
  const S = rows.length > max ? rows.slice(0, max) : rows;
  const res = await authFetch(endpoint, {
    method: 'POST',
    headers: jsonHeaders(),
    body: JSON.stringify({ rows: S, spec })
  });
  return parseJsonResponse(res, 'viz/prepare failed');
}

export async function aggregateChart(spec, rows, endpoint = '/viz/aggregate') {
  const cols = [spec.x, spec.y, spec.hue, spec.size].filter(Boolean);
  const trimmed = rows.map((r) => {
    const o = {};
    for (const c of cols) o[c] = r[c];
    return o;
  });
  const max = 200000;
  const S = trimmed.length > max ? trimmed.slice(0, max) : trimmed;

  const res = await authFetch(endpoint, {
    method: 'POST',
    headers: jsonHeaders(),
    body: JSON.stringify({ rows: S, spec })
  });
  return parseJsonResponse(res, 'viz/aggregate failed');
}
