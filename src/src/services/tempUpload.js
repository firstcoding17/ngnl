function jsonHeaders() {
  const headers = { 'Content-Type': 'application/json' };
  const key = localStorage.getItem('beta_api_key') || '';
  if (key) headers['X-API-Key'] = key;
  return headers;
}

export async function tempUpload(file) {
  const sign = await fetch('/tmp-upload/sign', {
    method: 'POST',
    headers: jsonHeaders(),
    body: JSON.stringify({ name: file.name, mime: file.type || 'application/octet-stream' })
  }).then((r) => r.json());

  await fetch(sign.url, {
    method: 'PUT',
    body: file,
    headers: { 'Content-Type': file.type || 'application/octet-stream' }
  });
  return { key: sign.key, ttlSec: sign.ttlSec };
}

export async function tempDelete(key) {
  await fetch('/tmp-upload/delete', {
    method: 'POST',
    headers: jsonHeaders(),
    body: JSON.stringify({ key })
  });
}
