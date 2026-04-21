import { authFetch, jsonHeaders, parseJsonResponse } from '@/api/fetchClient';

export async function getImageRuntimeCapabilities() {
  const res = await authFetch('/api/image-features/capabilities', {
    method: 'GET',
    headers: jsonHeaders(),
  });
  return parseJsonResponse(res, 'image runtime capability check failed');
}

export async function runImageFeatureRuntime(payload = {}) {
  const res = await authFetch('/api/image-features', {
    method: 'POST',
    headers: jsonHeaders(),
    body: JSON.stringify({ ...(payload || {}), op: payload?.op || 'extract' }),
  });
  return parseJsonResponse(res, 'image feature runtime failed');
}

export async function runImageOcrRuntime(payload = {}) {
  const res = await authFetch('/api/image-features', {
    method: 'POST',
    headers: jsonHeaders(),
    body: JSON.stringify({ ...(payload || {}), op: 'ocr' }),
  });
  return parseJsonResponse(res, 'image OCR runtime failed');
}
