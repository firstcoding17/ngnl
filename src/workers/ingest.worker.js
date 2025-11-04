// @ts-nocheck
import Papa from 'papaparse';
import * as XLSX from 'xlsx';

self.onmessage = async (e) => {
  const { type, payload } = e.data;
  try {
    if (type === 'FILE') {
      const { file } = payload;
      const name = file?.name || '';
      const ext = (name.split('.').pop() || '').toLowerCase();

      if (ext === 'csv' || /text\/csv/.test(file.type)) return parseCSVFile(file);
      if (ext === 'xlsx' || /sheet/.test(file.type))   return parseXLSXFile(file);
      if (ext === 'json' || /application\/json/.test(file.type)) return parseJSONFile(file);

      // 모르면 CSV로 시도
      return parseCSVFile(file);
    }

    if (type === 'PASTE') {
      const { text, html } = payload;

      // 1) HTML table
      if (html && html.includes('<table')) {
        const rows = htmlTableToRows(html);
        return postOK('PASTE', rows);
      }

      // 2) JSON
      if (looksLikeJSON(text)) {
        const rows = normalizeJSON(JSON.parse(text));
        return postOK('PASTE', rows);
      }

      // 3) CSV/TSV 텍스트
      const sep = text.includes('\t') ? '\t' : ',';
      const parsed = Papa.parse(text, { header: true, delimiter: sep, skipEmptyLines: true });
      return postOK('PASTE', parsed.data);
    }

    postERR(type, 'unknown message');
  } catch (err) {
    postERR(type, String(err?.message || err));
  }
};

function parseCSVFile(file){
  const total = file.size || 0;
  Papa.parse(file, {
    header: true,
    skipEmptyLines: true,
    worker: true,
    chunkSize: 256 * 1024,
    chunk: (res) => {
      // Papa는 누적 바이트를 meta.cursor에 제공
      const processed = res?.meta?.cursor ?? 0;
      const pct = total ? Math.min(100, Math.round((processed / total) * 100)) : null;
      self.postMessage({ type:'PROGRESS', ok:true, data:{ mode:'csv', pct }});
    },
    complete: (res) => postOK('FILE', res.data),
    error: (err) => postERR('FILE', err.message)
  });
}

async function parseXLSXFile(file){
  self.postMessage({ type:'PROGRESS', ok:true, data:{ mode:'xlsx', pct:null }}); // indeterminate
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: 'array' });
  const sheet = wb.SheetNames[0];
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheet], { defval: '' });
  postOK('FILE', rows);
}

async function parseJSONFile(file){
  self.postMessage({ type:'PROGRESS', ok:true, data:{ mode:'json', pct:null }}); // indeterminate
  const txt = await file.text();
  const rows = normalizeJSON(JSON.parse(txt));
  postOK('FILE', rows);
}

function normalizeJSON(obj){
  if (Array.isArray(obj)) return obj;
  if (Array.isArray(obj?.data)) return obj.data;
  throw new Error('JSON must be an array of objects');
}

function htmlTableToRows(html){
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const table = doc.querySelector('table');
  if (!table) return [];
  const headers = Array.from(table.querySelectorAll('tr:first-child th, tr:first-child td')).map(th => th.textContent.trim());
  const rows = [];
  const trs = Array.from(table.querySelectorAll('tr')).slice(1);
  for (const tr of trs) {
    const cells = Array.from(tr.querySelectorAll('td, th')).map(td => td.textContent);
    const obj = {};
    for (let i=0;i<headers.length;i++) obj[headers[i] || `col${i+1}`] = cells[i] ?? '';
    rows.push(obj);
  }
  return rows;
}

function looksLikeJSON(s){
  const t = (s || '').trim();
  return (t.startsWith('[') && t.endsWith(']')) || (t.startsWith('{') && t.endsWith('}'));
}
function postOK(type, rows){
  const columns = Object.keys(rows[0] || {});
  const count = rows.length;
  self.postMessage({ type, ok:true, data: { rows, columns, count } });
}
function postERR(type, error){
  self.postMessage({ type, ok:false, error });
}
