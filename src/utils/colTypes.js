export function inferColumnTypes(rows, columns, maxScan = 2000) {
  const sample = rows.slice(0, maxScan);
  const types = {};
  for (const c of columns) {
    let nNum = 0, nDate = 0, nStr = 0;
    for (const r of sample) {
      const v = r?.[c];
      if (v === null || v === undefined || v === '') continue;
      const num = Number(v);
      if (Number.isFinite(num)) { nNum++; continue; }
      const d = new Date(v);
      if (!Number.isNaN(d.getTime())) { nDate++; continue; }
      nStr++;
    }
    if (nDate && nDate >= Math.max(nNum, nStr)) types[c] = 'date';
    else if (nNum && nNum >= Math.max(nDate, nStr)) types[c] = 'number';
    else types[c] = 'category';
  }
  return types;
}
