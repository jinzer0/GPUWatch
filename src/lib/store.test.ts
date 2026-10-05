import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { detailFixture } from '../test-utils/detail-fixtures';

const storageKey = 'gpuwatcher:last-server-id';
const loadStore = async () => (await import('./store')).useUiStore;

describe('UI store', () => {
  beforeEach(() => {
    vi.resetModules();
    localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('restores the last selection without reconciling before server data arrives', async () => {
    localStorage.setItem(storageKey, 'server-2');
    const { LAST_SERVER_STORAGE_KEY, useUiStore } = await import('./store');

    expect(LAST_SERVER_STORAGE_KEY).toBe(storageKey);
    expect(useUiStore.getState().selectedServerId).toBe('server-2');
    expect(localStorage.getItem(storageKey)).toBe('server-2');

    useUiStore.getState().reconcileServers(['server-1', 'server-2']);

    expect(useUiStore.getState().selectedServerId).toBe('server-2');
    expect(localStorage.getItem(storageKey)).toBe('server-2');
  });

  it('replaces a stale restored selection with the first authoritative server', async () => {
    localStorage.setItem(storageKey, 'deleted-server');
    const store = await loadStore();

    store.getState().reconcileServers(['server-2', 'server-1']);

    expect(store.getState().selectedServerId).toBe('server-2');
    expect(localStorage.getItem(storageKey)).toBe('server-2');
  });

  it('removes stale storage for an empty authoritative list and selects a newly added server', async () => {
    localStorage.setItem(storageKey, 'deleted-server');
    const store = await loadStore();

    store.getState().reconcileServers([]);

    expect(store.getState().selectedServerId).toBeNull();
    expect(localStorage.getItem(storageKey)).toBeNull();

    store.getState().reconcileServers(['new-server']);

    expect(store.getState().selectedServerId).toBe('new-server');
    expect(localStorage.getItem(storageKey)).toBe('new-server');
  });

  it('persists reselection, closes management, and replaces a deleted selected server', async () => {
    const store = await loadStore();
    store.getState().reconcileServers(['server-1', 'server-2']);
    store.getState().setManagementOpen(true);

    store.getState().selectServer('server-2');

    expect(store.getState().selectedServerId).toBe('server-2');
    expect(store.getState().managementOpen).toBe(false);
    expect(localStorage.getItem(storageKey)).toBe('server-2');

    store.getState().reconcileServers(['server-1']);

    expect(store.getState().selectedServerId).toBe('server-1');
    expect(localStorage.getItem(storageKey)).toBe('server-1');

    store.getState().selectServer(null);

    expect(store.getState().selectedServerId).toBeNull();
    expect(localStorage.getItem(storageKey)).toBeNull();
  });

  it('opens management to edit an existing server or add a new server without changing selection', async () => {
    const store = await loadStore();
    store.getState().selectServer('server-1');

    store.getState().editServer('server-2');

    expect(store.getState().editingServerId).toBe('server-2');
    expect(store.getState().managementOpen).toBe(true);
    expect(store.getState().selectedServerId).toBe('server-1');

    store.getState().setManagementOpen(false);
    expect(store.getState().managementOpen).toBe(false);
    store.getState().editServer(null);

    expect(store.getState().editingServerId).toBeNull();
    expect(store.getState().managementOpen).toBe(true);
    expect(localStorage.getItem(storageKey)).toBe('server-1');
  });

  it('keeps selection usable when localStorage is unavailable', async () => {
    vi.stubGlobal('localStorage', undefined);
    const store = await loadStore();

    expect(store.getState().selectedServerId).toBeNull();
    expect(() => store.getState().selectServer('server-2')).not.toThrow();
    expect(store.getState().selectedServerId).toBe('server-2');
    expect(() => store.getState().reconcileServers(['server-1'])).not.toThrow();
    expect(store.getState().selectedServerId).toBe('server-1');
    expect(() => store.getState().reconcileServers([])).not.toThrow();
    expect(store.getState().selectedServerId).toBeNull();
  });

  it('tolerates storage read, write, and removal failures without losing in-memory state', async () => {
    const fail = () => { throw new Error('Storage denied'); };
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(fail);
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(fail);
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(fail);
    const store = await loadStore();

    expect(store.getState().selectedServerId).toBeNull();
    store.getState().setManagementOpen(true);
    expect(() => store.getState().selectServer('server-2')).not.toThrow();
    expect(store.getState().selectedServerId).toBe('server-2');
    expect(store.getState().managementOpen).toBe(false);
    expect(() => store.getState().reconcileServers(['server-1'])).not.toThrow();
    expect(store.getState().selectedServerId).toBe('server-1');
    expect(() => store.getState().selectServer(null)).not.toThrow();
    expect(store.getState().selectedServerId).toBeNull();
  });

  it('persists only the selected ID, not live samples or density', async () => {
    const store = await loadStore();
    store.getState().selectServer('server-1');
    store.getState().setDensityMode('compact');
    store.getState().appendLiveSamplesFromDetail({ ...detailFixture, receivedAt: '2026-06-02T00:00:00Z' });
    store.getState().setGpuDisclosure('server-1', 'uuid:GPU-1', { expanded: true, metricsExpanded: true });

    expect(store.getState().liveSamples['server-1+0']).toHaveLength(1);
    expect(localStorage.length).toBe(1);
    expect(localStorage.getItem(storageKey)).toBe('server-1');

    vi.resetModules();
    const restored = await loadStore();

    expect(restored.getState().selectedServerId).toBe('server-1');
    expect(restored.getState().liveSamples).toEqual({});
    expect(restored.getState().gpuDisclosures).toEqual({});
    expect(restored.getState().densityMode).toBe('full');
    restored.getState().toggleDensityMode();
    expect(restored.getState().densityMode).toBe('compact');
    restored.getState().toggleDensityMode();
    expect(restored.getState().densityMode).toBe('full');
  });

  it('keeps GPU and nested disclosures independent across GPUs, parent closure, and server changes', async () => {
    const store = await loadStore();
    store.getState().setGpuDisclosure('server-1', 'uuid:GPU-1', { expanded: true, metricsExpanded: true });
    store.getState().setGpuDisclosure('server-1', 'uuid:GPU-2', { expanded: true });
    store.getState().setGpuDisclosure('server-2', 'uuid:GPU-1', { expanded: true });
    store.getState().setGpuDisclosure('server-1', 'uuid:GPU-1', { expanded: false });
    store.getState().selectServer('server-2');
    store.getState().selectServer('server-1');
    expect(store.getState().gpuDisclosures).toEqual({
      'server-1': {
        'uuid:GPU-1': { expanded: false, metricsExpanded: true },
        'uuid:GPU-2': { expanded: true, metricsExpanded: false }
      },
      'server-2': { 'uuid:GPU-1': { expanded: true, metricsExpanded: false } }
    });
  });

  it('prunes only removed servers from disclosure state after authoritative reconciliation', async () => {
    const store = await loadStore();
    store.getState().setGpuDisclosure('server-1', 'index:0', { expanded: true });
    store.getState().setGpuDisclosure('server-2', 'index:0', { metricsExpanded: true });
    store.getState().reconcileServers(['server-2']);
    expect(store.getState().gpuDisclosures).toEqual({
      'server-2': { 'index:0': { expanded: false, metricsExpanded: true } }
    });
  });
});
