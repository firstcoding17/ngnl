const API_BASE = String(process.env.PLAYWRIGHT_API_BASE || `http://127.0.0.1:${process.env.PLAYWRIGHT_BACKEND_PORT || 5100}`)
  .replace(/\/+$/, '');

function parseBooleanFlag(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return null;
}

function shouldResetE2EState() {
  const forced = parseBooleanFlag(process.env.PLAYWRIGHT_E2E_RESET);
  if (forced != null) return forced;

  try {
    const url = new URL(API_BASE);
    return ['127.0.0.1', 'localhost', '0.0.0.0'].includes(url.hostname);
  } catch {
    return false;
  }
}

const SHOULD_RESET = shouldResetE2EState();

async function resetE2EState(request, { allowUnavailable = false } = {}) {
  if (!SHOULD_RESET) return;
  const response = await request.post(`${API_BASE}/__e2e__/reset`, { failOnStatusCode: false });
  const status = response.status();
  if (status === 200) return;
  if (allowUnavailable && [0, 404, 405, 501].includes(status)) return;
  const body = await response.text().catch(() => '');
  throw new Error(`E2E reset failed with status ${status}${body ? `: ${body}` : ''}`);
}

module.exports = {
  API_BASE,
  SHOULD_RESET,
  resetE2EState,
};
