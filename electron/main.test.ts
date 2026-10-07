import type { IpcMainInvokeEvent } from 'electron';
import { pathToFileURL } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { UI_CHANNELS, type AppearanceState } from './uiContract.js';
import type { UiIpcOptions } from './uiIpc.js';

type MenuItem = { label?: string; accelerator?: string; click?: () => void; submenu?: MenuItem[] };
type Handler = (event: IpcMainInvokeEvent, ...args: unknown[]) => unknown;

const mocks = vi.hoisted(() => {
  const appListeners = new Map<string, () => void>();
  const powerListeners = new Map<string, () => void>();
  const handlers = new Map<string, Handler>();
  const appearanceListeners: ((state: AppearanceState) => void)[] = [];
  const windows: MockWindow[] = [];
  const loadPlans: Promise<void>[] = [];
  class MockWindow {
    readonly listeners = new Map<string, () => void>();
    destroyed = false;
    readonly webContents = {
      mainFrame: { url: '' },
      isDestroyed: vi.fn(() => this.destroyed),
      send: vi.fn(),
      setWindowOpenHandler: vi.fn(),
      on: vi.fn()
    };
    readonly show = vi.fn();
    readonly focus = vi.fn();
    readonly setBackgroundColor = vi.fn();
    readonly isDestroyed = vi.fn(() => this.destroyed);
    readonly on = vi.fn((event: string, listener: () => void) => { this.listeners.set(event, listener); });
    readonly destroy = vi.fn(() => {
      this.destroyed = true;
      this.listeners.get('closed')?.();
    });
    readonly loadURL = vi.fn((url: string) => {
      this.webContents.mainFrame.url = url;
      return loadPlans.shift() ?? Promise.resolve();
    });
    readonly loadFile = vi.fn((file: string, options: { query?: Record<string, string> }) => {
      const url = pathToFileURL(file);
      for (const [key, value] of Object.entries(options.query ?? {})) url.searchParams.set(key, value);
      this.webContents.mainFrame.url = url.href;
      return loadPlans.shift() ?? Promise.resolve();
    });
    constructor(readonly options: { title: string; webPreferences: { contextIsolation: boolean; nodeIntegration: boolean } }) {
      windows.push(this);
    }
  }
  return {
    appListeners, powerListeners, handlers, appearanceListeners, windows, loadPlans, MockWindow,
    mkdirSync: vi.fn(),
    powerMonitor: {
      on: vi.fn((event: string, listener: () => void) => { powerListeners.set(event, listener); }),
      removeListener: vi.fn((event: string, listener: () => void) => {
        if (powerListeners.get(event) === listener) powerListeners.delete(event);
      })
    },
    app: {
      isPackaged: false,
      getPath: vi.fn(() => '/isolated/user-data'),
      setPath: vi.fn((_name: string, value: string) => { mocks.app.getPath.mockReturnValue(value); }),
      getAppPath: vi.fn(() => '/isolated/GPUWatcher'),
      whenReady: vi.fn<() => Promise<void>>(),
      on: vi.fn((event: string, listener: () => void) => { appListeners.set(event, listener); }),
      quit: vi.fn()
    },
    ipcMain: {
      handle: vi.fn((channel: string, handler: Handler) => { handlers.set(channel, handler); }),
      removeHandler: vi.fn((channel: string) => { handlers.delete(channel); })
    },
    Menu: {
      buildFromTemplate: vi.fn((template: MenuItem[]) => template),
      setApplicationMenu: vi.fn()
    },
    nativeTheme: {},
    dialog: { showErrorBox: vi.fn() },
    Notification: vi.fn(),
    appearance: {
      initialize: vi.fn().mockResolvedValue(undefined),
      getAppearance: vi.fn((): AppearanceState => ({ mode: 'system', resolved: 'light' })),
      setAppearance: vi.fn((mode: AppearanceState['mode']): AppearanceState => ({ mode, resolved: mode === 'dark' ? 'dark' : 'light' })),
      subscribe: vi.fn((listener: (state: AppearanceState) => void) => {
        appearanceListeners.push(listener);
        return vi.fn();
      }),
      dispose: vi.fn()
    },
    scheduler: { start: vi.fn().mockResolvedValue(undefined), suspend: vi.fn().mockResolvedValue(undefined), resume: vi.fn().mockResolvedValue(undefined), stop: vi.fn(), setNotifier: vi.fn() },
    runner: { run: vi.fn() },
    notifier: vi.fn(),
    registerIpcScaffold: vi.fn(),
    createAppearanceController: vi.fn(),
    registerUiIpc: vi.fn<(options: UiIpcOptions) => () => void>()
  };
});

