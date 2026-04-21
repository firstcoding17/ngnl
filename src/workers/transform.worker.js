// @ts-nocheck

self.onmessage = (e) => {
  const { type, payload } = e.data;
  try {
    if (type === 'APPLY') {
      const { rows, recipe } = payload;
      const out = applyRecipe(rows, recipe);
      return post({ ok:true, type, data: out });
    }
    if (type === 'EXPORT_CSV') {
      const { rows } = payload;
      const header = Object.keys(rows[0] || {});
      const csv = [header.join(',')].concat(rows.map(r => header.map(h => esc(r[h])).join(','))).join('\n');
      const blob = new Blob([csv], { type:'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      return post({ ok:true, type, data:{ url, size: blob.size }});
    }
    post({ ok:false, error:'unknown type' });
  } catch (err) {
    post({ ok:false, error: String(err?.message || err) });
  }
};

function post(x){ self.postMessage(x); }
function esc(v){
  if (v==null) return '';
  const s = String(v);
  return /[,"\n]/.test(s) ? `"${s.replace(/"/g,'""')}"` : s;
}
function normalizeText(v){ return String(v ?? '').trim().toLowerCase(); }
function toNum(v){ const n = Number(String(v).replace(/[, ]/g,'')); return Number.isFinite(n)?n:NaN; }
function safeKey(v){ return normalizeText(v).replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 24) || 'feature'; }
function round(v, digits=6){ const p = 10 ** digits; return Math.round(v * p) / p; }
function tokenizeText(v){
  return normalizeText(v)
    .replace(/[^a-z0-9\u00c0-\u024f\u3131-\u318e\uac00-\ud7a3\s]/g, ' ')
    .split(/\s+/)
    .filter(token => token && token.length >= 2);
}
function hashString(text){
  let h = 2166136261;
  const value = String(text || '');
  for (let i = 0; i < value.length; i += 1) {
    h ^= value.charCodeAt(i);
    h += (h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24);
  }
  return h >>> 0;
}
function imageExt(v){
  const raw = String(v ?? '').trim().toLowerCase();
  const match = raw.match(/\.([a-z0-9]+)(?:$|\?)/i);
  return match ? match[1] : '';
}
function isRemotePath(v){
  const raw = String(v ?? '').trim().toLowerCase();
  return raw.startsWith('http://') || raw.startsWith('https://') ? 1 : 0;
}
const POSITIVE_WORDS = new Set(['good', 'great', 'excellent', 'love', 'helpful', 'clear', 'fast', 'happy', 'positive', 'recommend']);
const NEGATIVE_WORDS = new Set(['bad', 'poor', 'slow', 'hate', 'bug', 'broken', 'confusing', 'sad', 'negative', 'delay']);
const SEMANTIC_CONCEPTS = {
  trust: ['clear', 'stable', 'safe', 'secure', 'reliable', 'trust', 'accurate', 'confident'],
  support: ['support', 'help', 'helpful', 'service', 'team', 'reply', 'guide', 'assist'],
  delivery: ['delivery', 'shipping', 'shipment', 'arrive', 'arrival', 'tracking', 'package', 'courier'],
  finance: ['price', 'cost', 'billing', 'payment', 'invoice', 'refund', 'charge', 'revenue'],
  risk: ['risk', 'broken', 'bug', 'issue', 'error', 'delay', 'overdue', 'problem'],
  experience: ['fast', 'slow', 'easy', 'confusing', 'smooth', 'friction', 'checkout', 'setup'],
};
function mean(arr){ return arr.length ? arr.reduce((s,v)=>s+v,0)/arr.length : NaN; }
function stdev(arr, sample=true){
  if (!arr.length) return NaN;
  const m = mean(arr);
  const denom = sample ? (arr.length - 1) : arr.length;
  if (denom <= 0) return 0;
  const variance = arr.reduce((s,v)=> s + ((v-m)*(v-m)), 0) / denom;
  return Math.sqrt(variance);
}
function quantile(arr, q){
  if (!arr.length) return NaN;
  const sorted = [...arr].sort((a,b)=>a-b);
  const pos = (sorted.length - 1) * q;
  const base = Math.floor(pos);
  const rest = pos - base;
  if (sorted[base + 1] !== undefined) return sorted[base] + rest * (sorted[base + 1] - sorted[base]);
  return sorted[base];
}

function applyRecipe(_rows, r){
  let rows = structuredClone(_rows || []);
  // rename
  if (r?.rename) {
    rows = rows.map(obj => {
      const o = {};
      for (const [k,v] of Object.entries(obj)) o[r.rename[k] || k] = v;
      return o;
    });
  }
  // select
  if (r?.select?.length) rows = rows.map(obj => Object.fromEntries(r.select.map(c => [c, obj[c]])));
  // trim
  if (r?.trim?.length) for (const c of r.trim) for (const row of rows) if (row[c]!=null) row[c] = String(row[c]).trim();
  // typeCast
  if (r?.typeCast) for (const [c,t] of Object.entries(r.typeCast)) for (const row of rows){
    if (t==='number') row[c] = toNum(row[c]);
    else if (t==='string') row[c] = row[c]==null?'':String(row[c]);
    else if (t==='date') row[c] = row[c]?String(row[c]):'';
  }
  // fillna
  if (r?.fillna) for (const [c,val] of Object.entries(r.fillna)) for (const row of rows){
    const v = row[c];
    if (v===''||v==null||Number.isNaN(v)) row[c]=val;
  }
  // mapValues
  if (r?.mapValues) for (const [c, mapping] of Object.entries(r.mapValues)) for (const row of rows) {
    const key = normalizeText(row[c]);
    if (Object.prototype.hasOwnProperty.call(mapping || {}, key)) row[c] = mapping[key];
  }
  // dropna
  if (r?.dropna?.length) rows = rows.filter(row => r.dropna.every(c => {
    const v=row[c]; return !(v===''||v==null||Number.isNaN(v));
  }));
  // filter
  if (r?.filter?.length) rows = rows.filter(row => r.filter.every(f => cmp(row[f.col], f.op, f.value)));
  // cap (IQR/zscore)
  if (r?.cap) for (const [c,opt] of Object.entries(r.cap)){
    const x=rows.map(rw=>toNum(rw[c])).filter(Number.isFinite); if (x.length<3) continue;
    let lo,hi;
    if (opt.method==='iqr'){
      const q1 = quantile(x, 0.25), q3 = quantile(x, 0.75), i = q3-q1;
      lo = q1 - (opt.mult??1.5)*i; hi = q3 + (opt.mult??1.5)*i;
    } else if (opt.method==='zscore'){
      const m=mean(x), s=stdev(x,true)||1, k=opt.k??3; lo=m-k*s; hi=m+k*s;
    } else continue;
    for (const row of rows){ const v=toNum(row[c]); if (Number.isFinite(v)) row[c] = Math.min(Math.max(v, lo), hi); }
  }
  // derive
  if (r?.derive?.length) for (const d of r.derive){
    rows = rows.map(row => {
      const ctx = new Proxy({}, { get:(_,k)=>toNum(row[k]) });
      row[d.new] = safeEval(d.expr, ctx); return row;
    });
  }
  // textStats
  if (r?.textStats?.length) for (const c of r.textStats) for (const row of rows) {
    const tokens = tokenizeText(row[c]);
    row[`${c}_char_len`] = String(row[c] ?? '').trim().length;
    row[`${c}_word_count`] = tokens.length;
  }
  // textTfidf
  if (r?.textTfidf?.length) for (const spec of r.textTfidf) {
    const column = spec?.column;
    if (!column) continue;
    const docs = rows.map(row => tokenizeText(row[column]));
    const docFreq = new Map();
    docs.forEach(tokens => {
      Array.from(new Set(tokens)).forEach(token => {
        docFreq.set(token, (docFreq.get(token) || 0) + 1);
      });
    });
    const topTerms = Array.from(docFreq.entries())
      .sort((a,b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, Math.max(1, Number(spec?.topK || 4)))
      .map(([token]) => token);
    const totalDocs = Math.max(1, docs.length);
    rows.forEach((row, index) => {
      const tokens = docs[index];
      const totalTokens = Math.max(1, tokens.length);
      topTerms.forEach((term) => {
        const tf = tokens.filter(token => token === term).length / totalTokens;
        const idf = Math.log((totalDocs + 1) / ((docFreq.get(term) || 0) + 1)) + 1;
        row[`${column}_tfidf_${safeKey(term)}`] = round(tf * idf, 6);
      });
    });
  }
  // textSentiment
  if (r?.textSentiment?.length) for (const c of r.textSentiment) for (const row of rows) {
    const tokens = tokenizeText(row[c]);
    const pos = tokens.filter(token => POSITIVE_WORDS.has(token)).length;
    const neg = tokens.filter(token => NEGATIVE_WORDS.has(token)).length;
    row[`${c}_sentiment`] = round((pos - neg) / Math.max(1, tokens.length), 6);
  }
  // textEmbedding
  if (r?.textEmbedding?.length) for (const spec of r.textEmbedding) {
    const column = spec?.column;
    const dims = Math.max(2, Number(spec?.dims || 4));
    if (!column) continue;
    for (const row of rows) {
      const vector = new Array(dims).fill(0);
      const tokens = tokenizeText(row[column]);
      tokens.forEach((token) => {
        const hash = hashString(token);
        const index = hash % dims;
        const sign = ((hash >> 1) & 1) === 0 ? 1 : -1;
        vector[index] += sign;
      });
      const norm = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0)) || 1;
      vector.forEach((value, index) => {
        row[`${column}_embed_${index}`] = round(value / norm, 6);
      });
    }
  }
  // textSemantic
  if (r?.textSemantic?.length) for (const spec of r.textSemantic) {
    const column = spec?.column;
    if (!column) continue;
    const concepts = Object.entries(SEMANTIC_CONCEPTS);
    for (const row of rows) {
      const tokens = tokenizeText(row[column]);
      const total = Math.max(1, tokens.length);
      const tokenSet = new Set(tokens);
      for (const [concept, lexicon] of concepts) {
        const hits = lexicon.reduce((count, token) => count + (tokenSet.has(token) ? 1 : 0), 0);
        row[`${column}_semantic_${concept}`] = round(hits / total, 6);
      }
    }
  }
  // onehot
  if (r?.onehot?.length) for (const c of r.onehot){
    const cats = Array.from(new Set(rows.map(rw => String(rw[c] ?? ''))));
    for (const row of rows) for (const k of cats) row[`${c}__${k}`] = String(row[c] ?? '')===k ? 1 : 0;
    for (const row of rows) delete row[c];
  }
  // dateParts
  if (r?.dateParts?.length) for (const spec of r.dateParts) {
    const column = spec?.column;
    if (!column) continue;
    const parts = Array.isArray(spec?.parts) && spec.parts.length ? spec.parts : ['year', 'month', 'day'];
    for (const row of rows) {
      const raw = row[column];
      const date = raw ? new Date(raw) : null;
      if (!date || Number.isNaN(date.getTime())) continue;
      if (parts.includes('year')) row[`${column}_year`] = date.getFullYear();
      if (parts.includes('month')) row[`${column}_month`] = date.getMonth() + 1;
      if (parts.includes('day')) row[`${column}_day`] = date.getDate();
      if (parts.includes('weekday')) row[`${column}_weekday`] = date.getDay();
    }
  }
  // imageFeatures
  if (r?.imageFeatures?.length) for (const c of r.imageFeatures) for (const row of rows) {
    const raw = String(row[c] ?? '').trim();
    row[`${c}_image_ext`] = imageExt(raw);
    row[`${c}_image_is_remote`] = isRemotePath(raw);
    row[`${c}_image_name_len`] = raw.length;
  }
  // imageEmbedding
  if (r?.imageEmbedding?.length) for (const spec of r.imageEmbedding) {
    const column = spec?.column;
    const dims = Math.max(2, Number(spec?.dims || 4));
    if (!column) continue;
    for (const row of rows) {
      const raw = String(row[column] ?? '');
      for (let index = 0; index < dims; index += 1) {
        const hash = hashString(`${raw}::${index}`);
        row[`${column}_embed_${index}`] = round((hash % 1000) / 1000, 6);
      }
    }
  }
  // scale standardize
  if (r?.scale?.standardize?.length) for (const c of r.scale.standardize){
    const v = rows.map(rw=>toNum(rw[c])); const idx=v.map((x,i)=>Number.isFinite(x)?i:-1).filter(i=>i>=0);
    if (idx.length<2) continue; const arr=idx.map(i=>v[i]); const m=mean(arr), s=stdev(arr,true)||1;
    for (const i of idx) rows[i][c] = (v[i]-m)/s;
  }
  return { rows, columns: Object.keys(rows[0] || {}) };
}

function cmp(val, op, target){
  const a = Number.isFinite(val)?val:toNum(val), b = Number.isFinite(target)?target:toNum(target);
  switch(op){
    case '==': return String(val)===String(target);
    case '!=': return String(val)!==String(target);
    case '>': return a>b; case '>=': return a>=b; case '<': return a<b; case '<=': return a<=b;
    case 'in': return Array.isArray(target) ? target.includes(val) : false;
    default: return true;
  }
}

function safeEval(expr, ctx){
  const allowed=/^[\w\s.+\-*/()eE]+$/; if(!allowed.test(expr)) return NaN;
  try { const f = new Function(...Object.keys(ctx), `return (${expr});`); return f(...Object.values(ctx)); }
  catch { return NaN; }
}
