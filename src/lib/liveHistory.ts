import type { GpuCardDto, ServerDetailDto } from './types';

export const MAX_LIVE_GPU_SAMPLES = 120;

export type LiveGpuSampleSource = 'live' | 'stale';

export interface LiveGpuSample {
  serverId: string;
  gpuIndex: number;
  gpuUuid: string | null;
  receivedAt: string;
  memoryUsedMiB: number | null;
  memoryFreeMiB: number | null;
  memoryTotalMiB: number | null;
  gpuUtilizationPercent: number | null;
  memoryUtilizationPercent: number | null;
  encoderUtilizationPercent: number | null;
  decoderUtilizationPercent: number | null;
  jpegUtilizationPercent: number | null;
  ofaUtilizationPercent: number | null;
  pcieRxKibPerSec: number | null;
  pcieTxKibPerSec: number | null;
  temperatureCelsius: number | null;
  powerDrawWatt: number | null;
  powerLimitWatt: number | null;
  stale: boolean;
  source: LiveGpuSampleSource;
}

export type LiveGpuSampleMap = Record<string, LiveGpuSample[]>;

export const getLiveGpuSampleKey = (serverId: string, gpuIndex: number) => `${serverId}+${gpuIndex}`;

const isFailedReplacementSnapshot = (detail: ServerDetailDto) => detail.health.status.toLowerCase().includes('failed');

const isStaleSnapshot = (detail: ServerDetailDto) => detail.health.status.toLowerCase().includes('stale');

const sampleFromGpu = (detail: ServerDetailDto, gpu: GpuCardDto): LiveGpuSample => {
  const stale = isStaleSnapshot(detail);

  return {
    serverId: detail.server.id,
    gpuIndex: gpu.index,
    gpuUuid: gpu.uuid ?? null,
    receivedAt: detail.receivedAt ?? '',
    memoryUsedMiB: gpu.memoryUsedMiB,
    memoryFreeMiB: gpu.memoryFreeMiB,
    memoryTotalMiB: gpu.memoryTotalMiB,
    gpuUtilizationPercent: gpu.gpuUtilizationPercent,
    memoryUtilizationPercent: gpu.memoryUtilizationPercent,
    encoderUtilizationPercent: gpu.encoderUtilizationPercent ?? null,
    decoderUtilizationPercent: gpu.decoderUtilizationPercent ?? null,
    jpegUtilizationPercent: gpu.jpegUtilizationPercent ?? null,
    ofaUtilizationPercent: gpu.ofaUtilizationPercent ?? null,
    pcieRxKibPerSec: gpu.pcieRxKibPerSec ?? null,
    pcieTxKibPerSec: gpu.pcieTxKibPerSec ?? null,
    temperatureCelsius: gpu.temperatureCelsius,
    powerDrawWatt: gpu.powerDrawWatt,
    powerLimitWatt: gpu.powerLimitWatt,
    stale,
    source: stale ? 'stale' : 'live'
  };
};

const appendSample = (samples: LiveGpuSample[], sample: LiveGpuSample) => {
  if (samples.some((existing) => existing.receivedAt === sample.receivedAt)) {
    return samples;
  }

  return [...samples, sample].slice(-MAX_LIVE_GPU_SAMPLES);
};

export const appendLiveGpuSamplesFromDetail = (history: LiveGpuSampleMap, detail: ServerDetailDto): LiveGpuSampleMap => {
  if (!detail.receivedAt || isFailedReplacementSnapshot(detail)) {
    return history;
  }

  let changed = false;
  const next: LiveGpuSampleMap = { ...history };

  for (const gpu of detail.gpus) {
    const key = getLiveGpuSampleKey(detail.server.id, gpu.index);
    const currentSamples = next[key] ?? [];
    const updatedSamples = appendSample(currentSamples, sampleFromGpu(detail, gpu));

    if (updatedSamples !== currentSamples) {
      next[key] = updatedSamples;
      changed = true;
    }
  }

  return changed ? next : history;
};
