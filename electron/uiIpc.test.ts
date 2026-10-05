import type { IpcMainInvokeEvent } from 'electron';
import { describe, expect, it, vi } from 'vitest';

import { UI_CHANNELS, type AppearanceState } from './uiContract.js';
import { registerUiIpc, type UiIpcOptions, type UiWindow } from './uiIpc.js';

const allowedUrl = 'file:///app/dist/index.html';
const initialState: AppearanceState = { mode: 'system', resolved: 'light' };

function createWindow(url = allowedUrl) {
  return {
    isDestroyed: vi.fn(() => false),
    webContents: {
      isDestroyed: vi.fn(() => false),
      mainFrame: { url } as UiWindow['webContents']['mainFrame'],
      send: vi.fn()
    }
  };
}

function eventFor(window: UiWindow, senderFrame = window.webContents.mainFrame): IpcMainInvokeEvent {
  return { sender: window.webContents, senderFrame } as IpcMainInvokeEvent;
}

function setup() {
  const window = createWindow();
  let windows: UiWindow[] = [window];
  const handlers = new Map<string, (event: IpcMainInvokeEvent, ...args: unknown[]) => unknown>();
  let listener: ((state: AppearanceState) => void) | undefined;
  const unsubscribe = vi.fn();
  const ipcMain = {
    handle: vi.fn((channel: string, handler: (event: IpcMainInvokeEvent, ...args: unknown[]) => unknown) => {
      handlers.set(channel, handler);
    }),
    removeHandler: vi.fn((channel: string) => { handlers.delete(channel); })
  };
  const appearance = {
    getAppearance: vi.fn(() => initialState),
    setAppearance: vi.fn((mode: AppearanceState['mode']): AppearanceState => ({
      mode,
      resolved: mode === 'dark' ? 'dark' : 'light'
    })),
    subscribe: vi.fn((callback: (state: AppearanceState) => void) => {
      listener = callback;
      return unsubscribe;
    })
  };
  const openSettings = vi.fn(async () => {});
  const options: UiIpcOptions = {
    ipcMain,
    getWindows: () => windows,
    isAllowedUrl: (url) => url === allowedUrl,
    appearance,
    openSettings
  };
  const cleanup = registerUiIpc(options);

  return {
    window, handlers, ipcMain, appearance, openSettings, cleanup, unsubscribe,
    setWindows: (value: UiWindow[]) => { windows = value; },
    emit: (state: AppearanceState) => listener!(state),
    invoke: (channel: string, event = eventFor(window), ...args: unknown[]) => handlers.get(channel)!(event, ...args)
  };
}

