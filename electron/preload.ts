import { contextBridge, ipcRenderer } from 'electron';

import { rendererHelperContract, type HelperResponseEnvelope } from './helperContract.js';
import { channelForPreloadMethod } from './ipc.js';
import { UI_CHANNELS, type AppearanceMode, type AppearanceState, type UiBridge } from './uiContract.js';

export type GpuwatcherPreloadApi = {
  [Method in (typeof rendererHelperContract)[number]['electronPreloadMethod']]: (payload?: object) => Promise<HelperResponseEnvelope>;
};

export function createGpuwatcherBridge(invoke: (channel: string, payload: object) => Promise<HelperResponseEnvelope>): GpuwatcherPreloadApi {
  return Object.fromEntries(
    rendererHelperContract.map((entry) => [
      entry.electronPreloadMethod,
      (payload: object = {}) => invoke(channelForPreloadMethod(entry.electronPreloadMethod), payload)
    ])
  ) as GpuwatcherPreloadApi;
}

const gpuwatcher = createGpuwatcherBridge((channel, payload) => ipcRenderer.invoke(channel, payload));

const metadataBridge = {
  isElectron: true,
  platform: process.platform,
  versions: {
    electron: process.versions.electron,
    chrome: process.versions.chrome
  }
} as const;

contextBridge.exposeInMainWorld('gpuwatcher', gpuwatcher);
const uiBridge: UiBridge = {
  openSettings: () => ipcRenderer.invoke(UI_CHANNELS.openSettings),
  getAppearance: () => ipcRenderer.invoke(UI_CHANNELS.getAppearance),
  setAppearance: (mode: AppearanceMode) => ipcRenderer.invoke(UI_CHANNELS.setAppearance, mode),
  onAppearanceChanged: (listener) => {
    const handler = (_event: Electron.IpcRendererEvent, state: AppearanceState) => listener(state);
    ipcRenderer.on(UI_CHANNELS.appearanceChanged, handler);
    return () => ipcRenderer.removeListener(UI_CHANNELS.appearanceChanged, handler);
  }
};
contextBridge.exposeInMainWorld('gpuwatcherUi', uiBridge);
contextBridge.exposeInMainWorld('gpuWatcherElectron', metadataBridge);
