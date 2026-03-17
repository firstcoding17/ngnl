import * as XLSX from 'xlsx';

/**
 * Export data to an Excel file with auto-sized columns.
 *
 * @param name      Output filename (without extension)
 * @param columns   Column list (display order)
 * @param rows      Row data (array of objects)
 * @param options   { sample, minWch, maxWch, autoFilter }
 */
export function exportXLSX(
  name: string,
  columns: string[],
  rows: any[],
  options?: {
    sample?: number;   // Number of sample rows for width calculation (default 2000)
    minWch?: number;   // Minimum width (default 8)
    maxWch?: number;   // Maximum width (default 40)
    autoFilter?: boolean; // Apply auto filter on row 1 (default true)
  }
) {
  const opts = {
    sample: 2000,
    minWch: 8,
    maxWch: 40,
    autoFilter: true,
    ...(options || {}),
  };

  // 1) Build AOA (array of arrays): row 1 = header
  const header = columns;
  const data = rows.map((r) => header.map((c) => valueToCell(r[c])));
  const aoa = [header, ...data];

  // 2) Create worksheet/workbook
  const ws = XLSX.utils.aoa_to_sheet(aoa) as XLSX.WorkSheet;
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');

  // 3) Auto-calculate column widths
  //   - Measure header/value visible length and map to wch units
  const sampleN = Math.min(opts.sample, rows.length);
  const widths: number[] = header.map((col, colIdx) => {
    let maxLen = Math.max(visibleLen(col), 1);
    for (let i = 0; i < sampleN; i++) {
      const v = rows[i]?.[col];
      const str = valueToString(v);
      if (str) maxLen = Math.max(maxLen, visibleLen(str));
    }
    // Add padding +2, clamp to min/max
    const wch = clamp(maxLen + 2, opts.minWch, opts.maxWch);
    return wch;
  });

  // Avoid type warning: worksheet metadata uses an index signature -> cast to any
  (ws as any)['!cols'] = widths.map((wch) => ({ wch }));

  // 4) Auto filter (optional)
  if (opts.autoFilter && header.length > 0) {
    const range = {
      s: { r: 0, c: 0 },
      e: { r: data.length, c: header.length - 1 },
    };
    (ws as any)['!autofilter'] = { ref: XLSX.utils.encode_range(range) };
  }

  // 5) Save
  const fname = `${(name || 'dataset').replace(/\.[^.]+$/, '')}.xlsx`;
  XLSX.writeFile(wb, fname);
}

/* ---------- Utils ---------- */

// Convert value to a worksheet cell value (light normalization).
function valueToCell(v: any): any {
  // Keep native values by default; convert here if stricter normalization is needed.
  if (v === null || v === undefined) return '';
  return v;
}

function valueToString(v: any): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : '';
  if (v instanceof Date) return v.toISOString().slice(0, 19).replace('T', ' ');
  return String(v);
}

// Rough wide-character handling: treat CJK/fullwidth chars as width 2.
function visibleLen(s: string): number {
  let n = 0;
  for (const ch of s) n += isWide(ch) ? 2 : 1;
  return n;
}
function isWide(ch: string): boolean {
  // Approximate CJK/fullwidth ranges
  const code = ch.charCodeAt(0);
  return (
    (code >= 0x1100 && code <= 0x11ff) || // Hangul Jamo
    (code >= 0x2e80 && code <= 0x9fff) || // CJK
    (code >= 0xac00 && code <= 0xd7af) || // Hangul Syllables
    (code >= 0xff01 && code <= 0xff60) || // Fullwidth ASCII variants
    (code >= 0xffe0 && code <= 0xffe6)
  );
}

function clamp(x: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, x));
}
