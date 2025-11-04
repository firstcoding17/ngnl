// @ts-nocheck
import * as jStat from 'jstat';

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
function toNum(v){ const n = Number(String(v).replace(/[, ]/g,'')); return Number.isFinite(n)?n:NaN; }

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
      const q1 = jStat.quantiles(x,[0.25])[0], q3 = jStat.quantiles(x,[0.75])[0], i = q3-q1;
      lo = q1 - (opt.mult??1.5)*i; hi = q3 + (opt.mult??1.5)*i;
    } else if (opt.method==='zscore'){
      const m=jStat.mean(x), s=jStat.stdev(x,true)||1, k=opt.k??3; lo=m-k*s; hi=m+k*s;
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
  // onehot
  if (r?.onehot?.length) for (const c of r.onehot){
    const cats = Array.from(new Set(rows.map(rw => String(rw[c] ?? ''))));
    for (const row of rows) for (const k of cats) row[`${c}__${k}`] = String(row[c] ?? '')===k ? 1 : 0;
    for (const row of rows) delete row[c];
  }
  // scale standardize
  if (r?.scale?.standardize?.length) for (const c of r.scale.standardize){
    const v = rows.map(rw=>toNum(rw[c])); const idx=v.map((x,i)=>Number.isFinite(x)?i:-1).filter(i=>i>=0);
    if (idx.length<2) continue; const arr=idx.map(i=>v[i]); const m=jStat.mean(arr), s=jStat.stdev(arr,true)||1;
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
