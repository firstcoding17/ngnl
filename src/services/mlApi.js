function jsonHeaders() {
  const headers = { 'Content-Type': 'application/json' };
  const key = localStorage.getItem('beta_api_key') || '';
  if (key) headers['X-API-Key'] = key;
  return headers;
}

async function parseResponse(res, fallbackMsg) {
  let data = null;
  try {
    data = await res.json();
  } catch (_) {
    data = null;
  }
  if (!res.ok) {
    const code = data?.code ? ` [${data.code}]` : '';
    const msg = data?.message || fallbackMsg;
    throw new Error(`${msg}${code}`);
  }
  if (data?.ok === false) {
    const code = data.code ? ` [${data.code}]` : '';
    throw new Error(`${data.message || fallbackMsg}${code}`);
  }
  return data;
}

export async function getMlCapabilities() {
  const res = await fetch('/ml/capabilities', {
    method: 'GET',
    headers: jsonHeaders(),
  });
  return parseResponse(res, 'ml capability check failed');
}

export async function runMlTrain(payload) {
  const res = await fetch('/ml/run', {
    method: 'POST',
    headers: jsonHeaders(),
    body: JSON.stringify({ ...(payload || {}), op: 'train' }),
  });
  return parseResponse(res, 'ml run failed');
}
