import { act, cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.hoisted(() => {
  vi.resetModules();
  localStorage.setItem('gpuwatcher:last-server-id', 'beta');
});

import App, { getWindowRole } from './App';
import { rendererHelperContract } from '../electron/helperContract';
import type { AppearanceState } from '../electron/uiContract';
import { useAppearanceStore } from './lib/appearance';
import { LAST_SERVER_STORAGE_KEY, useUiStore } from './lib/store';
import { setGpuWatcherBridge, type GpuWatcherBridge } from './test-utils/bridge';
import { renderWithQueryClient } from './test-utils/query';
import { overviewRows } from './test-utils/server-fixtures';

vi.mock('./features/detail/ServerDetailScreen', () => ({
  ServerDetailScreen: ({ selectedServerId }: { selectedServerId: string | null }) => (
    <section aria-label="Selected server detail">{selectedServerId ?? 'No authoritative selection'}</section>
  )
}));
vi.mock('./features/settings/SettingsScreen', () => ({
  SettingsScreen: () => <section aria-label="Server management screen">Server connection management</section>
}));

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

const restoredSelection = useUiStore.getInitialState().selectedServerId;
const originalUrl = window.location.href;
const originalTitle = document.title;
let clients: ReturnType<typeof renderWithQueryClient>['queryClient'][] = [];
let helperMethods: Record<string, ReturnType<typeof vi.fn>>;
let unsubscribe: () => void;
let appearanceListener: ((state: AppearanceState) => void) | undefined;

function mountApp() {
  const view = renderWithQueryClient(<App />);
  clients.push(view.queryClient);
  return view;
}

describe('App window roles', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    window.history.replaceState(null, '', '/');
    useUiStore.setState({ ...useUiStore.getInitialState(), selectedServerId: restoredSelection }, true);
    localStorage.setItem(LAST_SERVER_STORAGE_KEY, restoredSelection!);
    useAppearanceStore.setState(useAppearanceStore.getInitialState(), true);
    delete document.documentElement.dataset.appearance;
    appearanceListener = undefined;
    unsubscribe = vi.fn();
    helperMethods = Object.fromEntries(rendererHelperContract.map(({ electronPreloadMethod }) => [
      electronPreloadMethod, vi.fn().mockRejectedValue(new Error(`Unexpected helper call: ${electronPreloadMethod}`))
    ]));
    // Main-only helpers are tripwires, never production renderer API additions.
    helperMethods.pollDueServers = vi.fn();
    helperMethods.consumeNotificationEvents = vi.fn();
    helperMethods.initializeApp.mockResolvedValue({ ok: true, data: overviewRows });
    helperMethods.listOverview.mockResolvedValue({ ok: true, data: overviewRows });
    setGpuWatcherBridge(helperMethods as GpuWatcherBridge);
    window.gpuwatcherUi = {
      getAppearance: vi.fn().mockResolvedValue({ ok: true, data: { mode: 'dark', resolved: 'dark' } }),
      setAppearance: vi.fn().mockResolvedValue({ ok: true, data: { mode: 'light', resolved: 'light' } }),
      openSettings: vi.fn(),
      onAppearanceChanged: vi.fn((listener) => { appearanceListener = listener; return unsubscribe; })
    };
  });

  afterEach(() => {
    cleanup();
    clients.forEach((client) => client.clear());
    clients = [];
    localStorage.clear();
    window.history.replaceState(null, '', originalUrl);
    document.title = originalTitle;
    delete window.gpuwatcher;
    delete window.gpuwatcherUi;
    delete document.documentElement.dataset.appearance;
    useUiStore.setState(useUiStore.getInitialState(), true);
    useAppearanceStore.setState(useAppearanceStore.getInitialState(), true);
  });

  it.each([
    ['?window=settings', 'settings'],
    ['?other=1&window=settings', 'settings'],
    ['', 'main'],
    ['?window=main', 'main'],
    ['?window=Settings', 'main'],
    ['?window=unknown', 'main']
  ])('routes %s to %s', (search, role) => {
    expect(getWindowRole(search)).toBe(role);
  });

  it('mounts appearance only, subscribes and unsubscribes without any helper or query work', async () => {
    window.history.replaceState(null, '', '/?window=settings');
    const view = mountApp();
    expect(screen.getByRole('heading', { name: '외형' })).toBeDefined();
    expect(screen.getByText('GPUWatcher 설정')).toBeDefined();
    expect(document.title).toBe('GPUWatcher 설정');
    expect(screen.queryByRole('navigation', { name: '서버' })).toBeNull();
    expect(screen.queryByRole('region', { name: 'Selected server detail' })).toBeNull();
    expect(screen.queryByRole('region', { name: 'Server management screen' })).toBeNull();
    await waitFor(() => expect(document.documentElement.dataset.appearance).toBe('dark'));
    expect(window.gpuwatcherUi!.getAppearance).toHaveBeenCalledOnce();
    expect(window.gpuwatcherUi!.onAppearanceChanged).toHaveBeenCalledOnce();
    act(() => appearanceListener!({ mode: 'light', resolved: 'light' }));
    expect(document.documentElement.dataset.appearance).toBe('light');
    expect((screen.getByRole('radio', { name: '라이트' }) as HTMLInputElement).checked).toBe(true);
    expect(view.queryClient.getQueryCache().getAll()).toEqual([]);
    expect(view.queryClient.getMutationCache().getAll()).toEqual([]);
    view.unmount();
    expect(unsubscribe).toHaveBeenCalledOnce();
    act(() => appearanceListener!({ mode: 'dark', resolved: 'dark' }));
    expect(document.documentElement.dataset.appearance).toBe('light');
    for (const method of Object.values(helperMethods)) expect(method).not.toHaveBeenCalled();
  });

  it('restores persisted selection only after authoritative overview succeeds', async () => {
    expect(restoredSelection).toBe('beta');
    const overview = deferred<{ ok: true; data: typeof overviewRows }>();
    helperMethods.initializeApp.mockResolvedValue({ ok: true, data: [overviewRows[0]] });
    helperMethods.listOverview.mockReturnValue(overview.promise);
    mountApp();
    expect(document.title).toBe('GPUWatcher');
    await waitFor(() => expect(helperMethods.listOverview).toHaveBeenCalledOnce());
    expect(screen.getByText('Loading servers...')).toBeDefined();
    expect(screen.queryByRole('region', { name: 'Selected server detail' })).toBeNull();
    expect(useUiStore.getState().selectedServerId).toBe('beta');
    await act(async () => { overview.resolve({ ok: true, data: overviewRows }); });
    await waitFor(() => expect(screen.getByRole('region', { name: 'Selected server detail' }).textContent).toBe('beta'));
    expect(localStorage.getItem(LAST_SERVER_STORAGE_KEY)).toBe('beta');
    expect(helperMethods.initializeApp).toHaveBeenCalledOnce();
  });

  it.each([
    ['missing', overviewRows, 'alpha'],
    ['beta', [], null]
  ] as const)('reconciles saved %s against the successful registry', async (saved, rows, expected) => {
    useUiStore.getState().selectServer(saved);
    helperMethods.listOverview.mockResolvedValue({ ok: true, data: rows });
    mountApp();
    await waitFor(() => expect(screen.getByRole('region', { name: 'Selected server detail' }).textContent)
      .toBe(expected ?? 'No authoritative selection'));
    expect(useUiStore.getState().selectedServerId).toBe(expected);
    expect(localStorage.getItem(LAST_SERVER_STORAGE_KEY)).toBe(expected);
  });

  it('keeps initialization pending rather than rendering demo or successful detail', () => {
    helperMethods.initializeApp.mockReturnValue(new Promise(() => {}));
    mountApp();
    expect(screen.getByText('Loading servers...')).toBeDefined();
    expect(screen.queryByRole('region', { name: 'Selected server detail' })).toBeNull();
    expect(screen.getByText('서버 목록을 확인할 수 없습니다')).toBeDefined();
    expect(helperMethods.listOverview).not.toHaveBeenCalled();
    expect(helperMethods.seedDemoData).not.toHaveBeenCalled();
  });

  it('surfaces initialization failure without successful detail or demo work', async () => {
    helperMethods.initializeApp.mockRejectedValue(new Error('Initialization unavailable'));
    mountApp();
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('Initialization unavailable'));
    expect(screen.queryByText('Loading servers...')).toBeNull();
    expect(screen.queryByRole('region', { name: 'Selected server detail' })).toBeNull();
    expect(helperMethods.listOverview).not.toHaveBeenCalled();
    expect(helperMethods.seedDemoData).not.toHaveBeenCalled();
    expect(useUiStore.getState().selectedServerId).toBe('beta');
  });

  it('does not treat initialization rows as an authoritative selection on overview error', async () => {
    helperMethods.listOverview.mockRejectedValue(new Error('Overview unavailable'));
    mountApp();
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('Overview unavailable'));
    expect(screen.queryByRole('region', { name: 'Selected server detail' })).toBeNull();
    expect(useUiStore.getState().selectedServerId).toBe('beta');
    expect(helperMethods.seedDemoData).not.toHaveBeenCalled();
  });

  it('retains verified cached detail when a background overview refetch fails', async () => {
    const view = mountApp();
    await waitFor(() => expect(screen.getByRole('region', { name: 'Selected server detail' }).textContent).toBe('beta'));
    helperMethods.listOverview.mockRejectedValueOnce(new Error('Background overview unavailable'));
    await act(async () => {
      await view.queryClient.refetchQueries({ queryKey: ['overview'], exact: true });
    });
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('Background overview unavailable'));
    expect(screen.getByRole('region', { name: 'Selected server detail' }).textContent).toBe('beta');
    expect(useUiStore.getState().selectedServerId).toBe('beta');
    expect(localStorage.getItem(LAST_SERVER_STORAGE_KEY)).toBe('beta');
    expect(helperMethods.seedDemoData).not.toHaveBeenCalled();
  });

  it('keeps server management reachable and returns to detail through actual shell navigation', async () => {
    mountApp();
    await screen.findByRole('region', { name: 'Selected server detail' });
    fireEvent.click(document.querySelector('[data-server-add-trigger]') as HTMLElement);
    fireEvent.click(screen.getByRole('menuitem', { name: '직접 추가' }));
    expect(screen.getByRole('region', { name: 'Server management screen' })).toBeDefined();
    expect(screen.queryByRole('heading', { name: '외형' })).toBeNull();
    expect(screen.getByRole('region', { name: 'Selected server detail' }).textContent).toBe('beta');
    act(() => useUiStore.getState().closeServerManager());
    fireEvent.click(screen.getByRole('button', { name: 'Alpha Node online' }));
    expect(screen.getByRole('region', { name: 'Selected server detail' }).textContent).toBe('alpha');
    expect(useUiStore.getState().managementOpen).toBe(false);
    expect(localStorage.getItem(LAST_SERVER_STORAGE_KEY)).toBe('alpha');
  });
});
