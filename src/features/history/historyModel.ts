import { formatKiBPerSecond, formatMiB, formatPercent, formatTemperature, formatWatts } from '../../lib/format';
import type { GpuHistoryRange, GpuHistorySampleDto, GpuHistorySeriesDto } from '../../lib/types';

export const ALL_HISTORY_GPU_VALUE = 'all';
export const HISTORY_RANGES: readonly GpuHistoryRange[] = ['1h', '6h', '24h'];
export const DEFAULT_HISTORY_METRICS = ['gpuUtilizationPercent', 'memoryUtilizationPercent', 'memoryUsedMiB'] as const;

export type HistoryMetricId =
  | 'gpuUtilizationPercent'
  | 'memoryUtilizationPercent'
  | 'memoryUsedMiB'
  | 'temperatureCelsius'
  | 'powerDrawWatt'
  | 'encoderUtilizationPercent'
  | 'decoderUtilizationPercent'
  | 'pcieRxKibPerSec'
  | 'pcieTxKibPerSec';

export type HistoryChartSample = {
  readonly receivedAt: string;
  readonly values: Record<string, number | null | undefined>;
};

export type HistoryMetricDefinition = {
  readonly formatter: (value: number | null | undefined) => string;
  readonly id: HistoryMetricId;
  readonly label: string;
  readonly range?: { readonly min?: number; readonly max?: number };
  readonly unit: string;
};

export type HistoryRefreshFeedback =
  | { readonly state: 'idle' }
  | { readonly state: 'pending' }
  | { readonly message: string; readonly state: 'error' | 'success' };

export const historyMetricDefinitions: readonly HistoryMetricDefinition[] = [
  { id: 'gpuUtilizationPercent', label: 'GPU util', formatter: formatPercent, range: { min: 0, max: 100 }, unit: '%' },
  { id: 'memoryUtilizationPercent', label: 'Memory util', formatter: formatPercent, range: { min: 0, max: 100 }, unit: '%' },
  { id: 'memoryUsedMiB', label: 'Memory used', formatter: formatMiB, range: { min: 0 }, unit: 'MiB' },
  { id: 'temperatureCelsius', label: 'Temperature', formatter: formatTemperature, range: { min: 0 }, unit: 'C' },
  { id: 'powerDrawWatt', label: 'Power', formatter: formatWatts, range: { min: 0 }, unit: 'W' },
  { id: 'encoderUtilizationPercent', label: 'Encoder', formatter: formatPercent, range: { min: 0, max: 100 }, unit: '%' },
  { id: 'decoderUtilizationPercent', label: 'Decoder', formatter: formatPercent, range: { min: 0, max: 100 }, unit: '%' },
  { id: 'pcieRxKibPerSec', label: 'PCIe RX', formatter: formatKiBPerSecond, range: { min: 0 }, unit: 'KiB/s' },
  { id: 'pcieTxKibPerSec', label: 'PCIe TX', formatter: formatKiBPerSecond, range: { min: 0 }, unit: 'KiB/s' }
];

export const historyMetricById = new Map(historyMetricDefinitions.map((metric) => [metric.id, metric]));

export const gpuOptionValue = (series: GpuHistorySeriesDto) => `${series.gpuIndex}::${series.gpuUuid ?? 'none'}`;

export const gpuLabel = (series: GpuHistorySeriesDto) => `GPU ${series.gpuIndex}${series.name ? ` - ${series.name}` : ''}`;

export const readMetricValue = (sample: GpuHistorySampleDto, metricId: HistoryMetricId) => sample[metricId];

export const chartSeriesKey = (series: GpuHistorySeriesDto) => `${series.gpuIndex}-${series.gpuUuid ?? 'none'}`;

export const toChartSamples = (seriesList: readonly GpuHistorySeriesDto[], metricId: HistoryMetricId) => {
  const samplesByTimestamp = new Map<string, HistoryChartSample>();

  for (const series of seriesList) {
    const key = chartSeriesKey(series);
    for (const sample of series.samples) {
      const existing = samplesByTimestamp.get(sample.receivedAt) ?? { receivedAt: sample.receivedAt, values: {} };
      existing.values[key] = readMetricValue(sample, metricId);
      samplesByTimestamp.set(sample.receivedAt, existing);
    }
  }

  return Array.from(samplesByTimestamp.values()).sort((left, right) => Date.parse(left.receivedAt) - Date.parse(right.receivedAt));
};

export const latestMetricValue = (seriesList: readonly GpuHistorySeriesDto[], metricId: HistoryMetricId) => {
  const latestTimestampMs = Math.max(...seriesList.flatMap((series) => series.samples.map((sample) => Date.parse(sample.receivedAt))).filter(Number.isFinite));

  if (!Number.isFinite(latestTimestampMs)) {
    return null;
  }

  for (const series of Array.from(seriesList).reverse()) {
    const sample = series.samples.find((entry) => Date.parse(entry.receivedAt) === latestTimestampMs);
    const value = sample ? readMetricValue(sample, metricId) : null;

    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }
  }

  return null;
};

export const rangeLabel = (range: GpuHistoryRange) => {
  if (range === '1h') {
    return 'Last 1 hour';
  }
  if (range === '6h') {
    return 'Last 6 hours';
  }
  return 'Last 24 hours';
};

export const parseHistoryRange = (value: string): GpuHistoryRange => {
  if (value === '6h' || value === '24h') {
    return value;
  }
  return '1h';
};
