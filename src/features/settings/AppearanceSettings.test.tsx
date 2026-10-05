import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { UiBridge } from '../../../electron/uiContract';
import { useAppearanceStore } from '../../lib/appearance';
import { AppearanceSettings } from './AppearanceSettings';

describe('appearance-only settings', () => {
  let bridge: UiBridge;
  const helperMethods = {
    initializeApp: vi.fn(), listOverview: vi.fn(), listServers: vi.fn(), listProcesses: vi.fn(),
    listSshConfigHosts: vi.fn(), helperHealth: vi.fn(), refreshServer: vi.fn()
  };

  beforeEach(() => {
    vi.clearAllMocks();
    useAppearanceStore.setState({ ...useAppearanceStore.getInitialState(), hasLoaded: true }, true);
    bridge = {
      getAppearance: vi.fn(),
      setAppearance: vi.fn().mockResolvedValue({ ok: true, data: { mode: 'dark', resolved: 'dark' } }),
      openSettings: vi.fn(),
      onAppearanceChanged: vi.fn()
    };
    window.gpuwatcherUi = bridge;
    window.gpuwatcher = helperMethods;
  });

  afterEach(() => {
    cleanup();
    delete window.gpuwatcherUi;
    delete window.gpuwatcher;
    delete document.documentElement.dataset.appearance;
  });

  it('renders only appearance controls and saves without invoking any helper methods', async () => {
    render(<AppearanceSettings />);
    expect(screen.getByRole('heading', { name: '외형' })).toBeTruthy();
    expect(screen.getAllByRole('radio')).toHaveLength(3);
    fireEvent.click(screen.getByRole('radio', { name: '다크' }));
    await waitFor(() => expect((screen.getByRole('radio', { name: '다크' }) as HTMLInputElement).checked).toBe(true));
    expect(bridge.setAppearance).toHaveBeenCalledWith('dark');
    expect(bridge.getAppearance).not.toHaveBeenCalled();
    expect(bridge.onAppearanceChanged).not.toHaveBeenCalled();
    expect(bridge.openSettings).not.toHaveBeenCalled();
    for (const method of Object.values(helperMethods)) expect(method).not.toHaveBeenCalled();
    expect(screen.queryByText('Server registry')).toBeNull();
  });

  it('disables the controls in a browser', () => {
    delete window.gpuwatcherUi;
    render(<AppearanceSettings />);
    expect(screen.getByRole('group').hasAttribute('disabled')).toBe(true);
    fireEvent.click(screen.getByRole('radio', { name: '다크' }));
    expect(bridge.setAppearance).not.toHaveBeenCalled();
  });

  it('disables controls while a save is pending and enables them after completion', async () => {
    let resolve!: (response: Awaited<ReturnType<UiBridge['setAppearance']>>) => void;
    bridge.setAppearance = vi.fn(() => new Promise<Awaited<ReturnType<UiBridge['setAppearance']>>>((done) => { resolve = done; }));
    render(<AppearanceSettings />);
    fireEvent.click(screen.getByRole('radio', { name: '라이트' }));
    expect(screen.getByRole('group').hasAttribute('disabled')).toBe(true);
    resolve({ ok: true, data: { mode: 'light', resolved: 'light' } });
    await waitFor(() => expect(screen.getByRole('group').hasAttribute('disabled')).toBe(false));
  });

  it('shows store errors while preserving the selected mode after a failed save', async () => {
    bridge.setAppearance = vi.fn().mockResolvedValue({ ok: false, error: { type: 'write_failed', message: 'Cannot save appearance' } });
    render(<AppearanceSettings />);
    fireEvent.click(screen.getByRole('radio', { name: '다크' }));
    expect((await screen.findByRole('alert')).textContent).toBe('Cannot save appearance');
    expect((screen.getByRole('radio', { name: '시스템 설정 따르기' }) as HTMLInputElement).checked).toBe(true);
    expect(screen.getByRole('group').hasAttribute('disabled')).toBe(false);
  });

  it('keeps values unconfirmed and controls disabled while reading', () => {
    useAppearanceStore.setState({ hasLoaded: false, isLoading: true });
    render(<AppearanceSettings />);
    expect(screen.getByRole('status').textContent).toBe('외형 설정을 불러오는 중…');
    expect(screen.getByRole('group').hasAttribute('disabled')).toBe(true);
    for (const radio of screen.getAllByRole('radio')) expect((radio as HTMLInputElement).checked).toBe(false);
    expect(bridge.setAppearance).not.toHaveBeenCalled();
  });

  it('does not pretend a read succeeded and allows an explicit replacement after failure', async () => {
    useAppearanceStore.setState({ hasLoaded: false, error: 'Invalid persisted appearance' });
    render(<AppearanceSettings />);
    expect(screen.getByRole('alert').textContent).toBe('Invalid persisted appearance');
    for (const radio of screen.getAllByRole('radio')) expect((radio as HTMLInputElement).checked).toBe(false);
    fireEvent.click(screen.getByRole('radio', { name: '다크' }));
    await waitFor(() => expect((screen.getByRole('radio', { name: '다크' }) as HTMLInputElement).checked).toBe(true));
    expect(screen.queryByRole('alert')).toBeNull();
    expect(bridge.setAppearance).toHaveBeenCalledExactlyOnceWith('dark');
  });
});
