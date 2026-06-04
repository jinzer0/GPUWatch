import { describe, expect, it } from 'vitest';

import { appendLiveGpuSamplesFromDetail, getLiveGpuSampleKey, MAX_LIVE_GPU_SAMPLES, type LiveGpuSampleMap } from './liveHistory';
import { useUiStore } from './store';
import type { GpuCardDto, ServerDetailDto } from './types';

const gpuFixture = (overrides: Partial<GpuCardDto> = {}): GpuCardDto => ({
  index: 0,
  uuid: 'GPU-alpha-0',
  name: 'NVIDIA RTX 6000',
  pciBusId: '0000:01:00.0',
  driverVersion: '550.54',
  graphicsClockMhz: 1800,
  memoryClockMhz: 9500,
  busy: false,
  memoryTotalMiB: 49152,
  memoryUsedMiB: 1024,
  memoryFreeMiB: 48128,
  gpuUtilizationPercent: 12,
  memoryUtilizationPercent: 8,
  encoderUtilizationPercent: 3,
  decoderUtilizationPercent: 4,
  jpegUtilizationPercent: 5,
  ofaUtilizationPercent: 6,
  pcieRxKibPerSec: 700,
  pcieTxKibPerSec: 800,
  temperatureCelsius: 41,
  powerDrawWatt: 92.5,
  powerLimitWatt: 300,
  fanSpeedPercent: 30,
  processCount: 0,
  processes: [],
  ...overrides
});

const detailFixture = (overrides: Partial<ServerDetailDto> = {}): ServerDetailDto => ({
  server: {
    id: 'server-a',
    name: 'Server A',
    host: 'server-a.local',
    port: 22,
    username: 'gpu',
    sshKeyPath: null,
    pollingIntervalSeconds: 5,
    enabled: true,
    configRevision: 1,
    createdAt: '2026-06-04T00:00:00.000Z',
    updatedAt: '2026-06-04T00:00:00.000Z'
  },
  health: {
    status: 'online',
    lastErrorType: null,
    lastErrorMessage: null,
    lastPollStartedAt: '2026-06-04T00:00:01.000Z',
    lastPollFinishedAt: '2026-06-04T00:00:02.000Z',
    lastSuccessAt: '2026-06-04T00:00:02.000Z'
  },
  collectorHostname: 'server-a',
  driverVersion: '550.54',
  cudaVersion: '12.4',
  receivedAt: '2026-06-04T00:00:02.000Z',
  warnings: [],
  gpus: [gpuFixture()],
  ...overrides
});

const makeSeedHistory = (count: number): LiveGpuSampleMap => ({
  'server-a+0': Array.from({ length: count }, (_, index) => ({
    serverId: 'server-a',
    gpuIndex: 0,
    gpuUuid: 'GPU-alpha-0',
    receivedAt: `2026-06-04T00:${String(index).padStart(2, '0')}:00.000Z`,
    memoryUsedMiB: index,
    memoryFreeMiB: null,
    memoryTotalMiB: null,
    gpuUtilizationPercent: index,
    memoryUtilizationPercent: null,
    encoderUtilizationPercent: null,
    decoderUtilizationPercent: null,
    jpegUtilizationPercent: null,
    ofaUtilizationPercent: null,
    pcieRxKibPerSec: null,
    pcieTxKibPerSec: null,
    temperatureCelsius: null,
    powerDrawWatt: null,
    powerLimitWatt: null,
    stale: false,
    source: 'live'
  }))
});

describe('live GPU history utilities', () => {
  it('keys samples by serverId + gpuIndex and prunes each key to exactly 120 latest samples', () => {
    const next = appendLiveGpuSamplesFromDetail(makeSeedHistory(MAX_LIVE_GPU_SAMPLES), detailFixture({
      receivedAt: '2026-06-04T02:00:00.000Z'
    }));

    expect(getLiveGpuSampleKey('server-a', 0)).toBe('server-a+0');
    expect(next['server-a+0']).toHaveLength(MAX_LIVE_GPU_SAMPLES);
    expect(next['server-a+0'][0].receivedAt).toBe('2026-06-04T00:01:00.000Z');
    expect(next['server-a+0'][119].receivedAt).toBe('2026-06-04T02:00:00.000Z');
  });

  it('deduplicates exact serverId + gpuIndex + receivedAt matches without dropping other GPUs', () => {
    const first = appendLiveGpuSamplesFromDetail({}, detailFixture({
      gpus: [gpuFixture({ index: 0, uuid: 'GPU-alpha-0' }), gpuFixture({ index: 1, uuid: 'GPU-alpha-1' })]
    }));
    const second = appendLiveGpuSamplesFromDetail(first, detailFixture({
      gpus: [gpuFixture({ index: 0, uuid: 'GPU-alpha-0' }), gpuFixture({ index: 1, uuid: 'GPU-alpha-1' })]
    }));

    expect(second['server-a+0']).toHaveLength(1);
    expect(second['server-a+1']).toHaveLength(1);
  });

  it('appends only successful snapshot details with receivedAt and skips failed replacement health', () => {
    const missingReceivedAt = appendLiveGpuSamplesFromDetail({}, detailFixture({ receivedAt: null }));
    const failedReplacement = appendLiveGpuSamplesFromDetail({}, detailFixture({ health: { ...detailFixture().health, status: 'failed replacement' } }));
    const staleSuccess = appendLiveGpuSamplesFromDetail({}, detailFixture({ health: { ...detailFixture().health, status: 'stale' } }));

    expect(missingReceivedAt).toEqual({});
    expect(failedReplacement).toEqual({});
    expect(staleSuccess['server-a+0'][0]).toMatchObject({ stale: true, source: 'stale' });
  });

  it('preserves null metric values instead of fabricating zeroes', () => {
    const next = appendLiveGpuSamplesFromDetail({}, detailFixture({
      gpus: [gpuFixture({
        memoryUsedMiB: null,
        gpuUtilizationPercent: null,
        encoderUtilizationPercent: null,
        pcieRxKibPerSec: null,
        temperatureCelsius: null,
        powerDrawWatt: null
      })]
    }));

    expect(next['server-a+0'][0]).toMatchObject({
      memoryUsedMiB: null,
      gpuUtilizationPercent: null,
      encoderUtilizationPercent: null,
      pcieRxKibPerSec: null,
      temperatureCelsius: null,
      powerDrawWatt: null
    });
  });
});

describe('useUiStore live session state', () => {
  it('defaults live samples to session memory and density mode to full', () => {
    useUiStore.setState(useUiStore.getInitialState(), true);

    expect(useUiStore.getState().liveSamples).toEqual({});
    expect(useUiStore.getState().densityMode).toBe('full');
  });

  it('appends detail samples through the store without localStorage persistence', () => {
    useUiStore.setState(useUiStore.getInitialState(), true);

    useUiStore.getState().appendLiveSamplesFromDetail(detailFixture());
    useUiStore.getState().setDensityMode('compact');

    expect(useUiStore.getState().liveSamples['server-a+0']).toHaveLength(1);
    expect(useUiStore.getState().densityMode).toBe('compact');
    expect(window.localStorage.getItem('densityMode')).toBeNull();
  });
});
