export type ChartType =
  | 'bar' | 'line' | 'area' | 'scatter' | 'bubble' | 'histogram'
  | 'box' | 'violin' | 'treemap' | 'heatmap'
  | 'pie' | 'donut' | 'funnel' | 'waterfall'
  | 'radar' | 'sankey';

export interface ChartOptions {
  title?: string;
  xLabel?: string;
  yLabel?: string;
  palette?: 'default' | 'pastel' | 'vivid' | 'mono';
  sortCategory?: 'none' | 'alpha' | 'valueAsc' | 'valueDesc';
  tooltip?: { showX?: boolean; showY?: boolean; showCat?: boolean };
  bins?: number;             // histogram
  agg?: 'count'|'sum'|'mean' // Aggregation mode when y is omitted (e.g. bar)
  stackedArea?: boolean;
}

export interface ChartSpec {
  type: ChartType;
  x?: string;         // x-axis column (or category)
  y?: string;         // y-axis numeric column
  hue?: string;       // grouping/color split column
  size?: string;      // marker size column (bubble)
  options?: ChartOptions;
  filter?: Record<string, any>; // (optional) frontend filter payload
}
