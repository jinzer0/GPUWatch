import type { LiveGpuSample } from '../../lib/liveHistory';
import type { GpuCardDto, GpuHistoryResponseDto, GpuHistorySampleDto, ServerDetailDto } from '../../lib/types';
import { formatTime, formatUnknown } from '../../lib/format';

export type GpuHistoryMetricKey =
  | 'gpuUtilizationPercent'
  | 'memoryUtilizationPercent'
  | 'encoderUtilizationPercent'
  | 'decoderUtilizationPercent'
  | 'pcieRxKibPerSec'
  | 'pcieTxKibPerSec';

export type GpuHistoryChartSample = Pick<GpuHistorySampleDto, 'receivedAt' | GpuHistoryMetricKey>;
export type GpuHistoryChartSource = 'stored' | 'session';
export type GpuHistoryChartData = {
  readonly samples: readonly GpuHistoryChartSample[];
  readonly source: GpuHistoryChartSource;
};

export const historyQueryRange = '1h';

export const sourceLabelByType: Record<GpuHistoryChartSource, string> = {
  stored: 'Stored history',
  session: 'Session live fallback'
};

export const gpuHistoryMetrics: readonly { readonly aria: string; readonly key: GpuHistoryMetricKey; readonly label: string; readonly range?: { readonly max?: number; readonly min?: number } }[] = [
  { aria: 'GPU utilization history', key: 'gpuUtilizationPercent', label: 'GPU util', range: { min: 0, max: 100 } },
  { aria: 'memory usage history', key: 'memoryUtilizationPercent', label: 'Memory', range: { min: 0, max: 100 } },
  { aria: 'encoder utilization history', key: 'encoderUtilizationPercent', label: 'Encoder', range: { min: 0, max: 100 } },
  { aria: 'decoder utilization history', key: 'decoderUtilizationPercent', label: 'Decoder', range: { min: 0, max: 100 } },
  { aria: 'PCIe RX history', key: 'pcieRxKibPerSec', label: 'PCIe RX', range: { min: 0 } },
  { aria: 'PCIe TX history', key: 'pcieTxKibPerSec', label: 'PCIe TX', range: { min: 0 } }
];

export const formatClockMhz = (value: number | null | undefined) => {
  if (value === null || value === undefined) {
    return 'unknown';
  }
  return `${value.toLocaleString()} MHz`;
};

export const formatPcieGeneration = (value: number | null | undefined) => {
  if (value === null || value === undefined) {
    return 'unknown';
  }
  return `Gen ${value}`;
};

export const formatPcieWidth = (value: number | null | undefined) => {
  if (value === null || value === undefined) {
    return 'unknown';
  }
  return `x${value}`;
};

export const formatMigInstanceCount = (value: number | null | undefined) => {
  if (value === null || value === undefined) {
    return 'unknown';
  }
  return `${value.toLocaleString()} ${value === 1 ? 'instance' : 'instances'}`;
};

export const migModeLabel = (value: string | null | undefined) => formatUnknown(value);

export const migBadgeLabel = (gpu: GpuCardDto) => {
  const currentMode = gpu.migModeCurrent?.toLowerCase();
  if (currentMode === 'enabled') {
    return 'MIG enabled';
  }
  if (currentMode === 'disabled') {
    return 'MIG disabled';
  }
  return 'MIG unknown';
};

export const migAvailabilityCopy = (gpu: GpuCardDto) => {
  if (gpu.migModeCurrent === null || gpu.migModeCurrent === undefined) {
    return 'MIG availability is unknown for this GPU.';
  }
  return 'Instance-level MIG topology is not collected yet.';
};

export const isFailedReplacementSnapshot = (detail: ServerDetailDto) => detail.health.status.toLowerCase().includes('failed');

export const shouldShowLastSuccessNote = (detail: ServerDetailDto) => {
  const status = detail.health.status.toLowerCase();
  return status.includes('stale') || status.includes('offline') || status.includes('error') || status.includes('failed');
};

export const lastSuccessChartNote = (detail: ServerDetailDto) => `Charts use the last successful snapshot. Last success: ${formatTime(detail.health.lastSuccessAt)}.`;

export const toGpuHistoryChartSamples = (samples: readonly (LiveGpuSample | GpuHistorySampleDto)[]): GpuHistoryChartSample[] =>
  samples.map((sample) => ({
    receivedAt: sample.receivedAt,
    gpuUtilizationPercent: sample.gpuUtilizationPercent,
    memoryUtilizationPercent: sample.memoryUtilizationPercent,
    encoderUtilizationPercent: sample.encoderUtilizationPercent,
    decoderUtilizationPercent: sample.decoderUtilizationPercent,
    pcieRxKibPerSec: sample.pcieRxKibPerSec,
    pcieTxKibPerSec: sample.pcieTxKibPerSec
  }));

export const findStoredGpuSeries = (history: GpuHistoryResponseDto | null, gpu: GpuCardDto) => {
  const seriesWithSamples = history?.series.filter((series) => series.samples.length > 0) ?? [];
  return seriesWithSamples.find((series) => series.gpuIndex === gpu.index) ?? seriesWithSamples.find((series) => series.gpuUuid === gpu.uuid) ?? null;
};

export const resolveGpuHistoryChartData = ({
  gpu,
  history,
  isStoredHistoryReady,
  sessionSamples
}: {
  readonly gpu: GpuCardDto;
  readonly history: GpuHistoryResponseDto | null;
  readonly isStoredHistoryReady: boolean;
  readonly sessionSamples: readonly LiveGpuSample[];
}): GpuHistoryChartData => {
  const storedSeries = isStoredHistoryReady ? findStoredGpuSeries(history, gpu) : null;
  if (storedSeries) {
    return { samples: toGpuHistoryChartSamples(storedSeries.samples), source: 'stored' };
  }

  return { samples: toGpuHistoryChartSamples(sessionSamples), source: 'session' };
};
