import { authFetch, jsonHeaders, parseJsonResponse } from '@/api/fetchClient';
import { buildAuthHeaders } from '@/api/authState';

export async function tempUpload(file: File){
  const signRes = await authFetch('/tmp-upload/sign', {
    method:'POST', headers:jsonHeaders(),
    body: JSON.stringify({ name: file.name, mime: file.type || 'application/octet-stream' })
  });
  const sign = await parseJsonResponse(signRes, 'tmp-upload sign failed');
  const signed = sign?.data || sign;
  if (!signed?.url || !signed?.key) {
    throw new Error('tmp-upload sign payload is invalid');
  }

  // Upload to signed URL
  await fetch(signed.url, { method:'PUT', body:file, headers:buildAuthHeaders({ 'Content-Type': file.type || 'application/octet-stream' })});
  return { key: signed.key, ttlSec: signed.ttlSec };
}
export async function tempDelete(key: string){
  const res = await authFetch('/tmp-upload/delete', {
    method:'POST', headers:jsonHeaders(),
    body: JSON.stringify({ key })
  });
  await parseJsonResponse(res, 'tmp-upload delete failed');
}
