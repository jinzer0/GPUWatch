import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { listServers, queryKeys, setServerEnabled } from '../lib/api';
import { useUiStore } from '../lib/store';
import type { Server, ServerOverviewDto } from '../lib/types';
import { Shell } from './Shell';

vi.mock('../lib/api', async (importOriginal) => ({
  ...await importOriginal<typeof import('../lib/api')>(),
  listServers: vi.fn(),
  setServerEnabled: vi.fn()
}));

const server = (id: string, status: string): ServerOverviewDto => ({
  id, name: `Server ${id}`, host: `${id}.example.test`, status,
  gpuTotal: 2, busyGpuCount: 1, freeGpuCount: 1,
  averageGpuUtilizationPercent: 62, averageMemoryUsagePercent: 25, maxTemperatureCelsius: 61,
  lastSuccessAt: null, lastErrorType: null, lastErrorMessage: null
});
const savedServer = (id: string, enabled: boolean): Server => ({
  id, name: `Server ${id}`, host: `${id}.example.test`, port: 22, username: 'tester',
  sshKeyPath: null, pollingIntervalSeconds: 10, enabled, configRevision: 1,
  createdAt: '', updatedAt: ''
});
const renderShell = (overview: ServerOverviewDto[] | null = [server('one', 'disabled'), server('two', 'stale')]) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const view = render(<QueryClientProvider client={client}>
    <Shell overview={overview}><section aria-label="Telemetry">Existing GPU detail</section></Shell>
  </QueryClientProvider>);
  return { ...view, client };
};
const openRowMenu = async (id = 'two') => {
  const trigger = screen.getByRole('button', { name: `Server ${id} 서버 메뉴` });
  fireEvent.click(trigger);
  await waitFor(() => expect((screen.getByRole('menuitem', { name: '서버 편집' }) as HTMLButtonElement).disabled).toBe(false));
  return trigger;
};

