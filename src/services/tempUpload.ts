export async function tempUpload(file: File){
  const sign = await fetch('/tmp-upload/sign', {
    method:'POST', headers:{'Content-Type':'application/json'},
    body: JSON.stringify({ name: file.name, mime: file.type || 'application/octet-stream' })
  }).then(r=>r.json());

  // S3 presigned PUT 가정
  await fetch(sign.url, { method:'PUT', body:file, headers:{ 'Content-Type': file.type || 'application/octet-stream' }});
  return { key: sign.key, ttlSec: sign.ttlSec };
}
export async function tempDelete(key: string){
  await fetch('/tmp-upload/delete', {
    method:'POST', headers:{'Content-Type':'application/json'},
    body: JSON.stringify({ key })
  });
}
