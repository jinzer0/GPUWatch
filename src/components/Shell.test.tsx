import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useUiStore } from '../lib/store';
import type { ServerOverviewDto } from '../lib/types';
import { Shell } from './Shell';

const server = (id: string, status: string): ServerOverviewDto => ({
  id, name: `Server ${id}`, host: `${id}.example.test`, status,
  gpuTotal: 2, busyGpuCount: 1, freeGpuCount: 1,
  averageGpuUtilizationPercent: 62, averageMemoryUsagePercent: 25, maxTemperatureCelsius: 61,
  lastSuccessAt: null, lastErrorType: null, lastErrorMessage: null
});
const renderShell = (overview: ServerOverviewDto[] | null = [server('one', 'online'), server('two', 'stale')]) => render(
  <Shell overview={overview}><section aria-label="Telemetry">Existing GPU detail</section></Shell>
);

describe('server-centered Shell', () => {
  beforeEach(() => {
    window.localStorage.clear();
    delete window.gpuwatcher;
    delete window.gpuwatcherUi;
    delete window.gpuWatcherElectron;
    useUiStore.setState(useUiStore.getInitialState(), true);
  });

  it('selects actual server IDs and closes management without global tabs', () => {
    renderShell();
    fireEvent.click(screen.getByRole('button', { name: '서버 관리' }));
    expect(useUiStore.getState().managementOpen).toBe(true);
    fireEvent.click(within(screen.getByRole('navigation', { name: '서버' })).getByRole('button', { name: /Server two/ }));
    expect(useUiStore.getState().selectedServerId).toBe('two');
    expect(useUiStore.getState().managementOpen).toBe(false);
    expect(screen.getByRole('button', { name: /Server two/ }).getAttribute('aria-current')).toBe('page');
    expect(screen.queryByRole('button', { name: 'History' })).toBeNull();
    expect(screen.getByRole('main', { name: 'Server detail content' })).toBeDefined();
    expect(screen.getByText('Existing GPU detail')).toBeDefined();
  });

  it('keeps real management reachable for add/import and return to detail', () => {
    renderShell();
    fireEvent.click(screen.getByRole('button', { name: '서버 추가 또는 가져오기' }));
    expect(useUiStore.getState().managementOpen).toBe(true);
    expect(screen.getByRole('main', { name: 'Server management content' })).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: '서버 관리' }));
    expect(useUiStore.getState().managementOpen).toBe(false);
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