vi.mock('electron', () => ({
  app: mocks.app,
  BrowserWindow: mocks.MockWindow,
  Menu: mocks.Menu,
  nativeTheme: mocks.nativeTheme,
  dialog: mocks.dialog,
  Notification: mocks.Notification,
  powerMonitor: mocks.powerMonitor,
  ipcMain: mocks.ipcMain
}));
vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  return { ...actual, mkdirSync: mocks.mkdirSync, default: { ...actual, mkdirSync: mocks.mkdirSync } };
});
vi.mock('./appearance.js', () => ({
  createAppearanceController: mocks.createAppearanceController.mockImplementation(() => mocks.appearance)
}));
vi.mock('./helperRunner.js', () => ({ createHelperRunner: vi.fn(() => mocks.runner) }));
vi.mock('./scheduler.js', () => ({ createScheduler: vi.fn(() => mocks.scheduler) }));
vi.mock('./notifications.js', () => ({ createMacosNotificationNotifier: vi.fn(() => mocks.notifier) }));
vi.mock('./ipc.js', () => ({ registerIpcScaffold: mocks.registerIpcScaffold }));
vi.mock('./uiIpc.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./uiIpc.js')>();
  return { registerUiIpc: mocks.registerUiIpc.mockImplementation(actual.registerUiIpc) };
});

