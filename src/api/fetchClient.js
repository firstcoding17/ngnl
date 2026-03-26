import {
  apiUrl,
  applySessionTokenFromHeaders,
  buildAuthHeaders,
  emitAuthInvalid,
} from './authState';

export function jsonHeaders(headers = {}) {
  return buildAuthHeaders({
    'Content-Type': 'application/json',
    ...headers,
  });
}

export async function authFetch(path, options = {}) {
  const response = await fetch(apiUrl(path), {
    ...options,
    headers: buildAuthHeaders(options.headers || {}),
  });

  applySessionTokenFromHeaders(response.headers);

  if (response.status === 401 || response.status === 409) {
    let message = '';
    try {
      const payload = await response.clone().json();
      message = payload?.error || payload?.message || '';
    } catch (_) {
      message = '';
    }
    emitAuthInvalid({
      status: response.status,
      message,
    });
  }

  return response;
}

export async function parseJsonResponse(response, fallbackMessage) {
  let data = {};
  try {
    data = await response.json();
  } catch (_) {
    data = {};
  }

  if (!response.ok || data?.ok === false) {
    const message = data?.message || data?.error || fallbackMessage;
    const code = data?.code ? ` [${data.code}]` : '';
    throw new Error(`${message}${code}`);
  }

  return data;
}