describe('UI action-specific IPC', () => {
  it('registers only the three request channels, not event or generic dispatch channels', () => {
    const { handlers } = setup();
    expect([...handlers.keys()]).toEqual([
      'gpuwatcher:ui:openSettings',
      'gpuwatcher:ui:getAppearance',
      'gpuwatcher:ui:setAppearance'
    ]);
    expect(UI_CHANNELS.appearanceChanged).toBe('gpuwatcher:ui:appearanceChanged');
  });

  it('opens settings and reads appearance for a registered allowed main frame', async () => {
    const context = setup();
    await expect(context.invoke(UI_CHANNELS.openSettings)).resolves.toEqual({ ok: true, data: undefined });
    await expect(context.invoke(UI_CHANNELS.getAppearance)).resolves.toEqual({ ok: true, data: initialState });
    expect(context.openSettings).toHaveBeenCalledOnce();
    expect(context.appearance.getAppearance).toHaveBeenCalledOnce();
  });

  it.each(['system', 'light', 'dark'] as const)('accepts the exact appearance mode %s', async (mode) => {
    const context = setup();
    await expect(context.invoke(UI_CHANNELS.setAppearance, eventFor(context.window), mode)).resolves.toEqual({
      ok: true,
      data: { mode, resolved: mode === 'dark' ? 'dark' : 'light' }
    });
    expect(context.appearance.setAppearance).toHaveBeenCalledWith(mode);
  });

  it.each(['unregistered', 'same-id-impostor', 'subframe', 'missing-frame', 'destroyed-window', 'destroyed-contents', 'untrusted-url', 'lookalike-url', 'removed-window'])(
    'rejects %s callers for every request channel without invoking actions', async (scenario) => {
      const context = setup();
      let event = eventFor(context.window);
      if (scenario === 'unregistered' || scenario === 'same-id-impostor') {
        const stranger = createWindow();
        if (scenario === 'same-id-impostor') {
          Object.assign(context.window.webContents, { id: 1 });
          Object.assign(stranger.webContents, { id: 1 });
        }
        event = eventFor(stranger);
      } else if (scenario === 'subframe') {
        event = eventFor(context.window, { url: allowedUrl } as UiWindow['webContents']['mainFrame']);
      } else if (scenario === 'missing-frame') {
        event = { sender: context.window.webContents, senderFrame: null } as IpcMainInvokeEvent;
      } else if (scenario === 'destroyed-window') {
        context.window.isDestroyed.mockReturnValue(true);
      } else if (scenario === 'destroyed-contents') {
        context.window.webContents.isDestroyed.mockReturnValue(true);
      } else if (scenario === 'removed-window') {
        context.setWindows([]);
      } else {
        Object.assign(context.window.webContents.mainFrame, {
          url: scenario === 'lookalike-url' ? `${allowedUrl}/evil` : 'https://example.com/'
        });
      }
      for (const channel of [UI_CHANNELS.openSettings, UI_CHANNELS.getAppearance, UI_CHANNELS.setAppearance]) {
        const args = channel === UI_CHANNELS.setAppearance ? ['dark'] : [];
        await expect(context.invoke(channel, event, ...args)).resolves.toMatchObject({ ok: false, error: { type: 'ui_forbidden' } });
      }
      expect(context.openSettings).not.toHaveBeenCalled();
      expect(context.appearance.getAppearance).not.toHaveBeenCalled();
      expect(context.appearance.setAppearance).not.toHaveBeenCalled();
    }
  );

  it.each([[], [undefined], [null], ['auto'], ['Dark'], [' dark'], [1], [{}], [{ mode: 'dark' }], [['dark']], ['dark', 'light']])(
    'rejects invalid setAppearance argument lists %j', async (...args) => {
      const context = setup();
      await expect(context.invoke(UI_CHANNELS.setAppearance, eventFor(context.window), ...args)).resolves.toMatchObject({
        ok: false, error: { type: 'ui_invalid_payload' }
      });
      expect(context.appearance.setAppearance).not.toHaveBeenCalled();
    }
  );

  it.each([UI_CHANNELS.openSettings, UI_CHANNELS.getAppearance])('rejects any supplied payload on %s', async (channel) => {
    const context = setup();
    for (const args of [[undefined], [null], [{}], ['dark'], [1, 2]]) {
      await expect(context.invoke(channel, eventFor(context.window), ...args)).resolves.toMatchObject({
        ok: false, error: { type: 'ui_invalid_payload' }
      });
    }
    expect(context.openSettings).not.toHaveBeenCalled();
    expect(context.appearance.getAppearance).not.toHaveBeenCalled();
  });

  it('wraps rejected settings requests and thrown appearance operations in UI errors', async () => {
    const context = setup();
    context.openSettings.mockRejectedValueOnce(new Error('Unable to open settings'));
    context.appearance.getAppearance.mockImplementationOnce(() => { throw new Error('Unable to read appearance'); });
    context.appearance.setAppearance.mockImplementationOnce(() => { throw 'write failed'; });
    await expect(context.invoke(UI_CHANNELS.openSettings)).resolves.toEqual({
      ok: false, error: { type: 'ui_action_failed', message: 'Unable to open settings' }
    });
    await expect(context.invoke(UI_CHANNELS.getAppearance)).resolves.toEqual({
      ok: false, error: { type: 'ui_action_failed', message: 'Unable to read appearance' }
    });
    await expect(context.invoke(UI_CHANNELS.setAppearance, eventFor(context.window), 'dark')).resolves.toEqual({
      ok: false, error: { type: 'ui_action_failed', message: 'UI action failed.' }
    });
  });

  it('broadcasts only to current living windows with an exactly allowed main-frame URL', () => {
    const context = setup();
    const second = createWindow();
    const destroyed = createWindow();
    destroyed.isDestroyed.mockReturnValue(true);
    const deadContents = createWindow();
    deadContents.webContents.isDestroyed.mockReturnValue(true);
    const untrusted = createWindow('https://example.com/');
    const lookalike = createWindow(`${allowedUrl}?redirect=evil`);
    context.setWindows([context.window, second, destroyed, deadContents, untrusted, lookalike]);
    const state: AppearanceState = { mode: 'dark', resolved: 'dark' };
    context.emit(state);
    expect(context.window.webContents.send).toHaveBeenCalledWith(UI_CHANNELS.appearanceChanged, state);
    expect(second.webContents.send).toHaveBeenCalledWith(UI_CHANNELS.appearanceChanged, state);
    for (const window of [destroyed, deadContents, untrusted, lookalike]) {
      expect(window.webContents.send).not.toHaveBeenCalled();
    }
    context.setWindows([second]);
    Object.assign(second.webContents.mainFrame, { url: 'https://example.com/' });
    context.emit(initialState);
    expect(context.window.webContents.send).toHaveBeenCalledOnce();
    expect(second.webContents.send).toHaveBeenCalledOnce();
  });

  it('unsubscribes and removes only UI request handlers once and disables retained callbacks', async () => {
    const context = setup();
    const retainedHandler = context.handlers.get(UI_CHANNELS.openSettings)!;
    context.cleanup();
    context.cleanup();
    expect(context.unsubscribe).toHaveBeenCalledOnce();
    expect(context.ipcMain.removeHandler.mock.calls).toEqual([
      [UI_CHANNELS.openSettings], [UI_CHANNELS.getAppearance], [UI_CHANNELS.setAppearance]
    ]);
    expect(context.handlers.size).toBe(0);
    context.emit(initialState);
    expect(context.window.webContents.send).not.toHaveBeenCalled();
    await expect(retainedHandler(eventFor(context.window))).resolves.toMatchObject({ ok: false, error: { type: 'ui_forbidden' } });
    expect(context.openSettings).not.toHaveBeenCalled();
  });
});