function deferred() {
  let resolve!: () => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<void>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

function settingsMenuItem(): MenuItem {
  const template = mocks.Menu.buildFromTemplate.mock.calls[0][0];
  return template.find((item) => item.label === 'GPUWatcher')!.submenu!.find((item) => item.label === '설정…')!;
}

function eventFor(window: InstanceType<typeof mocks.MockWindow>): IpcMainInvokeEvent {
  return { sender: window.webContents, senderFrame: window.webContents.mainFrame } as unknown as IpcMainInvokeEvent;
}

function invoke(channel: string, window = mocks.windows[0]) {
  return mocks.handlers.get(channel)!(eventFor(window));
}

async function boot(packaged = false) {
  mocks.app.isPackaged = packaged;
  const ready = deferred();
  mocks.app.whenReady.mockReturnValue(ready.promise);
  await import('./main.js');
  expect(mocks.windows).toHaveLength(0);
  ready.resolve();
  await vi.waitFor(() => expect(mocks.appListeners.has('activate')).toBe(true));
  expect(mocks.windows).toHaveLength(1);
  expect(mocks.scheduler.start).toHaveBeenCalledWith(mocks.runner);
  return mocks.windows[0];
}

describe('main settings-window lifecycle', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mocks.appListeners.clear();
    mocks.powerListeners.clear();
    mocks.scheduler.start.mockResolvedValue(undefined);
    mocks.scheduler.suspend.mockResolvedValue(undefined);
    mocks.scheduler.resume.mockResolvedValue(undefined);
    mocks.handlers.clear();
    mocks.appearanceListeners.length = 0;
    mocks.windows.length = 0;
    mocks.loadPlans.length = 0;
    mocks.app.isPackaged = false;
    mocks.app.getPath.mockReturnValue('/isolated/user-data');
    vi.stubEnv('GPUWATCHER_TEST_DATA_DIR', '');
    mocks.appearance.initialize.mockResolvedValue(undefined);
    mocks.appearance.getAppearance.mockReturnValue({ mode: 'system', resolved: 'light' });
    vi.stubEnv('VITE_DEV_SERVER_URL', 'http://127.0.0.1:5173');
  });

  afterEach(() => {
    mocks.appListeners.get('before-quit')?.();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('deduplicates menu CmdOrCtrl+, and repeated UI requests while settings loads', async () => {
    const main = await boot();
    expect(mocks.app.setPath).not.toHaveBeenCalled();
    expect(mocks.mkdirSync).not.toHaveBeenCalled();
    expect(mocks.registerIpcScaffold).toHaveBeenCalledWith(mocks.runner, mocks.scheduler);
    expect(mocks.createAppearanceController).toHaveBeenCalledWith({
      nativeTheme: mocks.nativeTheme, filePath: '/isolated/user-data/appearance.json'
    });
    const pending = deferred();
    mocks.loadPlans.push(pending.promise);
    const item = settingsMenuItem();
    expect(item.accelerator).toBe('CmdOrCtrl+,');
    item.click!();
    const first = invoke(UI_CHANNELS.openSettings);
    const second = invoke(UI_CHANNELS.openSettings);
    item.click!();
    expect(mocks.windows).toHaveLength(2);
    const settings = mocks.windows[1];
    expect(settings.loadURL).toHaveBeenCalledExactlyOnceWith('http://127.0.0.1:5173/?window=settings');
    expect(settings.show).not.toHaveBeenCalled();
    expect(settings.focus).not.toHaveBeenCalled();
    pending.resolve();
    await expect(first).resolves.toEqual({ ok: true, data: undefined });
    await expect(second).resolves.toEqual({ ok: true, data: undefined });
    expect(settings.show).toHaveBeenCalled();
    expect(settings.focus).toHaveBeenCalled();
    await expect(invoke(UI_CHANNELS.openSettings)).resolves.toEqual({ ok: true, data: undefined });
    expect(mocks.windows).toHaveLength(2);
    expect(settings.loadURL).toHaveBeenCalledOnce();
    expect(main.destroy).not.toHaveBeenCalled();
    expect(mocks.scheduler.start).toHaveBeenCalledOnce();
    expect(mocks.scheduler.stop).not.toHaveBeenCalled();
    expect(mocks.runner.run).not.toHaveBeenCalled();
  });

  it.each([false, true])('loads settings with its dedicated role (packaged=%s)', async (packaged) => {
    const main = await boot(packaged);
    await expect(invoke(UI_CHANNELS.openSettings)).resolves.toEqual({ ok: true, data: undefined });
    const settings = mocks.windows[1];
    if (packaged) {
      expect(main.loadFile).toHaveBeenCalledWith('/isolated/GPUWatcher/dist/index.html', {});
      expect(settings.loadFile).toHaveBeenCalledExactlyOnceWith('/isolated/GPUWatcher/dist/index.html', { query: { window: 'settings' } });
      expect(settings.loadURL).not.toHaveBeenCalled();
    } else {
      expect(main.loadURL).toHaveBeenCalledWith('http://127.0.0.1:5173/');
      expect(settings.loadURL).toHaveBeenCalledExactlyOnceWith('http://127.0.0.1:5173/?window=settings');
      expect(settings.loadFile).not.toHaveBeenCalled();
    }
    expect(settings.options.title).toBe('GPUWatcher 설정');
    expect(settings.options.webPreferences).toMatchObject({ contextIsolation: true, nodeIntegration: false });
    expect(settings.webContents.setWindowOpenHandler.mock.calls[0][0]()).toEqual({ action: 'deny' });
  });

  it('closing settings preserves the main window and scheduler, and reopening creates a fresh window', async () => {
    const main = await boot();
    await invoke(UI_CHANNELS.openSettings);
    const settings = mocks.windows[1];
    settings.destroy();
    expect(main.isDestroyed()).toBe(false);
    expect(mocks.scheduler.stop).not.toHaveBeenCalled();
    expect(mocks.appearance.dispose).not.toHaveBeenCalled();
    expect(mocks.app.quit).not.toHaveBeenCalled();
    expect(mocks.handlers.has(UI_CHANNELS.openSettings)).toBe(true);
    await expect(invoke(UI_CHANNELS.openSettings)).resolves.toEqual({ ok: true, data: undefined });
    expect(mocks.windows).toHaveLength(3);
    expect(mocks.scheduler.start).toHaveBeenCalledOnce();
    mocks.appListeners.get('before-quit')!();
    expect(mocks.scheduler.stop).toHaveBeenCalledOnce();
    expect(mocks.appearance.dispose).toHaveBeenCalledOnce();
    expect(mocks.handlers.size).toBe(0);
  });

  it('surfaces a shared UI load failure and recreates settings on retry', async () => {
    const main = await boot();
    const pending = deferred();
    mocks.loadPlans.push(pending.promise);
    const first = invoke(UI_CHANNELS.openSettings);
    const second = invoke(UI_CHANNELS.openSettings);
    const failed = mocks.windows[1];
    pending.reject(new Error('Settings renderer failed'));
    const error = { ok: false, error: { type: 'ui_action_failed', message: 'Settings renderer failed' } };
    await expect(first).resolves.toEqual(error);
    await expect(second).resolves.toEqual(error);
    expect(failed.destroy).toHaveBeenCalledOnce();
    expect(failed.show).not.toHaveBeenCalled();
    expect(failed.focus).not.toHaveBeenCalled();
    await expect(invoke(UI_CHANNELS.openSettings)).resolves.toEqual({ ok: true, data: undefined });
    expect(mocks.windows).toHaveLength(3);
    expect(mocks.windows[2].focus).toHaveBeenCalled();
    expect(main.destroy).not.toHaveBeenCalled();
    expect(mocks.scheduler.stop).not.toHaveBeenCalled();
    expect(mocks.app.quit).not.toHaveBeenCalled();
  });

  it('keeps monitoring open on appearance read failure and returns an explicit settings error', async () => {
    const error = new Error('Invalid persisted appearance');
    mocks.appearance.initialize.mockRejectedValue(error);
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const main = await boot();
    expect(consoleError).toHaveBeenCalledWith('Could not load appearance:', error);
    expect(main.isDestroyed()).toBe(false);
    expect(mocks.app.quit).not.toHaveBeenCalled();
    await expect(invoke(UI_CHANNELS.getAppearance)).resolves.toEqual({
      ok: false, error: { type: 'ui_action_failed', message: error.message }
    });
    await expect(invoke(UI_CHANNELS.openSettings)).resolves.toMatchObject({ ok: true });
    mocks.appearance.initialize.mockResolvedValue(undefined);
    await expect(invoke(UI_CHANNELS.getAppearance, mocks.windows[1])).resolves.toMatchObject({ ok: true });
    expect(mocks.scheduler.start).toHaveBeenCalledOnce();
  });

  it('surfaces menu load failure and permits a later menu retry', async () => {
    await boot();
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const pending = deferred();
    mocks.loadPlans.push(pending.promise);
    settingsMenuItem().click!();
    const error = new Error('Menu settings load failed');
    pending.reject(error);
    await vi.waitFor(() => expect(consoleError).toHaveBeenCalledWith('Could not open settings:', error));
    expect(mocks.dialog.showErrorBox).toHaveBeenCalledExactlyOnceWith('설정을 열 수 없습니다', 'Menu settings load failed');
    expect(mocks.windows[1].destroy).toHaveBeenCalledOnce();
    settingsMenuItem().click!();
    await vi.waitFor(() => expect(mocks.windows[2].focus).toHaveBeenCalled());
    expect(mocks.app.quit).not.toHaveBeenCalled();
  });

  it('rejects settings closed during loading without destroying twice, then allows retry', async () => {
    await boot();
    const pending = deferred();
    mocks.loadPlans.push(pending.promise);
    const response = invoke(UI_CHANNELS.openSettings);
    const closed = mocks.windows[1];
    closed.destroy();
    pending.resolve();
    await expect(response).resolves.toEqual({
      ok: false, error: { type: 'ui_action_failed', message: 'The window closed before loading completed.' }
    });
    expect(closed.destroy).toHaveBeenCalledOnce();
    expect(closed.show).not.toHaveBeenCalled();
    await expect(invoke(UI_CHANNELS.openSettings)).resolves.toEqual({ ok: true, data: undefined });
    expect(mocks.windows).toHaveLength(3);
  });

  it.each([false, true])('integrates exact main/settings URL and sender-frame authorization (packaged=%s)', async (packaged) => {
    const main = await boot(packaged);
    await invoke(UI_CHANNELS.openSettings);
    const settings = mocks.windows[1];
    await expect(invoke(UI_CHANNELS.getAppearance, main)).resolves.toMatchObject({ ok: true });
    await expect(invoke(UI_CHANNELS.getAppearance, settings)).resolves.toMatchObject({ ok: true });
    const original = settings.webContents.mainFrame.url;
    for (const url of [`${original}&extra=1`, 'https://example.test/?window=settings']) {
      settings.webContents.mainFrame.url = url;
      await expect(invoke(UI_CHANNELS.openSettings, settings)).resolves.toMatchObject({ ok: false, error: { type: 'ui_forbidden' } });
    }
    settings.webContents.mainFrame.url = original;
    const subframe = { sender: settings.webContents, senderFrame: { url: original } } as unknown as IpcMainInvokeEvent;
    await expect(mocks.handlers.get(UI_CHANNELS.openSettings)!(subframe)).resolves.toMatchObject({ ok: false, error: { type: 'ui_forbidden' } });
    const stranger = { sender: { mainFrame: settings.webContents.mainFrame }, senderFrame: settings.webContents.mainFrame } as unknown as IpcMainInvokeEvent;
    await expect(mocks.handlers.get(UI_CHANNELS.openSettings)!(stranger)).resolves.toMatchObject({ ok: false, error: { type: 'ui_forbidden' } });
    expect(mocks.windows).toHaveLength(2);
  });

  it('isolates Electron userData before constructing appearance when test data is configured', async () => {
    vi.stubEnv('GPUWATCHER_TEST_DATA_DIR', '/isolated/stage4-data');
    await boot();
    expect(mocks.app.setPath).toHaveBeenCalledExactlyOnceWith('userData', '/isolated/stage4-data/electron-user-data');
    expect(mocks.mkdirSync).toHaveBeenCalledExactlyOnceWith('/isolated/stage4-data/electron-user-data', { recursive: true });
    expect(mocks.createAppearanceController).toHaveBeenCalledWith({
      nativeTheme: mocks.nativeTheme, filePath: '/isolated/stage4-data/electron-user-data/appearance.json'
    });
    expect(mocks.app.setPath.mock.invocationCallOrder[0]).toBeLessThan(mocks.createAppearanceController.mock.invocationCallOrder[0]);
  });

  it('registers power transitions once and removes the exact listeners on quit', async () => {
    await boot();
    await invoke(UI_CHANNELS.openSettings);
    settingsMenuItem().click!();
    expect(mocks.powerMonitor.on).toHaveBeenCalledTimes(2);
    const suspend = mocks.powerListeners.get('suspend')!;
    const resume = mocks.powerListeners.get('resume')!;
    suspend();
    resume();
    expect(mocks.scheduler.suspend).toHaveBeenCalledOnce();
    expect(mocks.scheduler.resume).toHaveBeenCalledOnce();
    mocks.appListeners.get('before-quit')!();
    expect(mocks.powerMonitor.removeListener).toHaveBeenCalledWith('suspend', suspend);
    expect(mocks.powerMonitor.removeListener).toHaveBeenCalledWith('resume', resume);
    expect(mocks.powerListeners.size).toBe(0);
  });

  it('waits for startup reset then opens the static shell on failure without quitting or blocking on a dialog', async () => {
    const ready = deferred();
    const reset = deferred();
    mocks.app.whenReady.mockReturnValue(ready.promise);
    mocks.scheduler.start.mockReturnValue(reset.promise);
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    await import('./main.js');
    ready.resolve();
    await vi.waitFor(() => expect(mocks.scheduler.start).toHaveBeenCalledOnce());
    expect(mocks.windows).toHaveLength(0);
    const error = new Error('Reset database unavailable');
    reset.reject(error);
    await vi.waitFor(() => expect(mocks.appListeners.has('activate')).toBe(true));
    expect(consoleError).toHaveBeenCalledWith('GPUWatcher startup availability reset failed:', error);
    expect(mocks.dialog.showErrorBox).not.toHaveBeenCalled();
    expect(mocks.app.quit).not.toHaveBeenCalled();
    expect(mocks.windows).toHaveLength(1);
    expect(mocks.windows[0].show).toHaveBeenCalledOnce();
    expect(mocks.scheduler.start).toHaveBeenCalledOnce();
    expect(mocks.scheduler.resume).not.toHaveBeenCalled();
  });

  it.each(['suspend', 'resume'] as const)('shows %s reset diagnostics without restarting monitoring', async (event) => {
    await boot();
    const error = new Error('Lifecycle reset failed');
    mocks.scheduler[event].mockRejectedValue(error);
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    mocks.powerListeners.get(event)!();
    await vi.waitFor(() => expect(consoleError).toHaveBeenCalledWith('GPUWatcher availability reset failed:', error));
    expect(mocks.dialog.showErrorBox).toHaveBeenCalledWith('GPU 관측을 재준비할 수 없습니다', error.message);
    expect(mocks.scheduler.start).toHaveBeenCalledOnce();
  });
});
