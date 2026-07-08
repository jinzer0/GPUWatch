import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import * as frontendApi from '../src/lib/api';

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

import { helperContract, mainOnlyHelperContract, rendererHelperContract } from './helperContract.js';
import type { HelperRunner } from './helperRunner.js';
import type { ElectronScheduler } from './scheduler.js';
import { channelForPreloadMethod, helperIpcChannels, registerIpcHandlers, validateHelperPayload } from './ipc.js';
import { createGpuwatcherBridge } from './preload.js';
import { contextBridge, ipcMain } from 'electron';

const exposedGlobalsAtImport = vi.mocked(contextBridge.exposeInMainWorld).mock.calls.map(([name, value]) => [name, value] as const);

const expectedMethods = [
  'initializeApp',
  'listOverview',
  'listServers',
  'listSshConfigHosts',
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

function rustVariantForAction(action: string): string {
  return action.split('_').map((part) => part[0].toUpperCase() + part.slice(1)).join('');
}

function rustEnumValueToContractValue(value: string): string {
  const kebab = value.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
  if (kebab === 'local10s') {
    return 'local-10s';
  }
  if (kebab === 'ssh60s') {
    return 'ssh-60s';
  }
  return kebab;
}

function extractRustContractEntries(source: string) {
  return Array.from(source.matchAll(/HelperContractEntry \{([\s\S]*?)\n\s+\}/g)).map((match) => {
    const body = match[1];
    const optionalString = (field: string) => {
      const some = body.match(new RegExp(`${field}: Some\\("([^\"]+)"\\)`));
      if (some) {
        return some[1];
      }
      return body.match(new RegExp(`${field}: None`)) ? null : undefined;
    };
    const enumField = (field: string, enumName: string) => {
      const value = body.match(new RegExp(`${field}: ${enumName}::(\\w+)`))?.[1];
      return value ? rustEnumValueToContractValue(value) : undefined;
    };

    return {
      frontendApi: optionalString('frontend_api'),
      helperAction: enumField('helper_action', 'HelperAction')?.replace(/-/g, '_'),
      visibility: enumField('visibility', 'ActionVisibility'),
      electronPreloadMethod: optionalString('electron_preload_method'),
      timeoutClass: enumField('timeout_class', 'TimeoutClass'),
      dbMutation: enumField('db_mutation', 'DbMutation'),
      pollingOverlapKey: enumField('polling_overlap_key', 'PollingOverlapKey')
    };
  });
}

describe('Electron IPC bridge contract', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('registers one action-specific channel for every helper contract entry', () => {
    expect(helperIpcChannels.map((entry) => entry.method)).toEqual(expectedMethods);
    expect(helperIpcChannels).toHaveLength(rendererHelperContract.length);
    expect(helperIpcChannels.every((entry) => entry.channel === channelForPreloadMethod(entry.method))).toBe(true);
  });

  it('creates action-specific preload methods without a generic invoke method', async () => {
    const invoke = vi.fn(async () => ({ ok: false, error: { layer: 'helper_contract', type: 'helper_runner_deferred', message: 'deferred' } }));
    const bridge = createGpuwatcherBridge(invoke);

    expect(Object.keys(bridge)).toEqual(expectedMethods);
    expect('invoke' in bridge).toBe(false);
    expect('runAction' in bridge).toBe(false);
    expect('dispatch' in bridge).toBe(false);
    expect('helperPath' in bridge).toBe(false);
    expect('pollDueServers' in bridge).toBe(false);

    await bridge.refreshServer({ id: 'server-1' });
    expect(invoke).toHaveBeenCalledWith('gpuwatcher:helper:refreshServer', { id: 'server-1' });
  });

  it('exposes neutral Electron metadata without migration status or deferred task labels', () => {
    const metadataExposure = exposedGlobalsAtImport.find(([name]) => name === 'gpuWatcherElectron');
    const metadata = metadataExposure?.[1];
    const preloadSource = readFileSync(resolve(process.cwd(), 'electron/preload.ts'), 'utf8');
    const runtimePreloadSource = readFileSync(resolve(process.cwd(), 'electron/preload-runtime.cts'), 'utf8');
    const forbiddenMigrationMethod = ['migration', 'Status'].join('');
    const forbiddenDeferredLabel = ['deferred', 'to', 'task'].join('-');

    expect(metadataExposure).toBeDefined();
    expect(metadata).toMatchObject({ isElectron: true, platform: process.platform });
    expect(Object.keys(metadata ?? {})).toEqual(['isElectron', 'platform', 'versions']);
    expect(forbiddenMigrationMethod in (metadata ?? {})).toBe(false);
    expect(`${preloadSource}\n${runtimePreloadSource}`).not.toContain(forbiddenMigrationMethod);
    expect(`${preloadSource}\n${runtimePreloadSource}`).not.toContain(forbiddenDeferredLabel);
  });

  it('keeps poll_due_servers main-only and out of renderer IPC/preload', () => {
    expect(mainOnlyHelperContract.map((entry) => entry.helperAction)).toEqual(['poll_due_servers']);
    expect(mainOnlyHelperContract[0].electronPreloadMethod).toBeNull();
    expect(helperIpcChannels.map((entry) => entry.action)).not.toContain('poll_due_servers');
    expect(helperIpcChannels.map((entry) => entry.channel)).not.toContain('gpuwatcher:helper:pollDueServers');

    const bridge = createGpuwatcherBridge(vi.fn());
    expect(Object.keys(bridge)).not.toContain('pollDueServers');
  });

  it('keeps TypeScript and Rust contract metadata aligned for actions and visibility', () => {
    const rustContract = readFileSync(resolve(process.cwd(), 'crates/gpuwatcher-helper/src/contract.rs'), 'utf8');
    const rustActions = Array.from(rustContract.matchAll(/helper_action: HelperAction::(\w+)/g)).map((match) => match[1]);
    const rustMainOnlyActions = Array.from(
      rustContract.matchAll(/helper_action: HelperAction::(\w+),\n\s+visibility: ActionVisibility::MainOnly/g)
    ).map((match) => match[1]);

    expect(helperContract.map((entry) => rustVariantForAction(entry.helperAction))).toEqual(rustActions);
    expect(mainOnlyHelperContract.map((entry) => rustVariantForAction(entry.helperAction))).toEqual(rustMainOnlyActions);
    expect(rendererHelperContract.every((entry) => typeof entry.electronPreloadMethod === 'string')).toBe(true);
    expect(mainOnlyHelperContract.every((entry) => entry.electronPreloadMethod === null)).toBe(true);
  });

  it('keeps the full action parity matrix aligned across frontend, Electron, and helper', () => {
    const rustContract = readFileSync(resolve(process.cwd(), 'crates/gpuwatcher-helper/src/contract.rs'), 'utf8');
    const rustEntries = extractRustContractEntries(rustContract);
    const frontendExports = Object.entries(frontendApi)
      .filter(([, value]) => typeof value === 'function')
      .map(([name]) => name)
      .sort();

    expect(helperContract).toHaveLength(15);
    expect(helperContract.map((entry) => entry.helperAction)).toEqual([
      'initialize_app',
      'list_overview',
      'list_servers',
      'list_ssh_config_hosts',
      'save_server',
      'delete_server',
      'set_server_enabled',
      'seed_demo_data',
      'get_server_detail',
      'list_gpu_history',
      'list_processes',
      'test_connection',
      'refresh_server',
      'poll_due_servers',
      'health'
    ]);
    expect(rustEntries).toEqual(
      helperContract.map((entry) => ({
        frontendApi: entry.frontendApi,
        helperAction: entry.helperAction,
        visibility: entry.visibility,
        electronPreloadMethod: entry.electronPreloadMethod,
        timeoutClass: entry.timeoutClass,
        dbMutation: entry.dbMutation,
        pollingOverlapKey: entry.pollingOverlapKey
      }))
    );
    expect(frontendExports).toEqual(
      rendererHelperContract
        .flatMap((entry) => (entry.frontendApi ? [entry.frontendApi] : []))
        .sort()
    );
    expect(expectedMethods).toEqual(rendererHelperContract.map((entry) => entry.electronPreloadMethod));
    expect(helperIpcChannels.map((entry) => entry.action)).toEqual(rendererHelperContract.map((entry) => entry.helperAction));
    expect(mainOnlyHelperContract).toEqual([expect.objectContaining({ helperAction: 'poll_due_servers', visibility: 'main-only' })]);
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

    expect(validateHelperPayload('list_ssh_config_hosts', { path: '/tmp/config' })).toEqual({
      ok: false,
      error: {
        layer: 'helper_contract',
        type: 'invalid_payload',
        message: 'Payload for list_ssh_config_hosts must be empty.'
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
