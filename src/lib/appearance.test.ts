import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { AppearanceState, UiBridge, UiResponse } from '../../electron/uiContract';
import { connectAppearance, openSettings, setAppearance, useAppearanceStore } from './appearance';

const light: AppearanceState = { mode: 'light', resolved: 'light' };
const dark: AppearanceState = { mode: 'dark', resolved: 'dark' };
const ok = <T,>(data: T): UiResponse<T> => ({ ok: true, data });
const flush = async () => { await Promise.resolve(); await Promise.resolve(); };

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

describe('appearance client', () => {
  let listener: (state: AppearanceState) => void;
  let bridge: UiBridge;
  let disconnect: (() => void) | undefined;
  const unsubscribe = vi.fn();

  beforeEach(() => {
    unsubscribe.mockReset();
    useAppearanceStore.setState(useAppearanceStore.getInitialState(), true);
    delete document.documentElement.dataset.appearance;
    bridge = {
      getAppearance: vi.fn().mockResolvedValue(ok(light)),
      setAppearance: vi.fn().mockResolvedValue(ok(dark)),
      openSettings: vi.fn().mockResolvedValue(ok(undefined)),
      onAppearanceChanged: vi.fn((callback) => {
        listener = callback;
        return unsubscribe;
      })
    };
    window.gpuwatcherUi = bridge;
  });

  afterEach(() => {
    disconnect?.();
    disconnect = undefined;
    delete window.gpuwatcherUi;
    delete document.documentElement.dataset.appearance;
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('subscribes before reading and applies reads and events to the document', async () => {
    bridge.getAppearance = vi.fn(() => {
      expect(bridge.onAppearanceChanged).toHaveBeenCalledOnce();
      return Promise.resolve(ok(light));
    });
    disconnect = connectAppearance();
    await flush();
    expect(useAppearanceStore.getState().appearance).toEqual(light);
    expect(document.documentElement.dataset.appearance).toBe('light');
    listener({ mode: 'system', resolved: 'dark' });
    expect(useAppearanceStore.getState().appearance).toEqual({ mode: 'system', resolved: 'dark' });
    expect(document.documentElement.dataset.appearance).toBe('dark');
  });

  it('ignores a stale initial read after an event', async () => {
    const initial = deferred<UiResponse<AppearanceState>>();
    bridge.getAppearance = vi.fn(() => initial.promise);
    disconnect = connectAppearance();
    listener(dark);
    initial.resolve(ok(light));
    await flush();
    expect(useAppearanceStore.getState().appearance).toEqual(dark);
    expect(document.documentElement.dataset.appearance).toBe('dark');
  });

  it('ignores stale initial failures after an event', async () => {
    const initial = deferred<UiResponse<AppearanceState>>();
    bridge.getAppearance = vi.fn(() => initial.promise);
    disconnect = connectAppearance();
    listener(dark);
    initial.reject(new Error('Old read failed'));
    await flush();
    expect(useAppearanceStore.getState().error).toBeNull();
  });

  it('unsubscribes once and ignores pending reads and late events after disposal', async () => {
    const initial = deferred<UiResponse<AppearanceState>>();
    bridge.getAppearance = vi.fn(() => initial.promise);
    disconnect = connectAppearance();
    disconnect();
    disconnect();
    initial.resolve(ok(dark));
    listener(dark);
    await flush();
    expect(unsubscribe).toHaveBeenCalledOnce();
    expect(useAppearanceStore.getState().appearance).toEqual({ mode: 'system', resolved: 'light' });
    expect(document.documentElement.dataset.appearance).toBeUndefined();
  });

  it('shows get errors and clears them when a fresh event arrives', async () => {
    bridge.getAppearance = vi.fn().mockResolvedValue({ ok: false, error: { type: 'read_failed', message: 'Cannot read appearance' } });
    disconnect = connectAppearance();
    await flush();
    expect(useAppearanceStore.getState().error).toBe('Cannot read appearance');
    listener(dark);
    expect(useAppearanceStore.getState().error).toBeNull();
  });

  it('saves using the dedicated bridge action and tracks pending state', async () => {
    const saved = deferred<UiResponse<AppearanceState>>();
    bridge.setAppearance = vi.fn(() => saved.promise);
    const saving = setAppearance('dark');
    expect(useAppearanceStore.getState().isSaving).toBe(true);
    expect(bridge.setAppearance).toHaveBeenCalledWith('dark');
    saved.resolve(ok(dark));
    await saving;
    expect(useAppearanceStore.getState().appearance).toEqual(dark);
    expect(document.documentElement.dataset.appearance).toBe('dark');
    expect(useAppearanceStore.getState().isSaving).toBe(false);
  });

  it('preserves current appearance and exposes typed save failures', async () => {
    useAppearanceStore.setState({ appearance: light });
    bridge.setAppearance = vi.fn().mockResolvedValue({ ok: false, error: { type: 'write_failed', message: 'Cannot save appearance' } });
    await expect(setAppearance('dark')).rejects.toMatchObject({ type: 'write_failed', message: 'Cannot save appearance' });
    expect(useAppearanceStore.getState()).toMatchObject({ appearance: light, error: 'Cannot save appearance', isSaving: false });
  });

  it('does not overwrite a newer broadcast with a delayed save response', async () => {
    disconnect = connectAppearance();
    await flush();
    const saved = deferred<UiResponse<AppearanceState>>();
    bridge.setAppearance = vi.fn(() => saved.promise);
    const saving = setAppearance('system');
    listener({ mode: 'system', resolved: 'dark' });
    saved.resolve(ok({ mode: 'system', resolved: 'light' }));
    await saving;
    expect(useAppearanceStore.getState().appearance).toEqual({ mode: 'system', resolved: 'dark' });
    expect(document.documentElement.dataset.appearance).toBe('dark');
  });

  it('captures rejected bridge calls without changing current appearance', async () => {
    bridge.setAppearance = vi.fn().mockRejectedValue(new Error('IPC disconnected'));
    await expect(setAppearance('dark')).rejects.toThrow('IPC disconnected');
    expect(useAppearanceStore.getState()).toMatchObject({ appearance: { mode: 'system', resolved: 'light' }, error: 'IPC disconnected', isSaving: false });
  });

  it('opens settings using its dedicated action and exposes typed errors', async () => {
    await openSettings();
    expect(bridge.openSettings).toHaveBeenCalledOnce();
    expect(bridge.getAppearance).not.toHaveBeenCalled();
    expect(bridge.setAppearance).not.toHaveBeenCalled();
    bridge.openSettings = vi.fn().mockResolvedValue({ ok: false, error: { type: 'window_failed', message: 'Cannot open settings' } });
    await expect(openSettings()).rejects.toMatchObject({ type: 'window_failed' });
    expect(useAppearanceStore.getState().error).toBe('Cannot open settings');
  });

  it('keeps the browser static and rejects desktop actions as backend_unavailable', async () => {
    delete window.gpuwatcherUi;
    const matchMedia = vi.fn(() => { throw new Error('Must not inspect system appearance'); });
    vi.stubGlobal('matchMedia', matchMedia);
    disconnect = connectAppearance();
    expect(document.documentElement.dataset.appearance).toBe('light');
    await expect(setAppearance('dark')).rejects.toMatchObject({ type: 'backend_unavailable' });
    await expect(openSettings()).rejects.toMatchObject({ type: 'backend_unavailable' });
    expect(useAppearanceStore.getState().appearance).toEqual({ mode: 'system', resolved: 'light' });
    expect(matchMedia).not.toHaveBeenCalled();
  });
});
