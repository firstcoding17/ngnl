// @ts-nocheck

self.onmessage = (e) => {
  const { rows, sampleSize = 1000, numericHint = [] } = e.data;

  const warnings = [];
  if (!rows || !rows.length) {
    return self.postMessage({
      ok: true,
      data: {
        sampleCount: 0, columns: [], profile: {}, duplicates: 0,
        topCorr: [], topAnova: [], warnings: ['데이터가 비어있습니다.']
      }
    });
  }
  if (rows.length < 10) {
    warnings.push('샘플이 너무 작습니다(10행 미만). 프로필 지표는 신뢰도가 낮습니다.');
  }

  // 샘플링
  const S = rows.length > sampleSize ? reservoir(rows, sampleSize) : rows;
  const cols = Object.keys(S[0] || {});
  if (!cols.length) {
    return self.postMessage({
      ok: true,
      data: {
        sampleCount: S.length, columns: [], profile: {}, duplicates: 0,
        topCorr: [], topAnova: [], warnings: [...warnings, '컬럼이 없습니다.']
      }
    });
  }

  // 1) 컬럼별 프로필
  const profile = {};
  for (const c of cols) {
    const vals = S.map(r => r[c]);
    const { type, nonNull, nulls, unique } = basicStats(vals);
    profile[c] = {
      type,
      count: S.length,
      nonNull,
      nulls,
      nullPct: +(nulls / S.length * 100).toFixed(2),
      unique
    };
  }

  // 2) 중복(샘플 기준)
  const dupCount = countDuplicates(S);

  // 3) 상관 TOP10 (숫자형만)
  const numCols = cols.filter(c => (numericHint.includes(c) || looksNumeric(S.map(r => r[c]))));
  const corrPairs = [];
  for (let i = 0; i < numCols.length; i++) {
    for (let j = i + 1; j < numCols.length; j++) {
      const x = numeric(S.map(r => r[numCols[i]]));
      const y = numeric(S.map(r => r[numCols[j]]));
      const mask = x.map((v, k) => Number.isFinite(v) && Number.isFinite(y[k]));
      const xx = x.filter((_, k) => mask[k]);
      const yy = y.filter((_, k) => mask[k]);
      if (xx.length >= 3) {
        const r = corrCoeff(xx, yy);
        corrPairs.push({ x: numCols[i], y: numCols[j], r: +r.toFixed(3) });
      }
    }
  }
  if (!corrPairs.length) warnings.push('상관 계산을 위한 유효 쌍이 부족합니다(최소 3쌍).');
  corrPairs.sort((a, b) => Math.abs(b.r) - Math.abs(a.r));
  const topCorr = corrPairs.slice(0, 10);

  // 4) ANOVA TOP10 (범주 → 숫자)
  const anovaRaw = [];
  for (const cat of cols.filter(c => profile[c].type === 'category')) {
    for (const y of numCols) {
      const groups = groupBy(S, cat).map(g => numeric(g.map(r => r[y])).filter(Number.isFinite));
      if (groups.length >= 2 && groups.every(g => g.length >= 2)) {
        const { F, p } = onewayANOVA(groups);
        anovaRaw.push({ cat, y, F: +F.toFixed(3), p: +p.toExponential(2) });
      }
    }
  }
  if (!anovaRaw.length) warnings.push('ANOVA 계산 요건을 만족하는 (범주→숫자) 조합이 없습니다.');
  anovaRaw.sort((a, b) => a.p - b.p);
  const topAnova = anovaRaw.slice(0, 10);

  self.postMessage({
    ok: true,
    data: {
      sampleCount: S.length,
      columns: cols,
      profile,
      duplicates: dupCount,
      topCorr,
      topAnova,
      warnings
    }
  });
};

// ---------- 유틸 ----------
function basicStats(arr) {
  let nonNull = 0, nulls = 0;
  const uniq = new Set();
  let numericCount = 0, stringCount = 0, dateCount = 0;
  for (const v of arr) {
    if (v === null || v === undefined || v === '') { nulls++; continue; }
    nonNull++;
    uniq.add(String(v));
    if (!isNaN(Number(v))) numericCount++;
    else if (isParsableDate(v)) dateCount++;
    else stringCount++;
  }
  const type = (numericCount >= nonNull * 0.7) ? 'number'
            : (dateCount >= nonNull * 0.7) ? 'date' : 'category';
  return { type, nonNull, nulls, unique: uniq.size };
}

function countDuplicates(rows) {
  const seen = new Set(), dup = new Set();
  for (const r of rows) {
    const key = JSON.stringify(r);
    if (seen.has(key)) dup.add(key); else seen.add(key);
  }
  return dup.size;
}

function looksNumeric(vals) {
  let ok = 0, nn = 0;
  for (const v of vals) {
    if (v !== '' && v != null) { nn++; if (!isNaN(Number(v))) ok++; }
  }
  return nn > 0 && ok / nn > 0.7;
}
function numeric(vals) { return vals.map(v => Number(v)); }
function isParsableDate(v) { return !isNaN(new Date(String(v)).getTime()); }
function groupBy(rows, col) {
  const map = new Map();
  for (const r of rows) {
    const k = String(r[col] ?? '');
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(r);
  }
  return Array.from(map.values());
}
function reservoir(arr, k) {
  const R = arr.slice(0, k);
  for (let i = k; i < arr.length; i++) {
    const j = Math.floor(Math.random() * (i + 1));
    if (j < k) R[j] = arr[i];
  }
  return R;
}

function mean(arr) {
  if (!arr.length) return NaN;
  return arr.reduce((s, v) => s + v, 0) / arr.length;
}

function corrCoeff(x, y) {
  const n = Math.min(x.length, y.length);
  if (n < 2) return NaN;
  const mx = mean(x);
  const my = mean(y);
  let num = 0;
  let dx = 0;
  let dy = 0;
  for (let i = 0; i < n; i++) {
    const a = x[i] - mx;
    const b = y[i] - my;
    num += a * b;
    dx += a * a;
    dy += b * b;
  }
  const den = Math.sqrt(dx * dy);
  return den ? num / den : NaN;
}

function onewayANOVA(groups) {
  const k = groups.length;
  const n = groups.reduce((s, g) => s + g.length, 0);
  const grand = mean(groups.flat());
  const ssb = groups.reduce((s, g) => s + g.length * (mean(g) - grand) ** 2, 0);
  const ssw = groups.reduce((s, g) => s + g.reduce((t, xi) => t + (xi - mean(g)) ** 2, 0), 0);
  const dfb = k - 1, dfw = n - k;
  const F = (ssb / dfb) / (ssw / dfw);
  // F-distribution tail fallback without external deps.
  const p = Number.isFinite(F) ? Math.max(0, Math.min(1, 1 / (1 + F))) : 1;
  return { F, p };
}

