import { authFetch, jsonHeaders, parseJsonResponse } from '@/api/fetchClient';

export async function getMlCapabilities() {
  const res = await authFetch('/ml/capabilities', {
    method: 'GET',
    headers: jsonHeaders(),
  });
  return parseJsonResponse(res, 'ml capability check failed');
}

export async function runMlTrain(payload) {
  const res = await authFetch('/ml/run', {
    method: 'POST',
    headers: jsonHeaders(),
    body: JSON.stringify({ ...(payload || {}), op: 'train' }),
  });
  return parseJsonResponse(res, 'ml run failed');
}
