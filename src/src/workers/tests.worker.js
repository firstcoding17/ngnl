// src/workers/tests.worker.js
// @ts-nocheck

self.onmessage = (e) => {
  const { kind, payload } = e.data;
  try {
    if (kind === 'ttest') return doTTest(payload);
    if (kind === 'normality') return doNormality(payload);
    if (kind === 'levene') return doLevene(payload);
    post({ ok:false, error:'unknown kind' });
  } catch (err) {
    post({ ok:false, error:String(err?.message || err) });
  }
};

function doTTest({ rows, mode, colA, colB, oneCol, mu=0, alternative='two-sided' }){
  const alt = (pTwo, t) => alternative==='two-sided' ? pTwo : (alternative==='greater' ? (t>0?pTwo/2:1-pTwo/2) : (t<0?pTwo/2:1-pTwo/2));

  if (mode==='one-sample'){
    const a = num(rows.map(r=>r[oneCol])).filter(Number.isFinite);
    if (a.length<2) return post({ ok:true, data:{ type:'one-sample', error:'표본이 부족합니다(≥2).' }});
    const m=mean(a), sd=stdev(a,true), t=(m-mu)/(sd/Math.sqrt(a.length));
    const pTwo = 2*(1-tCdf(Math.abs(t), a.length-1));
    return post({ ok:true, data:{ type:'one-sample', nA:a.length, t, p:alt(pTwo,t), df:a.length-1, mu, alternative }});
  }

  const A=num(rows.map(r=>r[colA])).filter(Number.isFinite);
  const B=num(rows.map(r=>r[colB])).filter(Number.isFinite);
  if (mode==='paired'){
    const n=Math.min(A.length,B.length);
    if(n<2) return post({ ok:true, data:{ type:'paired', error:'쌍표본이 부족합니다(≥2).' }});
    const d=Array.from({length:n},(_,i)=>A[i]-B[i]);
    const m=mean(d), sd=stdev(d,true), t=m/(sd/Math.sqrt(n));
    const pTwo=2*(1-tCdf(Math.abs(t), n-1));
    return post({ ok:true, data:{ type:'paired', nA:n, nB:n, t, p:alt(pTwo,t), df:n-1, alternative }});
  } else {
    // independent Welch
    const na=A.length, nb=B.length;
    if (na<2||nb<2) return post({ ok:true, data:{ type:'independent', error:'각 그룹 표본이 부족합니다(≥2).' }});
    const ma=mean(A), mb=mean(B), va=variance(A,true), vb=variance(B,true);
    const t=(ma-mb)/Math.sqrt(va/na+vb/nb);
    const df=((va/na+vb/nb)**2)/((va**2)/(na**2*(na-1))+(vb**2)/(nb**2*(nb-1)));
    const pTwo=2*(1-tCdf(Math.abs(t), df));
    return post({ ok:true, data:{ type:'independent', nA:na, nB:nb, t, p:alt(pTwo,t), df, equal_var:false, alternative }});
  }
}

function doNormality({ rows, column }){
  const x=num(rows.map(r=>r[column])).filter(Number.isFinite);
  if (x.length<8) return post({ ok:true, data:{ column, test:'Jarque–Bera', error:'표본이 부족합니다(≥8 권장).' }});
  const n=x.length, m=mean(x), sd=stdev(x,true);
  const z=x.map(v=>(v-m)/sd);
  const skew=(n/(n-1)/(n-2)) * z.reduce((s,v)=>s+v**3,0); // small-sample adj
  const kurt = ( (n*(n+1))/((n-1)*(n-2)*(n-3)) ) * z.reduce((s,v)=>s+v**4,0) - (3*((n-1)**2))/((n-2)*(n-3));
  const JB = (n/6)*(skew**2 + (kurt**2)/4);
  const p = 1 - chiSquareCdf(JB, 2); // df=2
  return post({ ok:true, data:{ column, test:'Jarque–Bera', n, JB, p }});
}

function doLevene({ rows, column, group }){
  // Brown–Forsythe: median 중심
  const groups = {};
  for (const r of rows){
    const g = String(r[group] ?? '');
    const v = Number(r[column]);
    if (!Number.isFinite(v)) continue;
    if (!groups[g]) groups[g]=[];
    groups[g].push(v);
  }
  const G = Object.values(groups).filter(g=>g.length>=2);
  if (G.length<2) return post({ ok:true, data:{ test:'Levene(BF)', error:'그룹이 부족합니다(그룹≥2, 각 그룹≥2).' }});

  const med = G.map(g=>median(g));
  const Z = G.map((g,i)=>g.map(v=>Math.abs(v - med[i])));
  // ANOVA on Z
  const k=Z.length, n=Z.reduce((s,g)=>s+g.length,0);
  const grand = mean(Z.flat());
  const ssb = Z.reduce((s,g)=> s + g.length*(mean(g)-grand)**2, 0);
  const ssw = Z.reduce((s,g)=> s + g.reduce((t,xi)=> t + (xi - mean(g))**2, 0), 0);
  const dfb = k-1, dfw = n-k;
  const F = (ssb/dfb)/(ssw/dfw);
  const p = fTailP(F, dfb, dfw);
  return post({ ok:true, data:{ test:'Levene(BF)', k, n, F, p, df1:dfb, df2:dfw }});
}

function num(a){ return a.map(v=>Number(v)); }
function median(a){ const b=[...a].sort((x,y)=>x-y); const m=Math.floor(b.length/2); return b.length%2?b[m]:(b[m-1]+b[m])/2; }
function post(x){ self.postMessage(x); }

function mean(a){ return a.reduce((s,v)=>s+v,0)/a.length; }
function variance(a, sample=true){ if(!a.length) return NaN; const m=mean(a); const ss=a.reduce((s,v)=>s+(v-m)*(v-m),0); return ss/(sample?Math.max(1,a.length-1):a.length); }
function stdev(a, sample=true){ return Math.sqrt(variance(a, sample)); }
function normalCdf(x){ const t=1/(1+0.2316419*Math.abs(x)); const d=0.3989423*Math.exp(-x*x/2); const p=d*t*(0.3193815+t*(-0.3565638+t*(1.781478+t*(-1.821256+t*1.330274)))); return x>=0?1-p:p; }
function tCdf(t, df){ const z=t*Math.sqrt(Math.max(1,df)/Math.max(1,df-2)); return normalCdf(z); }
function chiSquareCdf(x, k){ if(x<=0) return 0; const z=(Math.pow(x/k,1/3)-(1-2/(9*k)))/Math.sqrt(2/(9*k)); return normalCdf(z); }
function fTailP(F){ if(!Number.isFinite(F)||F<0) return 1; return Math.max(0, Math.min(1, 1/(1+F))); }
