export type MiniLinePoint = {
  readonly index: number;
  readonly value: number;
  readonly x: number;
  readonly y: number;
};

export type TimeSeriesChartDensity = 'full' | 'compact';
export type TimeSeriesChartTone = 'accent' | 'brand' | 'warning' | 'success';

export type TimeSeriesChartSample = {
  readonly receivedAt?: string | number | Date | null;
  readonly timestamp?: string | number | Date | null;
  readonly [key: string]: unknown;
};

export type TimeSeriesMetricSelector<T extends TimeSeriesChartSample> = keyof T | ((sample: T) => number | null | undefined);
export type TimeSeriesTimestampSelector<T extends TimeSeriesChartSample> = keyof T | ((sample: T) => string | number | Date | null | undefined);

export type TimeSeriesChartSeries<T extends TimeSeriesChartSample = TimeSeriesChartSample> = {
  readonly id: string;
  readonly label: string;
  readonly metric: TimeSeriesMetricSelector<T>;
  readonly tone?: TimeSeriesChartTone;
};

export type TimeSeriesChartRange = {
  readonly max?: number;
  readonly min?: number;
};

export type TimeSeriesPreparedSample<T extends TimeSeriesChartSample> = {
  readonly sample: T;
  readonly timestampMs: number;
  readonly x: number;
};

export type TimeSeriesPoint = {
  readonly seriesId: string;
  readonly timestampMs: number;
  readonly value: number;
  readonly x: number;
  readonly y: number;
};

export type TimeSeriesGap = {
  readonly deltaSeconds?: number;
  readonly key: string;
  readonly reason: 'metric-null' | 'time';
  readonly x: number;
};

export type TimeSeriesRenderableSeries = {
  readonly gaps: readonly TimeSeriesGap[];
  readonly id: string;
  readonly label: string;
  readonly points: readonly TimeSeriesPoint[];
  readonly segments: readonly (readonly TimeSeriesPoint[])[];
  readonly tone: TimeSeriesChartTone;
};
