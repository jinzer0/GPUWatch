import type {
  MiniLinePoint,
  TimeSeriesChartRange,
  TimeSeriesChartSample,
  TimeSeriesChartSeries,
  TimeSeriesGap,
  TimeSeriesChartTone,
  TimeSeriesMetricSelector,
  TimeSeriesPoint,
  TimeSeriesPreparedSample,
  TimeSeriesRenderableSeries,
  TimeSeriesTimestampSelector
} from './chartTypes';

export const miniLineChartPoints = (values: readonly (number | null | undefined)[], width: number, height: number) => {
  const numericValues = values.filter((value): value is number => typeof value === 'number' && Number.isFinite(value));

  if (numericValues.length < 2) {
    return [];
  }

  const min = Math.min(...numericValues);
  const max = Math.max(...numericValues);
  const range = max - min;
  const horizontalStep = values.length > 1 ? width / (values.length - 1) : width;
  const verticalPadding = 4;
  const usableHeight = height - verticalPadding * 2;

  return values.map((value, index) => {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      return null;
    }

    const ratio = range === 0 ? 0.5 : (value - min) / range;
    return {
      index,
      value,
      x: Number((index * horizontalStep).toFixed(2)),
      y: Number((height - verticalPadding - ratio * usableHeight).toFixed(2))
    };
  });
};

export const miniLineChartSegments = (points: readonly (MiniLinePoint | null)[]) => {
  const segments: MiniLinePoint[][] = [];
  let currentSegment: MiniLinePoint[] = [];

  for (const point of points) {
    if (point === null) {
      if (currentSegment.length > 0) {
        segments.push(currentSegment);
        currentSegment = [];
      }
      continue;
    }

    currentSegment.push(point);
  }

  if (currentSegment.length > 0) {
    segments.push(currentSegment);
  }

  return segments;
};

export const readTimeSeriesTimestamp = <T extends TimeSeriesChartSample>(sample: T, selector?: TimeSeriesTimestampSelector<T>) => {
  const rawValue =
    typeof selector === 'function'
      ? selector(sample)
      : selector
        ? sample[selector]
        : (sample.receivedAt ?? sample.timestamp);

  if (rawValue instanceof Date) {
    return rawValue.getTime();
  }
  if (typeof rawValue === 'number') {
    return rawValue;
  }
  if (typeof rawValue === 'string') {
    return Date.parse(rawValue);
  }
  return Number.NaN;
};

export const readTimeSeriesMetric = <T extends TimeSeriesChartSample>(sample: T, selector: TimeSeriesMetricSelector<T>) => {
  const rawValue = typeof selector === 'function' ? selector(sample) : sample[selector];
  return typeof rawValue === 'number' && Number.isFinite(rawValue) ? rawValue : null;
};

const resolveTimeSeriesValueDomain = (values: readonly number[], range?: TimeSeriesChartRange) => {
  const rangeMin = typeof range?.min === 'number' && Number.isFinite(range.min) ? range.min : undefined;
  const rangeMax = typeof range?.max === 'number' && Number.isFinite(range.max) ? range.max : undefined;
  const min = rangeMin ?? Math.min(...values);
  const max = rangeMax ?? Math.max(...values);

  return min <= max ? { min, max } : { min: max, max: min };
};

const timeSeriesY = (value: number, min: number, max: number, height: number) => {
  const verticalPadding = 10;
  const usableHeight = height - verticalPadding * 2;
  const ratio = max === min ? 0.5 : (value - min) / (max - min);
  return Number((height - verticalPadding - ratio * usableHeight).toFixed(2));
};

