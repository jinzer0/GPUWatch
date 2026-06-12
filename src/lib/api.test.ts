import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  deleteServer,
  getServerDetail,
  initializeApp,
  listGpuHistory,
  listOverview,
  listProcesses,
  listServers,
  refreshServer,
  saveServer,
  seedDemoData,
  setServerEnabled,
  testConnection
} from './api';
import type {
  ConnectionTestResultDto,
  GpuHistoryResponseDto,
  ProcessRowDto,
  Server,
  ServerDetailDto,
  ServerInput,
  ServerOverviewDto
} from './types';

const overviewRow: ServerOverviewDto = {
  id: 'server-1',
  name: 'Electron GPU',
  host: 'electron.local',
  status: 'online',
  gpuTotal: 1,
  busyGpuCount: 0,
  freeGpuCount: 1,
  averageGpuUtilizationPercent: 5,
  averageMemoryUsagePercent: 10,
  maxTemperatureCelsius: 55,
  lastSuccessAt: '2026-06-06T00:00:00Z',
  lastErrorType: null,
  lastErrorMessage: null
};

const serverInput: ServerInput = {
  id: null,
  name: 'Saved GPU',
  host: 'saved.local',
  port: 22,
  username: 'alice',
  sshKeyPath: null,
  pollingIntervalSeconds: 30,
  enabled: true
};

const savedServer: Server = {
  ...serverInput,
  id: 'server-2',
  pollingIntervalSeconds: 30,
  configRevision: 1,
  createdAt: '2026-06-06T00:00:00Z',
  updatedAt: '2026-06-06T00:00:00Z'
};

