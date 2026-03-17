import * as XLSX from 'xlsx';

export function exportXLSX(name, columns, rows, options) {
  const opts = {
    sample: 2000,
    minWch: 8,
    maxWch: 40,
    autoFilter: true,
    ...(options || {})
  };

  const header = columns;
  const data = rows.map((r) => header.map((c) => valueToCell(r[c])));
  const aoa = [header, ...data];

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');

  const sampleN = Math.min(opts.sample, rows.length);
  const widths = header.map((col) => {
    let maxLen = Math.max(visibleLen(col), 1);
    for (let i = 0; i < sampleN; i++) {
      const v = rows[i]?.[col];
      const str = valueToString(v);
      if (str) maxLen = Math.max(maxLen, visibleLen(str));
    }
    return clamp(maxLen + 2, opts.minWch, opts.maxWch);
  });

  ws['!cols'] = widths.map((wch) => ({ wch }));

  if (opts.autoFilter && header.length > 0) {
    const range = {
      s: { r: 0, c: 0 },
      e: { r: data.length, c: header.length - 1 }
    };
    ws['!autofilter'] = { ref: XLSX.utils.encode_range(range) };
  }

  const fname = `${(name || 'dataset').replace(/\.[^.]+$/, '')}.xlsx`;
  XLSX.writeFile(wb, fname);
}

function valueToCell(v) {
  if (v === null || v === undefined) return '';
  return v;
}

function valueToString(v) {
  if (v === null || v === undefined) return '';
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : '';
  if (v instanceof Date) return v.toISOString().slice(0, 19).replace('T', ' ');
  return String(v);
}

function visibleLen(s) {
  let n = 0;
  for (const ch of s) n += isWide(ch) ? 2 : 1;
  return n;
}

function isWide(ch) {
  const code = ch.charCodeAt(0);
  return (
    (code >= 0x1100 && code <= 0x11ff) ||
    (code >= 0x2e80 && code <= 0x9fff) ||
    (code >= 0xac00 && code <= 0xd7af) ||
    (code >= 0xff01 && code <= 0xff60) ||
    (code >= 0xffe0 && code <= 0xffe6)
  );
}

function clamp(x, lo, hi) {
  return Math.max(lo, Math.min(hi, x));
}
