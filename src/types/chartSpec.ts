export type ChartType =
  | 'bar' | 'line' | 'scatter' | 'histogram'
  | 'box' | 'violin' | 'treemap' | 'heatmap'
  | 'radar' | 'sankey';

export interface ChartOptions {
  title?: string;
  xLabel?: string;
  yLabel?: string;
  palette?: 'default' | 'pastel' | 'vivid' | 'mono';
  sortCategory?: 'none' | 'alpha' | 'valueAsc' | 'valueDesc';
  tooltip?: { showX?: boolean; showY?: boolean; showCat?: boolean };
  bins?: number;             // histogram
  agg?: 'count'|'sum'|'mean' // bar 등에서 y 없을 때 집계
}

export interface ChartSpec {
  type: ChartType;
  x?: string;         // x축 컬럼 (또는 카테고리)
  y?: string;         // y축 컬럼(수치)
  hue?: string;       // 그룹/색상 분할
  options?: ChartOptions;
  filter?: Record<string, any>; // (선택) 프론트 필터
}
