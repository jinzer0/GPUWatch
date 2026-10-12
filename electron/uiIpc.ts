import type { BrowserWindow, IpcMain, IpcMainInvokeEvent, WebContents } from 'electron';

import { UI_CHANNELS, type AppearanceMode, type AppearanceState, type UiResponse } from './uiContract.js';

export type UiWindow = Pick<BrowserWindow, 'isDestroyed'> & {
  webContents: Pick<WebContents, 'isDestroyed' | 'mainFrame' | 'send'>;
};

export interface UiIpcOptions {
  ipcMain: Pick<IpcMain, 'handle' | 'removeHandler'>;
  getWindows: () => readonly UiWindow[];
  isAllowedUrl: (url: string) => boolean;
  appearance: {
    getAppearance(): AppearanceState | Promise<AppearanceState>;
    setAppearance(mode: AppearanceMode): AppearanceState | Promise<AppearanceState>;
    subscribe(listener: (state: AppearanceState) => void): () => void;
  };
  openSettings: () => Promise<void>;
}

function failure(type: string, message: string): UiResponse<never> {
  return { ok: false, error: { type, message } };
}

function isAppearanceMode(value: unknown): value is AppearanceMode {
  return value === 'system' || value === 'light' || value === 'dark';
}

export function registerUiIpc(options: UiIpcOptions): () => void {
  const { ipcMain, getWindows, isAllowedUrl, appearance, openSettings } = options;
  let active = true;

  function isAllowedWindow(window: UiWindow): boolean {
    return !window.isDestroyed()
      && !window.webContents.isDestroyed()
      && isAllowedUrl(window.webContents.mainFrame.url);
  }

  function authorize(event: IpcMainInvokeEvent): boolean {
    return active && getWindows().some((window) =>
      isAllowedWindow(window)
      && window.webContents === event.sender
      && event.senderFrame === event.sender.mainFrame
    );
  }

  async function respond<T>(event: IpcMainInvokeEvent, validPayload: boolean, action: () => T | Promise<T>): Promise<UiResponse<T>> {
    if (!authorize(event)) {
      return failure('ui_forbidden', 'UI requests require an allowed application main frame.');
    }
    if (!validPayload) {
      return failure('ui_invalid_payload', 'Unexpected UI request payload.');
    }
    try {
      return { ok: true, data: await action() };
    } catch (error) {
      return failure('ui_action_failed', error instanceof Error ? error.message : 'UI action failed.');
    }
  }

  ipcMain.handle(UI_CHANNELS.openSettings, (event, ...args: unknown[]) =>
    respond(event, args.length === 0, openSettings));
  ipcMain.handle(UI_CHANNELS.getAppearance, (event, ...args: unknown[]) =>
    respond(event, args.length === 0, () => appearance.getAppearance()));
  ipcMain.handle(UI_CHANNELS.setAppearance, (event, ...args: unknown[]) =>
    respond(event, args.length === 1 && isAppearanceMode(args[0]), () => appearance.setAppearance(args[0] as AppearanceMode)));

  const unsubscribe = appearance.subscribe((state) => {
    if (!active) {
      return;
    }
    for (const window of getWindows()) {
      if (isAllowedWindow(window)) {
        window.webContents.send(UI_CHANNELS.appearanceChanged, state);
      }
    }
  });

  return () => {
    if (!active) {
      return;
    }
    active = false;
    unsubscribe();
    ipcMain.removeHandler(UI_CHANNELS.openSettings);
    ipcMain.removeHandler(UI_CHANNELS.getAppearance);
    ipcMain.removeHandler(UI_CHANNELS.setAppearance);
  };
}
