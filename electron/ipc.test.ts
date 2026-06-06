import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({
  contextBridge: {
    exposeInMainWorld: vi.fn()
  },
  ipcMain: {
    handle: vi.fn()
  },
  ipcRenderer: {
    invoke: vi.fn()
  }
}));

import { helperContract } from './helperContract.js';
import type { HelperRunner } from './helperRunner.js';
import type { ElectronScheduler } from './scheduler.js';
import { channelForPreloadMethod, helperIpcChannels, registerIpcHandlers, validateHelperPayload } from './ipc.js';
import { createGpuwatcherBridge } from './preload.js';
import { ipcMain } from 'electron';

const expectedMethods = [
  'initializeApp',
  'listOverview',
  'listServers',
  'saveServer',
  'deleteServer',
  'setServerEnabled',
  'seedDemoData',
  'getServerDetail',
  'listGpuHistory',
  'listProcesses',
  'testConnection',
  'refreshServer',
  'helperHealth'
];

describe('Electron IPC bridge contract', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('registers one action-specific channel for every helper contract entry', () => {
    expect(helperIpcChannels.map((entry) => entry.method)).toEqual(expectedMethods);
    expect(helperIpcChannels).toHaveLength(helperContract.length);
    expect(helperIpcChannels.every((entry) => entry.channel === channelForPreloadMethod(entry.method))).toBe(true);
  });

  it('creates action-specific preload methods without a generic invoke method', async () => {
    const invoke = vi.fn(async () => ({ ok: false, error: { layer: 'helper_contract', type: 'helper_runner_deferred', message: 'deferred' } }));
    const bridge = createGpuwatcherBridge(invoke);

    expect(Object.keys(bridge)).toEqual(expectedMethods);
    expect('invoke' in bridge).toBe(false);

    await bridge.refreshServer({ id: 'server-1' });
    expect(invoke).toHaveBeenCalledWith('gpuwatcher:helper:refreshServer', { id: 'server-1' });
  });

  it('rejects malformed payloads with structured helper contract errors', () => {
    expect(validateHelperPayload('refresh_server', null)).toEqual({
      ok: false,
      error: {
        layer: 'helper_contract',
        type: 'invalid_payload',
        message: 'Payload for refresh_server must be an object.'
      }
    });

    expect(validateHelperPayload('set_server_enabled', { id: 'server-1', enabled: 'yes' })).toEqual({
      ok: false,
      error: {
        layer: 'helper_contract',
        type: 'invalid_payload',
        message: 'Payload for set_server_enabled must include a boolean enabled value.'
      }
    });
  });

  it('registers IPC handlers that validate payloads before running the scheduler', async () => {
    const run = vi.fn(async () => ({ ok: true, data: { id: 'server-1' } }));
    const runner = { run: vi.fn() } as unknown as HelperRunner;
    const scheduler = { start: vi.fn(), stop: vi.fn(), isRunning: true, run } as unknown as ElectronScheduler;

    registerIpcHandlers(runner, scheduler);

    const handleMock = vi.mocked(ipcMain.handle);
    const saveRegistration = handleMock.mock.calls.find(([channel]) => channel === channelForPreloadMethod('saveServer'));
    expect(saveRegistration).toBeDefined();
    const handler = saveRegistration?.[1] as (_event: unknown, payload: unknown) => Promise<unknown>;
    const input = { id: null, name: 'GPU', host: 'gpu.local', port: 22, username: 'alice', pollingIntervalSeconds: 30, enabled: true };

    await expect(handler({}, { input })).resolves.toEqual({ ok: true, data: { id: 'server-1' } });
    expect(run).toHaveBeenCalledWith(runner, { action: 'save_server', payload: { input } });

    const refreshRegistration = handleMock.mock.calls.find(([channel]) => channel === channelForPreloadMethod('refreshServer'));
    const refreshHandler = refreshRegistration?.[1] as (_event: unknown, payload: unknown) => Promise<unknown>;
    await expect(refreshHandler({}, { id: '' })).resolves.toEqual({
      ok: false,
      error: {
        layer: 'helper_contract',
        type: 'invalid_payload',
        message: 'Payload for refresh_server must include a non-empty string id.'
      }
    });
    expect(run).toHaveBeenCalledTimes(1);
  });
});
