import { contextBridge, ipcRenderer } from 'electron';

import { helperContract, type HelperResponseEnvelope } from './helperContract.js';
import { channelForPreloadMethod } from './ipc.js';

export type GpuwatcherPreloadApi = {
  [Method in (typeof helperContract)[number]['electronPreloadMethod']]: (payload?: object) => Promise<HelperResponseEnvelope>;
};

export function createGpuwatcherBridge(invoke: (channel: string, payload: object) => Promise<HelperResponseEnvelope>): GpuwatcherPreloadApi {
  return Object.fromEntries(
    helperContract.map((entry) => [
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
  },
  migrationStatus: () => ({
    ipc: 'implemented-task-7',
    helperRunner: 'deferred-to-task-8',
    scheduler: 'deferred-to-task-8'
  })
} as const;

contextBridge.exposeInMainWorld('gpuwatcher', gpuwatcher);
contextBridge.exposeInMainWorld('gpuWatcherElectron', metadataBridge);
