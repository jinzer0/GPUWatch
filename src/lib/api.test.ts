import { beforeEach, describe, expect, it, vi } from 'vitest';

import { invoke } from '@tauri-apps/api/core';

import {
  getServerDetail,
  initializeApp,
  listGpuHistory,
  listOverview,
  listServers,
  saveServer,
  seedDemoData,
  setServerEnabled,
  testConnection
} from './api';
import type { Server, ServerInput, ServerOverviewDto } from './types';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn()
}));

const invokeMock = vi.mocked(invoke);

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

function setTauriRuntime(value: unknown = {}): void {
  Object.defineProperty(window, '__TAURI_INTERNALS__', {
    configurable: true,
    value
  });
}

describe('frontend backend transport adapter', () => {
  beforeEach(() => {
    invokeMock.mockReset();
    delete window.gpuwatcher;
    delete (window as Window & { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__;
  });

  it('uses Electron action-specific bridge methods before Tauri invoke', async () => {
    const listOverviewBridge = vi.fn().mockResolvedValue({ ok: true, data: [overviewRow] });
    window.gpuwatcher = { listOverview: listOverviewBridge };
    setTauriRuntime();
    invokeMock.mockResolvedValue([]);

    await expect(listOverview()).resolves.toEqual([overviewRow]);

    expect(listOverviewBridge).toHaveBeenCalledWith({});
    expect(invokeMock).not.toHaveBeenCalled();
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
    expect(invokeMock).not.toHaveBeenCalled();
  });

  it('falls back to Tauri invoke when Electron bridge methods are absent', async () => {
    setTauriRuntime();
    invokeMock.mockResolvedValue(savedServer);

    await expect(saveServer(serverInput)).resolves.toEqual(savedServer);

    expect(invokeMock).toHaveBeenCalledWith('save_server', { input: serverInput });
  });

  it('falls back to Tauri invoke when the Electron bridge lacks the requested method', async () => {
    window.gpuwatcher = { listOverview: vi.fn().mockResolvedValue({ ok: true, data: [overviewRow] }) };
    setTauriRuntime();
    invokeMock.mockResolvedValue([savedServer]);

    await expect(listServers()).resolves.toEqual([savedServer]);

    expect(window.gpuwatcher.listOverview).not.toHaveBeenCalled();
    expect(invokeMock).toHaveBeenCalledWith('list_servers');
  });

  it('does not use no-runtime fallbacks for Tauri runtime failures', async () => {
    setTauriRuntime();
    invokeMock.mockRejectedValue(new Error('tauri backend failed'));

    await expect(listOverview()).rejects.toThrow('tauri backend failed');
  });

  it('keeps no-runtime browser reads usable when Tauri invoke is unavailable', async () => {
    invokeMock.mockRejectedValue(new Error('window.__TAURI_INTERNALS__ is undefined'));

    await expect(initializeApp()).resolves.toEqual([]);
    await expect(getServerDetail('server-1')).resolves.toBeNull();
    await expect(listGpuHistory('server-1', null, null, '1h')).resolves.toMatchObject({
      serverId: 'server-1',
      range: '1h',
      series: []
    });

    expect(invokeMock).toHaveBeenCalledWith('initialize_app');
    expect(invokeMock).toHaveBeenCalledWith('get_server_detail', { id: 'server-1' });
  });

  it('returns explicit no-runtime results for backend-required browser actions', async () => {
    invokeMock.mockRejectedValue(new Error('window.__TAURI_INTERNALS__ is undefined'));

    await expect(testConnection('server-1')).resolves.toEqual({
      ok: false,
      status: 'error',
      errorType: 'backend_unavailable',
      message: 'GPUWatcher backend is unavailable. Launch the app in Electron or Tauri to use this action.'
    });
    await expect(seedDemoData()).rejects.toThrow('GPUWatcher backend is unavailable');
    await expect(saveServer(serverInput)).rejects.toThrow('GPUWatcher backend is unavailable');
  });
});