describe('server-centered Shell', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(listServers).mockResolvedValue([savedServer('one', true), savedServer('two', false)]);
    window.localStorage.clear();
    delete window.gpuwatcher;
    delete window.gpuwatcherUi;
    delete window.gpuWatcherElectron;
    useUiStore.setState(useUiStore.getInitialState(), true);
  });

  it('selects actual server IDs and keeps detail visible without a broad management entry', () => {
    renderShell();
    expect(screen.queryByRole('button', { name: '서버 관리' })).toBeNull();
    fireEvent.click(within(screen.getByRole('navigation', { name: '서버' })).getByRole('button', { name: 'Server two stale' }));
    expect(useUiStore.getState().selectedServerId).toBe('two');
    expect(screen.getByRole('button', { name: 'Server two stale' }).getAttribute('aria-current')).toBe('page');
    expect(screen.queryByRole('button', { name: 'History' })).toBeNull();
    expect(screen.getByRole('main', { name: 'Server detail content' })).toBeDefined();
    expect(screen.getByText('Existing GPU detail')).toBeDefined();
    expect(listServers).not.toHaveBeenCalled();
  });

  it.each([['직접 추가', 'add'], ['SSH config 가져오기', 'import']] as const)('opens %s from the + menu', (label, action) => {
    renderShell();
    const trigger = screen.getByRole('button', { name: '서버 추가 또는 가져오기' });
    expect(trigger.hasAttribute('data-server-add-trigger')).toBe(true);
    fireEvent.click(trigger);
    expect(document.activeElement).toBe(screen.getByRole('menuitem', { name: '직접 추가' }));
    fireEvent.click(screen.getByRole('menuitem', { name: label }));
    expect(useUiStore.getState()).toMatchObject({ managementOpen: true, managementAction: action, editingServerId: null });
    expect(screen.queryByRole('menu')).toBeNull();
    expect(document.activeElement).toBe(trigger);
    expect(screen.getByRole('main', { name: 'Server detail content' })).toBeDefined();
  });

  it.each([['서버 편집', 'edit'], ['서버 삭제', 'delete'], ['연결 테스트', 'test']] as const)('binds %s to its row rather than selection', async (label, action) => {
    useUiStore.getState().selectServer('one');
    renderShell();
    const trigger = await openRowMenu();
    expect(trigger.getAttribute('data-server-menu-trigger')).toBe('two');
    fireEvent.click(screen.getByRole('menuitem', { name: label }));
    expect(useUiStore.getState()).toMatchObject({ selectedServerId: 'one', editingServerId: 'two', managementAction: action, managementOpen: true });
    expect(document.activeElement).toBe(trigger);
    expect(screen.getByRole('button', { name: 'Server one disabled' }).getAttribute('aria-current')).toBe('page');
  });

  it('supports menu arrows, Home/End, Escape and outside dismissal with focus return', async () => {
    renderShell();
    const trigger = await openRowMenu();
    const menu = screen.getByRole('menu');
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('menuitem', { name: '서버 편집' })));
    fireEvent.keyDown(menu, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(screen.getByRole('menuitem', { name: '서버 삭제' }));
    fireEvent.keyDown(menu, { key: 'End' });
    expect(document.activeElement).toBe(screen.getByRole('menuitem', { name: '모니터링 시작' }));
    fireEvent.keyDown(menu, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(screen.getByRole('menuitem', { name: '서버 편집' }));
    fireEvent.keyDown(menu, { key: 'ArrowUp' });
    expect(document.activeElement).toBe(screen.getByRole('menuitem', { name: '모니터링 시작' }));
    fireEvent.keyDown(menu, { key: 'Home' });
    expect(document.activeElement).toBe(screen.getByRole('menuitem', { name: '서버 편집' }));
    fireEvent.keyDown(menu, { key: 'Escape' });
    expect(screen.queryByRole('menu')).toBeNull();
    expect(document.activeElement).toBe(trigger);
    fireEvent.click(trigger);
    fireEvent.pointerDown(screen.getByText('Existing GPU detail'));
    expect(screen.queryByRole('menu')).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it('uses saved enabled state and retains it after a failed target-bound toggle', async () => {
    useUiStore.getState().selectServer('two');
    let reject!: (error: Error) => void;
    vi.mocked(setServerEnabled).mockImplementation(() => new Promise((_, fail) => { reject = fail; }));
    renderShell();
    await openRowMenu('one');
    fireEvent.click(screen.getByRole('menuitem', { name: '모니터링 중지' }));
    expect(setServerEnabled).toHaveBeenCalledWith('one', false);
    expect((screen.getByRole('menuitem', { name: '모니터링 중지' }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByRole('status').textContent).toContain('Server one: 모니터링 변경 중');
    expect(useUiStore.getState().managementOpen).toBe(false);
    reject(new Error('Permission denied'));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('Server one: Permission denied'));
    expect((screen.getByRole('menuitem', { name: '모니터링 중지' }) as HTMLButtonElement).disabled).toBe(false);
    fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' });
    expect(screen.getByRole('alert').textContent).toContain('Permission denied');
  });

  it('uses the same keyboard and dismissal contract for the + menu', () => {
    renderShell();
    const trigger = screen.getByRole('button', { name: '서버 추가 또는 가져오기' });
    fireEvent.keyDown(trigger, { key: 'ArrowDown' });
    const menu = screen.getByRole('menu');
    expect(document.activeElement).toBe(screen.getByRole('menuitem', { name: '직접 추가' }));
    fireEvent.keyDown(menu, { key: 'ArrowUp' });
    expect(document.activeElement).toBe(screen.getByRole('menuitem', { name: 'SSH config 가져오기' }));
    fireEvent.keyDown(menu, { key: 'Home' });
    expect(document.activeElement).toBe(screen.getByRole('menuitem', { name: '직접 추가' }));
    fireEvent.keyDown(menu, { key: 'End' });
    expect(document.activeElement).toBe(screen.getByRole('menuitem', { name: 'SSH config 가져오기' }));
    fireEvent.keyDown(menu, { key: 'Escape' });
    expect(screen.queryByRole('menu')).toBeNull();
    expect(document.activeElement).toBe(trigger);
    expect(useUiStore.getState().managementOpen).toBe(false);
  });

  it('invalidates saved servers and overview after a successful toggle without opening a sheet', async () => {
    vi.mocked(setServerEnabled).mockResolvedValue(savedServer('two', true));
    const { client } = renderShell();
    const invalidate = vi.spyOn(client, 'invalidateQueries');
    await openRowMenu();
    vi.mocked(listServers).mockResolvedValue([savedServer('one', true), savedServer('two', true)]);
    fireEvent.click(screen.getByRole('menuitem', { name: '모니터링 시작' }));
    await waitFor(() => expect(screen.getByRole('menuitem', { name: '모니터링 중지' })).toBeDefined());
    expect(setServerEnabled).toHaveBeenCalledWith('two', true);
    expect(invalidate).toHaveBeenCalledWith({ queryKey: queryKeys.servers });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: queryKeys.overview });
    expect(useUiStore.getState().managementOpen).toBe(false);
  });

  it('disables missing and loading targets with named diagnostics', async () => {
    let resolve!: (servers: Server[]) => void;
    vi.mocked(listServers).mockImplementation(() => new Promise((done) => { resolve = done; }));
    renderShell();
    fireEvent.click(screen.getByRole('button', { name: 'Server two 서버 메뉴' }));
    expect(screen.getByRole('status').textContent).toContain('Server two: 저장된 서버를 확인 중');
    expect((screen.getByRole('menuitem', { name: '모니터링 변경' }) as HTMLButtonElement).disabled).toBe(true);
    resolve([]);
    await waitFor(() => expect(screen.getByRole('status').textContent).toContain('Server two: 저장된 서버를 찾을 수 없습니다'));
    fireEvent.click(screen.getByRole('menuitem', { name: '서버 삭제' }));
    expect(useUiStore.getState().managementOpen).toBe(false);
    expect(setServerEnabled).not.toHaveBeenCalled();
  });

  it('distinguishes unavailable server data from an empty registry', () => {
    const view = renderShell(null);
    expect(screen.getByText('서버 목록을 확인할 수 없습니다')).toBeDefined();
    expect(screen.queryByText('등록된 서버가 없습니다')).toBeNull();
    view.unmount();
    renderShell([]);
    expect(screen.getByText('등록된 서버가 없습니다')).toBeDefined();
    expect(screen.getByText('GPUWatcher', { selector: '.titlebar-page-title' })).toBeDefined();
    expect(screen.getByText('브라우저 · 읽기 전용')).toBeDefined();
  });

  it('reports named query failure and blocks menu mutations', async () => {
    vi.mocked(listServers).mockRejectedValue(new Error('Registry unavailable'));
    renderShell();
    fireEvent.click(screen.getByRole('button', { name: 'Server two 서버 메뉴' }));
    await waitFor(() => expect(screen.getByRole('status').textContent).toContain('Server two: 서버 조회 실패 — Registry unavailable'));
    expect((screen.getByRole('menuitem', { name: '서버 편집' }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole('menuitem', { name: '모니터링 변경' }) as HTMLButtonElement).disabled).toBe(true);
    expect(setServerEnabled).not.toHaveBeenCalled();
  });

  it('opens settings through the dedicated local UI method, not a helper action', async () => {
    const openSettings = vi.fn().mockResolvedValue({ ok: true, data: undefined });
    window.gpuwatcherUi = {
      openSettings,
      getAppearance: vi.fn(), setAppearance: vi.fn(), onAppearanceChanged: vi.fn()
    };
    renderShell();
    fireEvent.click(screen.getByRole('button', { name: '외형 설정 열기' }));
    await waitFor(() => expect(openSettings).toHaveBeenCalledOnce());
    expect(window.gpuwatcher).toBeUndefined();
  });

  it('reports settings window failure instead of pretending a browser window opened', async () => {
    renderShell();
    fireEvent.click(screen.getByRole('button', { name: '외형 설정 열기' }));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toMatch(/backend|desktop|unavailable/i));
  });
});
