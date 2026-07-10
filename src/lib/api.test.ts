import { beforeEach, describe, expect, it, vi } from 'vitest';

import * as api from './api';
import {
  deleteServer,
  getServerDetail,
  initializeApp,
  listGpuHistory,
  listOverview,
  listProcesses,
  listServers,
  listSshConfigHosts,
  refreshServer,
  saveServer,
  seedDemoData,
  setServerEnabled,
  testConnection
} from './api';
import { clearGpuWatcherBridge, okBridgeResponse, setGpuWatcherBridge } from '../test-utils/bridge';
import { apiServerDetail as serverDetail, apiGpuHistory as gpuHistory } from '../test-utils/detail-fixtures';
import { apiProcessRow as processRow } from '../test-utils/process-fixtures';
import { connectionResult, overviewRow, savedServer, serverInput, sshConfigImportResult } from '../test-utils/server-fixtures';

describe('frontend backend transport adapter', () => {
  beforeEach(() => {
    clearGpuWatcherBridge();
  });

  it('calls every exported command-backed function through Electron action-specific bridge methods', async () => {
    const bridge = {
      initializeApp: vi.fn().mockResolvedValue(okBridgeResponse([overviewRow])),
      listOverview: vi.fn().mockResolvedValue(okBridgeResponse([overviewRow])),
      listServers: vi.fn().mockResolvedValue(okBridgeResponse([savedServer])),
      listSshConfigHosts: vi.fn().mockResolvedValue(okBridgeResponse(sshConfigImportResult)),
      saveServer: vi.fn().mockResolvedValue(okBridgeResponse(savedServer)),
      deleteServer: vi.fn().mockResolvedValue(okBridgeResponse(undefined)),
      setServerEnabled: vi.fn().mockResolvedValue(okBridgeResponse(savedServer)),
      seedDemoData: vi.fn().mockResolvedValue(okBridgeResponse([overviewRow])),
      getServerDetail: vi.fn().mockResolvedValue(okBridgeResponse(serverDetail)),
      listGpuHistory: vi.fn().mockResolvedValue(okBridgeResponse(gpuHistory)),
      listProcesses: vi.fn().mockResolvedValue(okBridgeResponse([processRow])),
      testConnection: vi.fn().mockResolvedValue(okBridgeResponse(connectionResult)),
      refreshServer: vi.fn().mockResolvedValue(okBridgeResponse(connectionResult))
    } satisfies NonNullable<Window['gpuwatcher']>;
    setGpuWatcherBridge(bridge);

    await expect(initializeApp()).resolves.toEqual([overviewRow]);
    await expect(listOverview()).resolves.toEqual([overviewRow]);
    await expect(listServers()).resolves.toEqual([savedServer]);
    await expect(listSshConfigHosts()).resolves.toEqual(sshConfigImportResult);
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
    expect(bridge.listSshConfigHosts).toHaveBeenCalledWith({});
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
    setGpuWatcherBridge({
      setServerEnabled: vi.fn().mockResolvedValue({
        ok: false,
        error: { layer: 'storage_app', type: 'server_missing', message: 'Server was removed.' }
      })
    });

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
    await expect(listSshConfigHosts()).resolves.toEqual({
      candidates: [],
      warnings: ['GPUWatcher backend is unavailable. Launch the desktop app to use this action.']
    });
    await expect(getServerDetail('server-1')).resolves.toBeNull();
    await expect(listGpuHistory('server-1', null, null, '1h')).resolves.toMatchObject({
      serverId: 'server-1',
      range: '1h',
      series: []
    });
    await expect(listProcesses()).resolves.toEqual([]);

    const listOverviewBridge = vi.fn().mockResolvedValue(okBridgeResponse([overviewRow]));
    setGpuWatcherBridge({ listOverview: listOverviewBridge });
    await expect(listServers()).resolves.toEqual([]);
    expect(listOverviewBridge).not.toHaveBeenCalled();
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

  it('keeps SSH import pathless and bulk save orchestration on action-specific saveServer calls', async () => {
    const listSshConfigHostsBridge = vi.fn().mockResolvedValue(okBridgeResponse(sshConfigImportResult));
    const saveServerBridge = vi.fn().mockResolvedValue(okBridgeResponse(savedServer));
    setGpuWatcherBridge({ listSshConfigHosts: listSshConfigHostsBridge, saveServer: saveServerBridge });

    await expect(listSshConfigHosts()).resolves.toEqual(sshConfigImportResult);
    await expect(Promise.all([saveServer(serverInput), saveServer({ ...serverInput, name: 'Second import' })])).resolves.toEqual([
      savedServer,
      savedServer
    ]);

    expect(listSshConfigHostsBridge).toHaveBeenCalledTimes(1);
    expect(listSshConfigHostsBridge).toHaveBeenCalledWith({});
    expect(saveServerBridge).toHaveBeenCalledTimes(2);
    expect(saveServerBridge.mock.calls.map(([payload]) => Object.keys(payload).sort())).toEqual([['input'], ['input']]);
    expect(saveServerBridge.mock.calls.map(([payload]) => payload.input)).toEqual([serverInput, { ...serverInput, name: 'Second import' }]);
    expect('bulkSaveServers' in api).toBe(false);
  });

  it('rejects invalid history requests before calling the bridge', async () => {
    const listGpuHistoryBridge = vi.fn();
    setGpuWatcherBridge({ listGpuHistory: listGpuHistoryBridge });

    await expect(listGpuHistory(' ', null, null, '1h')).rejects.toThrow('serverId is required to list GPU history.');
    expect(listGpuHistoryBridge).not.toHaveBeenCalled();
  });
});