const serverDetail: ServerDetailDto = {
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

const gpuHistory: GpuHistoryResponseDto = {
  serverId: 'server-2',
  serverName: 'Saved GPU',
  pollingIntervalSeconds: 30,
  range: '1h',
  startedAt: '2026-06-06T00:00:00Z',
  finishedAt: '2026-06-06T01:00:00Z',
  series: []
};

const processRow: ProcessRowDto = {
  serverId: 'server-2',
  serverName: 'Saved GPU',
  stale: false,
  gpuIndex: 0,
  pid: 1234,
  parentPid: null,
  runtimeSeconds: 60,
  username: 'alice',
  command: 'python train.py',
  gpuUuid: 'GPU-1',
  processKind: 'compute',
  gpuMemoryUsedMiB: 1024,
  gpuUtilizationPercent: 75,
  gpuSmUtilizationPercent: 70,
  gpuMemoryUtilizationPercent: 25,
  gpuEncoderUtilizationPercent: null,
  gpuDecoderUtilizationPercent: null,
  cpuPercent: 20,
  hostMemoryUsedMiB: 2048
};

const connectionResult: ConnectionTestResultDto = {
  ok: true,
  status: 'online',
  errorType: null,
  message: 'Connection successful.'
};

describe('frontend backend transport adapter', () => {
  beforeEach(() => {
    delete window.gpuwatcher;
  });

  it('calls every exported command-backed function through Electron action-specific bridge methods', async () => {
    const bridge = {
      initializeApp: vi.fn().mockResolvedValue({ ok: true, data: [overviewRow] }),
      listOverview: vi.fn().mockResolvedValue({ ok: true, data: [overviewRow] }),
      listServers: vi.fn().mockResolvedValue({ ok: true, data: [savedServer] }),
      saveServer: vi.fn().mockResolvedValue({ ok: true, data: savedServer }),
      deleteServer: vi.fn().mockResolvedValue({ ok: true, data: undefined }),
      setServerEnabled: vi.fn().mockResolvedValue({ ok: true, data: savedServer }),
      seedDemoData: vi.fn().mockResolvedValue({ ok: true, data: [overviewRow] }),
      getServerDetail: vi.fn().mockResolvedValue({ ok: true, data: serverDetail }),
      listGpuHistory: vi.fn().mockResolvedValue({ ok: true, data: gpuHistory }),
      listProcesses: vi.fn().mockResolvedValue({ ok: true, data: [processRow] }),
      testConnection: vi.fn().mockResolvedValue({ ok: true, data: connectionResult }),
      refreshServer: vi.fn().mockResolvedValue({ ok: true, data: connectionResult })
    } satisfies NonNullable<Window['gpuwatcher']>;
    window.gpuwatcher = bridge;

    await expect(initializeApp()).resolves.toEqual([overviewRow]);
    await expect(listOverview()).resolves.toEqual([overviewRow]);
    await expect(listServers()).resolves.toEqual([savedServer]);
    await expect(saveServer(serverInput)).resolves.toEqual(savedServer);
    await expect(deleteServer('server-2')).resolves.toBeUndefined();
    await expect(setServerEnabled('server-2', false)).resolves.toEqual(savedServer);
    await expect(seedDemoData()).resolves.toEqual([overviewRow]);
    await expect(getServerDetail('server-2')).resolves.toEqual(serverDetail);
    await expect(listGpuHistory('server-2', 0, 'GPU-1', '1h')).resolves.toEqual(gpuHistory);
    await expect(listProcesses()).resolves.toEqual([processRow]);
    await expect(testConnection('server-2')).resolves.toEqual(connectionResult);
    await expect(refreshServer('server-2')).resolves.toEqual(connectionResult);

    expect(bridge.initializeApp).toHaveBeenCalledWith({});
    expect(bridge.listOverview).toHaveBeenCalledWith({});
    expect(bridge.listServers).toHaveBeenCalledWith({});
    expect(bridge.saveServer).toHaveBeenCalledWith({ input: serverInput });
    expect(bridge.deleteServer).toHaveBeenCalledWith({ id: 'server-2' });
    expect(bridge.setServerEnabled).toHaveBeenCalledWith({ id: 'server-2', enabled: false });
    expect(bridge.seedDemoData).toHaveBeenCalledWith({});
    expect(bridge.getServerDetail).toHaveBeenCalledWith({ id: 'server-2' });
    expect(bridge.listGpuHistory).toHaveBeenCalledWith({ serverId: 'server-2', gpuIndex: 0, gpuUuid: 'GPU-1', range: '1h' });
    expect(bridge.listProcesses).toHaveBeenCalledWith({});
    expect(bridge.testConnection).toHaveBeenCalledWith({ id: 'server-2' });
    expect(bridge.refreshServer).toHaveBeenCalledWith({ id: 'server-2' });
  });

  it('maps Electron error envelopes to normal typed errors', async () => {
    window.gpuwatcher = {
      setServerEnabled: vi.fn().mockResolvedValue({
        ok: false,
        error: { layer: 'storage_app', type: 'server_missing', message: 'Server was removed.' }
      })
    };

    await expect(setServerEnabled('server-missing', true)).rejects.toMatchObject({
      message: 'Server was removed.',
      layer: 'storage_app',
      type: 'server_missing'
    });
  });

  it('uses browser read fallbacks when the Electron bridge is absent or lacks a requested read method', async () => {
    await expect(initializeApp()).resolves.toEqual([]);
    await expect(listOverview()).resolves.toEqual([]);
    await expect(listServers()).resolves.toEqual([]);
    await expect(getServerDetail('server-1')).resolves.toBeNull();
    await expect(listGpuHistory('server-1', null, null, '1h')).resolves.toMatchObject({
      serverId: 'server-1',
      range: '1h',
      series: []
    });
    await expect(listProcesses()).resolves.toEqual([]);

    window.gpuwatcher = { listOverview: vi.fn().mockResolvedValue({ ok: true, data: [overviewRow] }) };
    await expect(listServers()).resolves.toEqual([]);
    expect(window.gpuwatcher.listOverview).not.toHaveBeenCalled();
  });

  it('returns explicit browser failures for mutation, test, and refresh actions when Electron bridge is absent', async () => {
    const unavailable = {
      ok: false,
      status: 'error',
      errorType: 'backend_unavailable',
      message: 'GPUWatcher backend is unavailable. Launch the desktop app to use this action.'
    };

    await expect(testConnection('server-1')).resolves.toEqual(unavailable);
    await expect(refreshServer('server-1')).resolves.toEqual(unavailable);
    await expect(seedDemoData()).rejects.toThrow('GPUWatcher backend is unavailable');
    await expect(saveServer(serverInput)).rejects.toThrow('GPUWatcher backend is unavailable');
    await expect(deleteServer('server-1')).rejects.toThrow('GPUWatcher backend is unavailable');
    await expect(setServerEnabled('server-1', true)).rejects.toThrow('GPUWatcher backend is unavailable');
  });

  it('rejects invalid history requests before calling the bridge', async () => {
    const listGpuHistoryBridge = vi.fn();
    window.gpuwatcher = { listGpuHistory: listGpuHistoryBridge };

    await expect(listGpuHistory(' ', null, null, '1h')).rejects.toThrow('serverId is required to list GPU history.');
    expect(listGpuHistoryBridge).not.toHaveBeenCalled();
  });
});
