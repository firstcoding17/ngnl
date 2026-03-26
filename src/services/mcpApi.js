import { authFetch, jsonHeaders, parseJsonResponse } from '@/api/fetchClient';

export async function getMcpInfo() {
  const res = await authFetch('/mcp/info', {
    method: 'GET',
    headers: jsonHeaders(),
  });
  return parseJsonResponse(res, 'mcp info failed');
}

export async function getMcpTools() {
  const res = await authFetch('/mcp/tools', {
    method: 'GET',
    headers: jsonHeaders(),
  });
  return parseJsonResponse(res, 'mcp tools failed');
}

export async function callMcpTool(tool, input, datasetContext) {
  const res = await authFetch('/mcp/call', {
    method: 'POST',
    headers: jsonHeaders(),
    body: JSON.stringify({ tool, input: input || {}, datasetContext: datasetContext || {} }),
  });
  return parseJsonResponse(res, 'mcp call failed');
}

export async function chatWithMcp(message, datasetContext, history) {
  const res = await authFetch('/mcp/chat', {
    method: 'POST',
    headers: jsonHeaders(),
    body: JSON.stringify({
      message: message || '',
      datasetContext: datasetContext || {},
      history: Array.isArray(history) ? history : [],
    }),
  });
  return parseJsonResponse(res, 'mcp chat failed');
}
