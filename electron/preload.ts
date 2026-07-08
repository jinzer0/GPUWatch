import { contextBridge, ipcRenderer } from 'electron';

import { rendererHelperContract, type HelperResponseEnvelope } from './helperContract.js';
import { channelForPreloadMethod } from './ipc.js';

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
contextBridge.exposeInMainWorld('gpuWatcherElectron', metadataBridge);
