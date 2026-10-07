import type { GpuHistoryResponseDto, ServerDetailDto } from '../lib/types';
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
      availability: { state: 'unknown', conditionStartedAt: null },
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
      availability: { state: 'unknown', conditionStartedAt: null },
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
