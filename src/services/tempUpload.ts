function jsonHeaders() {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const key = localStorage.getItem('beta_api_key') || '';
  if (key) headers['X-API-Key'] = key;
  return headers;
}

export async function tempUpload(file: File){
  const signRes = await fetch('/tmp-upload/sign', {
    method:'POST', headers:jsonHeaders(),
    body: JSON.stringify({ name: file.name, mime: file.type || 'application/octet-stream' })
  });
  const sign = await signRes.json();
  if (!signRes.ok || sign?.ok === false) {
    throw new Error(sign?.message || 'tmp-upload sign failed');
  }
  const signed = sign?.data || sign;
  if (!signed?.url || !signed?.key) {
    throw new Error('tmp-upload sign payload is invalid');
  }

  // Upload to signed URL
  await fetch(signed.url, { method:'PUT', body:file, headers:{ 'Content-Type': file.type || 'application/octet-stream' }});
  return { key: signed.key, ttlSec: signed.ttlSec };
}
export async function tempDelete(key: string){
  const res = await fetch('/tmp-upload/delete', {
    method:'POST', headers:jsonHeaders(),
    body: JSON.stringify({ key })
  });
  const payload = await res.json();
  if (!res.ok || payload?.ok === false) {
    throw new Error(payload?.message || 'tmp-upload delete failed');
  }
}
