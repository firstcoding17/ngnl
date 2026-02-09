export type ColType = 'number'|'category'|'date';

export function inferColumnTypes(rows: any[], columns: string[], maxScan=2000) {
  const sample = rows.slice(0, maxScan);
  const types: Record<string, ColType> = {};
  for (const c of columns) {
    let nNum=0, nDate=0, nStr=0, nTot=0;
    for (const r of sample) {
      const v = r?.[c];
      if (v === null || v === undefined || v === '') continue;
      nTot++;
      const num = Number(v);
      if (Number.isFinite(num)) { nNum++; continue; }
      const d = new Date(v);
      if (!isNaN(d.getTime())) { nDate++; continue; }
      nStr++;
    }
    // 간단 규칙
    if (nDate && nDate >= Math.max(nNum, nStr)) types[c] = 'date';
    else if (nNum && nNum >= Math.max(nDate, nStr)) types[c] = 'number';
    else types[c] = 'category';
  }
  return types;
}
