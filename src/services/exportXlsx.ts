import * as XLSX from 'xlsx';

/**
 * 엑셀 파일로 내보내기 (헤더/내용 기반 자동 열너비)
 *
 * @param name      저장 파일명(확장자 제외)
 * @param columns   컬럼 배열 (표시 순서)
 * @param rows      행 데이터 (객체 배열)
 * @param options   { sample, minWch, maxWch, autoFilter }
 */
export function exportXLSX(
  name: string,
  columns: string[],
  rows: any[],
  options?: {
    sample?: number;   // 열너비 계산에 사용할 샘플 행 수 (기본 2000)
    minWch?: number;   // 최소 너비 (기본 8)
    maxWch?: number;   // 최대 너비 (기본 40)
    autoFilter?: boolean; // 1행에 자동필터 적용 (기본 true)
  }
) {
  const opts = {
    sample: 2000,
    minWch: 8,
    maxWch: 40,
    autoFilter: true,
    ...(options || {}),
  };

  // 1) AOA(배열-의-배열) 생성: 1행 = 헤더
  const header = columns;
  const data = rows.map((r) => header.map((c) => valueToCell(r[c])));
  const aoa = [header, ...data];

  // 2) 시트/워크북 생성
  const ws = XLSX.utils.aoa_to_sheet(aoa) as XLSX.WorkSheet;
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');

  // 3) 자동 열너비 계산
  //   - 각 열의 값/헤더 길이를 측정해 wch(문자단위 폭) 산출
  const sampleN = Math.min(opts.sample, rows.length);
  const widths: number[] = header.map((col, colIdx) => {
    let maxLen = Math.max(visibleLen(col), 1);
    for (let i = 0; i < sampleN; i++) {
      const v = rows[i]?.[col];
      const str = valueToString(v);
      if (str) maxLen = Math.max(maxLen, visibleLen(str));
    }
    // 여백 +2, 최소/최대 클램프
    const wch = clamp(maxLen + 2, opts.minWch, opts.maxWch);
    return wch;
  });

  // 타입 경고 방지: 시트 메타는 인덱스 시그니처가 없음 → any 캐스팅
  (ws as any)['!cols'] = widths.map((wch) => ({ wch }));

  // 4) 자동 필터(옵션)
  if (opts.autoFilter && header.length > 0) {
    const range = {
      s: { r: 0, c: 0 },
      e: { r: data.length, c: header.length - 1 },
    };
    (ws as any)['!autofilter'] = { ref: XLSX.utils.encode_range(range) };
  }

  // 5) 저장
  const fname = `${(name || 'dataset').replace(/\.[^.]+$/, '')}.xlsx`;
  XLSX.writeFile(wb, fname);
}

/* ---------- 유틸 ---------- */

// 값 → 셀 문자열로 변환(날짜/숫자 등 가벼운 처리)
function valueToCell(v: any): any {
  // 그대로 넣어도 되지만, 문자열화 정책을 통일하고 싶으면 아래처럼:
  if (v === null || v === undefined) return '';
  return v;
}

function valueToString(v: any): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : '';
  if (v instanceof Date) return v.toISOString().slice(0, 19).replace('T', ' ');
  return String(v);
}

// 동아시아 문자 폭 고려: 아주 러프하게 2바이트계 문자는 가중치 2로 가정
function visibleLen(s: string): number {
  let n = 0;
  for (const ch of s) n += isWide(ch) ? 2 : 1;
  return n;
}
function isWide(ch: string): boolean {
  // 한중일/전각 범위 대략 체크
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
