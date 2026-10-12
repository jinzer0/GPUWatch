import { contextBridge, ipcRenderer } from 'electron';
import type { AppearanceMode, AppearanceState, UiBridge } from './uiContract.js';

const IPC_CHANNEL_PREFIX = 'gpuwatcher:helper:';
const rendererPreloadMethods = [
  'initializeApp',
  'listOverview',
  'listServers',
  'listSshConfigHosts',
  'saveServer',
  'deleteServer',
  'setServerEnabled',
  'seedDemoData',
  'getServerDetail',
  'listGpuHistory',
  'listProcesses',
  'testConnection',
  'refreshServer',
  'listWatchRules',
  'saveGpuAvailableWatch',
  'deleteWatchRule',
  'helperHealth'
] as const;

const gpuwatcher = Object.fromEntries(
  rendererPreloadMethods.map((method) => [method, (payload: object = {}) => ipcRenderer.invoke(`${IPC_CHANNEL_PREFIX}${method}`, payload)])
);

const metadataBridge = {
  isElectron: true,
  platform: process.platform,
  versions: {
    electron: process.versions.electron,
    chrome: process.versions.chrome
  }
} as const;

contextBridge.exposeInMainWorld('gpuwatcher', gpuwatcher);
const UI_CHANNELS = {
  openSettings: 'gpuwatcher:ui:openSettings',
  getAppearance: 'gpuwatcher:ui:getAppearance',
  setAppearance: 'gpuwatcher:ui:setAppearance',
  appearanceChanged: 'gpuwatcher:ui:appearanceChanged'
} as const;
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