export const timeSeriesPath = (segment: readonly TimeSeriesPoint[]) => segment.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`).join(' ');

const timeGapThresholdSeconds = (pollingIntervalSeconds?: number | null, gapThresholdSeconds?: number) => {
  if (typeof gapThresholdSeconds === 'number' && Number.isFinite(gapThresholdSeconds)) {
    return gapThresholdSeconds;
  }

  const pollingSeconds = typeof pollingIntervalSeconds === 'number' && Number.isFinite(pollingIntervalSeconds) ? pollingIntervalSeconds : 60;
  return Math.max(pollingSeconds * 2, 120);
};

const timeSeriesTone = (seriesIndex: number): TimeSeriesChartTone => {
  switch (seriesIndex % 4) {
    case 0:
      return 'accent';
    case 1:
      return 'brand';
    case 2:
      return 'warning';
    default:
      return 'success';
  }
};

type BuildTimeSeriesOptions<T extends TimeSeriesChartSample> = {
  readonly gapThresholdSeconds?: number;
  readonly height: number;
  readonly pollingIntervalSeconds?: number | null;
  readonly range?: TimeSeriesChartRange;
  readonly samples: readonly T[];
  readonly series: readonly TimeSeriesChartSeries<T>[];
  readonly timestamp?: TimeSeriesTimestampSelector<T>;
  readonly width: number;
};

export const buildTimeSeries = <T extends TimeSeriesChartSample>({
  gapThresholdSeconds,
  height,
  pollingIntervalSeconds,
  range,
  samples,
  series,
  timestamp,
  width
}: BuildTimeSeriesOptions<T>) => {
  const orderedSamples = samples
    .map((sample) => ({ sample, timestampMs: readTimeSeriesTimestamp(sample, timestamp) }))
    .filter((sample): sample is { sample: T; timestampMs: number } => Number.isFinite(sample.timestampMs))
    .sort((left, right) => left.timestampMs - right.timestampMs);

  if (orderedSamples.length === 0 || series.length === 0) {
    return [];
  }

  const numericValues = orderedSamples.flatMap(({ sample }) => series.map((entry) => readTimeSeriesMetric(sample, entry.metric)).filter((value): value is number => value !== null));

  if (numericValues.length === 0) {
    return [];
  }

  const firstTimestamp = orderedSamples[0].timestampMs;
  const lastTimestamp = orderedSamples[orderedSamples.length - 1].timestampMs;
  const timeRange = lastTimestamp - firstTimestamp;
  const preparedSamples: Array<TimeSeriesPreparedSample<T>> = orderedSamples.map(({ sample, timestampMs }) => ({
    sample,
    timestampMs,
    x: Number((timeRange === 0 ? width / 2 : ((timestampMs - firstTimestamp) / timeRange) * width).toFixed(2))
  }));
  const valueDomain = resolveTimeSeriesValueDomain(numericValues, range);
  const thresholdSeconds = timeGapThresholdSeconds(pollingIntervalSeconds, gapThresholdSeconds);

  return series.map((entry, seriesIndex): TimeSeriesRenderableSeries => {
    const segments: TimeSeriesPoint[][] = [];
    const gaps: TimeSeriesGap[] = [];
    const points: TimeSeriesPoint[] = [];
    let currentSegment: TimeSeriesPoint[] = [];
    let previousSample: TimeSeriesPreparedSample<T> | null = null;

    for (const preparedSample of preparedSamples) {
      if (previousSample) {
        const deltaSeconds = (preparedSample.timestampMs - previousSample.timestampMs) / 1000;
        if (deltaSeconds > thresholdSeconds) {
          if (currentSegment.length > 0) {
            segments.push(currentSegment);
            currentSegment = [];
          }
          gaps.push({
            deltaSeconds: Math.round(deltaSeconds),
            key: `${entry.id}-time-${previousSample.timestampMs}-${preparedSample.timestampMs}`,
            reason: 'time',
            x: Number(((previousSample.x + preparedSample.x) / 2).toFixed(2))
          });
        }
      }

      const value = readTimeSeriesMetric(preparedSample.sample, entry.metric);
      if (value === null) {
        if (currentSegment.length > 0) {
          segments.push(currentSegment);
          currentSegment = [];
        }
        gaps.push({ key: `${entry.id}-null-${preparedSample.timestampMs}`, reason: 'metric-null', x: preparedSample.x });
        previousSample = preparedSample;
        continue;
      }

      const point = {
        seriesId: entry.id,
        timestampMs: preparedSample.timestampMs,
        value,
        x: preparedSample.x,
        y: timeSeriesY(value, valueDomain.min, valueDomain.max, height)
      };
      currentSegment.push(point);
      points.push(point);
      previousSample = preparedSample;
    }

    if (currentSegment.length > 0) {
      segments.push(currentSegment);
    }

    return {
      gaps,
      id: entry.id,
      label: entry.label,
      points,
      segments,
      tone: entry.tone ?? timeSeriesTone(seriesIndex)
    };
  });
};
