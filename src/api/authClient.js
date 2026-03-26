import http from './http';
import { authFetch, jsonHeaders, parseJsonResponse } from './fetchClient';
import {
  apiUrl,
  applySessionTokenFromHeaders,
  clearStoredAuth,
  clearStoredSession,
  ensureClientId,
  getApiKey,
  getSessionToken,
} from './authState';

let heartbeatTimer = null;
let ensurePromise = null;
let sessionVerified = false;

function setVerified(value) {
  sessionVerified = !!value;
}

export function stopHeartbeat() {
  if (heartbeatTimer) {
    window.clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }
}

export function startHeartbeat() {
  stopHeartbeat();
  if (!getApiKey() || !getSessionToken()) return;
  heartbeatTimer = window.setInterval(() => {
    heartbeat().catch(() => {});
  }, 45000);
}

export async function verifyKey() {
  ensureClientId();
  const response = await http.get('/auth/verify');
  applySessionTokenFromHeaders(response.headers);
  if (response?.data?.ok !== true) {
    throw new Error('API key verification failed');
  }
  setVerified(true);
  startHeartbeat();
  return true;
}

export async function heartbeat() {
  if (!getApiKey() || !getSessionToken()) return false;
  const response = await authFetch('/auth/heartbeat', {
    method: 'POST',
    headers: jsonHeaders(),
    body: JSON.stringify({}),
  });
  applySessionTokenFromHeaders(response.headers);
  const data = await parseJsonResponse(response, 'heartbeat failed');
  setVerified(true);
  return data?.ok === true;
}

export async function ensureAuthenticatedSession() {
  if (!getApiKey()) return false;
  if (sessionVerified && getSessionToken()) {
    startHeartbeat();
    return true;
  }
  if (ensurePromise) return ensurePromise;
  ensurePromise = (async () => {
    try {
      return await verifyKey();
    } finally {
      ensurePromise = null;
    }
  })();
  return ensurePromise;
}

export async function logout(options = {}) {
  stopHeartbeat();
  const keepalive = !!options.keepalive;
  if (getApiKey() && getSessionToken()) {
    try {
      const response = await fetch(apiUrl('/auth/logout'), {
        method: 'POST',
        headers: jsonHeaders(),
        body: JSON.stringify({}),
        keepalive,
      });
      if (!keepalive) {
        await parseJsonResponse(response, 'logout failed');
      }
    } catch (error) {
      if (!keepalive) throw error;
    }
  }
  clearStoredSession();
  clearStoredAuth();
  setVerified(false);
  return true;
}

export function logoutOnExit() {
  if (getApiKey() && getSessionToken()) {
    fetch(apiUrl('/auth/logout'), {
      method: 'POST',
      headers: jsonHeaders(),
      body: JSON.stringify({}),
      keepalive: true,
    }).catch(() => {});
  }
  clearStoredSession();
  setVerified(false);
}
