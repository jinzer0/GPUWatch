import type { LiveGpuSample } from '../lib/liveHistory';
import type { GpuHistoryResponseDto, GpuHistorySampleDto, ServerDetailDto } from '../lib/types';
import { savedServer } from './server-fixtures';

export const detailFixture: ServerDetailDto = {
  server: {
    id: 'server-1',
    name: 'Lab GPU',
    host: 'gpu.example.test',
    port: 22,
    username: 'alice',
    sshKeyPath: null,
    pollingIntervalSeconds: 30,
    enabled: true,
    configRevision: 1,
    createdAt: '2026-06-02T00:00:00Z',
    updatedAt: '2026-06-02T00:00:00Z'
  },
  health: {
    status: 'online',
    lastErrorType: null,
    lastErrorMessage: null,
    lastPollStartedAt: null,
    lastPollFinishedAt: null,
    lastSuccessAt: null
  },
  collectorHostname: null,
  driverVersion: null,
  cudaVersion: null,
  receivedAt: null,
  warnings: ['pmon unavailable; per-process utilization unknown'],
  gpus: [
    {
      index: 0,
      uuid: 'GPU-nullable',
      name: 'NVIDIA Test GPU',
      pciBusId: null,
      driverVersion: null,
      graphicsClockMhz: null,
      memoryClockMhz: null,
      busy: false,
      memoryTotalMiB: null,
      memoryUsedMiB: null,
      memoryFreeMiB: null,
      gpuUtilizationPercent: null,
      memoryUtilizationPercent: null,
      encoderUtilizationPercent: null,
      decoderUtilizationPercent: null,
      jpegUtilizationPercent: null,
      ofaUtilizationPercent: null,
      pcieRxKibPerSec: null,
      pcieTxKibPerSec: null,
      pcieLinkGenCurrent: null,
      pcieLinkWidthCurrent: null,
      migModeCurrent: null,
      migModePending: null,
      migInstanceCount: null,
      temperatureCelsius: null,
      powerDrawWatt: null,
      powerLimitWatt: null,
      fanSpeedPercent: null,
      processCount: 1,
      processes: [
        {
          pid: 1234,
          username: null,
          command: null,
          gpuMemoryUsedMiB: null,
          gpuUtilizationPercent: null,
          cpuPercent: null,
          hostMemoryUsedMiB: null
        }
      ]
    },
    {
      index: 1,
      uuid: 'GPU-populated',
      name: 'NVIDIA Clocked GPU',
      pciBusId: '00000000:65:00.0',
      driverVersion: '550.54.14',
      graphicsClockMhz: 1410,
      memoryClockMhz: 5001,
      busy: true,
      memoryTotalMiB: 49152,
      memoryUsedMiB: 32768,
      memoryFreeMiB: 16384,
      gpuUtilizationPercent: 83.2,
      memoryUtilizationPercent: 67.4,
      encoderUtilizationPercent: 12.3,
      decoderUtilizationPercent: 4.5,
      jpegUtilizationPercent: 6.7,
      ofaUtilizationPercent: 8.9,
      pcieRxKibPerSec: 1536,
      pcieTxKibPerSec: 2048,
      pcieLinkGenCurrent: 4,
      pcieLinkWidthCurrent: 16,
      migModeCurrent: 'Enabled',
      migModePending: 'Disabled',
      migInstanceCount: 2,
      temperatureCelsius: 71.5,
      powerDrawWatt: 225.3,
      powerLimitWatt: 300,
      fanSpeedPercent: 46.2,
      processCount: 0,
      processes: []
    }
  ]
};

export const historySample = (overrides: Partial<GpuHistorySampleDto> = {}): GpuHistorySampleDto => ({
  receivedAt: '2026-06-04T00:00:00.000Z',
  memoryTotalMiB: 49_152,
  memoryUsedMiB: 12_288,
  memoryFreeMiB: 36_864,
  gpuUtilizationPercent: 30,
  memoryUtilizationPercent: 25,
  encoderUtilizationPercent: 5,
  decoderUtilizationPercent: 4,
  jpegUtilizationPercent: null,
  ofaUtilizationPercent: null,
  temperatureCelsius: 50,
  powerDrawWatt: 150,
  powerLimitWatt: 300,
  pcieRxKibPerSec: 512,
  pcieTxKibPerSec: 768,
  ...overrides
});

export const historyResponse = (series: GpuHistoryResponseDto['series'] = []): GpuHistoryResponseDto => ({
  serverId: 'server-1',
  serverName: 'Lab GPU',
  pollingIntervalSeconds: 30,
  range: '1h',
  startedAt: '2026-06-04T00:00:00.000Z',
  finishedAt: '2026-06-04T01:00:00.000Z',
  series
});

export const sessionSample = (overrides: Partial<LiveGpuSample> = {}): LiveGpuSample => ({
  serverId: 'server-1',
  gpuIndex: 1,
  gpuUuid: 'GPU-populated',
  receivedAt: '2026-06-04T00:00:00.000Z',
  memoryUsedMiB: 24_576,
  memoryFreeMiB: 24_576,
  memoryTotalMiB: 49_152,
  gpuUtilizationPercent: 40,
  memoryUtilizationPercent: 50,
  encoderUtilizationPercent: 10,
  decoderUtilizationPercent: 3,
  jpegUtilizationPercent: null,
  ofaUtilizationPercent: null,
  pcieRxKibPerSec: 1000,
  pcieTxKibPerSec: null,
  temperatureCelsius: null,
  powerDrawWatt: null,
  powerLimitWatt: null,
  stale: false,
  source: 'live',
  ...overrides
});

export const apiServerDetail: ServerDetailDto = {
  server: savedServer,
  health: {
    status: 'online',
    lastErrorType: null,
    lastErrorMessage: null,
    lastPollStartedAt: null,
    lastPollFinishedAt: null,
    lastSuccessAt: '2026-06-06T00:00:00Z'
  },
  collectorHostname: 'saved.local',
  driverVersion: '550.54',
  cudaVersion: '12.4',
  receivedAt: '2026-06-06T00:00:00Z',
  warnings: [],
  gpus: []
};

export const apiGpuHistory: GpuHistoryResponseDto = {
  serverId: 'server-2',
  serverName: 'Saved GPU',
  pollingIntervalSeconds: 30,
  range: '1h',
  startedAt: '2026-06-06T00:00:00Z',
  finishedAt: '2026-06-06T01:00:00Z',
  series: []
};
