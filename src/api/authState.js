const API_KEY_STORAGE_KEY = 'beta_api_key';
const CLIENT_ID_STORAGE_KEY = 'beta_client_id';
const SESSION_TOKEN_STORAGE_KEY = 'beta_session_token';
const AUTH_ERROR_STORAGE_KEY = 'beta_auth_error';

function randomId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `cid_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

export function apiBase() {
  return String(process.env.VUE_APP_API_BASE || '').replace(/\/+$/, '');
}

export function apiUrl(path) {
  const normalized = String(path || '').startsWith('/') ? String(path || '') : `/${String(path || '')}`;
  const base = apiBase();
  return base ? `${base}${normalized}` : normalized;
}

export function getApiKey() {
  return localStorage.getItem(API_KEY_STORAGE_KEY) || '';
}

export function setApiKey(value) {
  const next = String(value || '').trim();
  if (next) localStorage.setItem(API_KEY_STORAGE_KEY, next);
  else localStorage.removeItem(API_KEY_STORAGE_KEY);
}

export function hasApiKey() {
  return !!getApiKey();
}

export function ensureClientId() {
  const existing = localStorage.getItem(CLIENT_ID_STORAGE_KEY);
  if (existing) return existing;
  const created = randomId();
  localStorage.setItem(CLIENT_ID_STORAGE_KEY, created);
  return created;
}

export function getClientId() {
  return localStorage.getItem(CLIENT_ID_STORAGE_KEY) || '';
}

export function getSessionToken() {
  return localStorage.getItem(SESSION_TOKEN_STORAGE_KEY) || '';
}

export function setSessionToken(value) {
  const next = String(value || '').trim();
  if (next) localStorage.setItem(SESSION_TOKEN_STORAGE_KEY, next);
  else localStorage.removeItem(SESSION_TOKEN_STORAGE_KEY);
}

export function clearStoredSession() {
  localStorage.removeItem(SESSION_TOKEN_STORAGE_KEY);
}

export function clearStoredAuth() {
  localStorage.removeItem(API_KEY_STORAGE_KEY);
  localStorage.removeItem(CLIENT_ID_STORAGE_KEY);
  localStorage.removeItem(SESSION_TOKEN_STORAGE_KEY);
}

export function buildAuthHeaders(headers = {}) {
  const next = { ...headers };
  const apiKey = getApiKey();
  const clientId = ensureClientId();
  const sessionToken = getSessionToken();
  if (apiKey) next['X-API-Key'] = apiKey;
  if (clientId) next['X-Client-Id'] = clientId;
  if (sessionToken) next['X-Session-Token'] = sessionToken;
  return next;
}

export function applySessionTokenFromHeaders(headersLike) {
  if (!headersLike) return '';
  const token = typeof headersLike.get === 'function'
    ? headersLike.get('x-session-token') || headersLike.get('X-Session-Token')
    : headersLike['x-session-token'] || headersLike['X-Session-Token'];
  if (token) setSessionToken(token);
  return token || '';
}

export function storeAuthError(message) {
  if (!message) return;
  sessionStorage.setItem(AUTH_ERROR_STORAGE_KEY, String(message));
}

export function consumeAuthError() {
  const message = sessionStorage.getItem(AUTH_ERROR_STORAGE_KEY) || '';
  if (message) sessionStorage.removeItem(AUTH_ERROR_STORAGE_KEY);
  return message;
}

export function emitAuthInvalid(detail = {}) {
  if (detail?.message) storeAuthError(detail.message);
  window.dispatchEvent(new CustomEvent('beta-key-invalid', { detail }));
}
