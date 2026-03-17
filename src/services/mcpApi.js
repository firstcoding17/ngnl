function jsonHeaders() {
  const headers = { 'Content-Type': 'application/json' };
  const key = localStorage.getItem('beta_api_key') || '';
  if (key) headers['X-API-Key'] = key;
  return headers;
}

async function parseResponse(res, fallbackMsg) {
  let data = {};
  try {
    data = await res.json();
  } catch {
    data = {};
  }
  if (!res.ok) {
    const code = data?.code ? ` [${data.code}]` : '';
    throw new Error(`${data?.message || fallbackMsg}${code}`);
  }
  if (data?.ok === false) {
    const code = data.code ? ` [${data.code}]` : '';
    throw new Error(`${data.message || fallbackMsg}${code}`);
  }
  return data;
}

export async function getMcpInfo() {
  const res = await fetch('/mcp/info', {
    method: 'GET',
    headers: jsonHeaders(),
  });
  return parseResponse(res, 'mcp info failed');
}

export async function getMcpTools() {
  const res = await fetch('/mcp/tools', {
    method: 'GET',
    headers: jsonHeaders(),
  });
  return parseResponse(res, 'mcp tools failed');
}

export async function callMcpTool(tool, input, datasetContext) {
  const res = await fetch('/mcp/call', {
    method: 'POST',
    headers: jsonHeaders(),
    body: JSON.stringify({ tool, input: input || {}, datasetContext: datasetContext || {} }),
  });
  return parseResponse(res, 'mcp call failed');
}

export async function chatWithMcp(message, datasetContext, history) {
  const res = await fetch('/mcp/chat', {
    method: 'POST',
    headers: jsonHeaders(),
    body: JSON.stringify({
      message: message || '',
      datasetContext: datasetContext || {},
      history: Array.isArray(history) ? history : [],
    }),
  });
  return parseResponse(res, 'mcp chat failed');
}
