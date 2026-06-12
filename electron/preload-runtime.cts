import { contextBridge, ipcRenderer } from 'electron';

const IPC_CHANNEL_PREFIX = 'gpuwatcher:helper:';
const rendererPreloadMethods = [
  'initializeApp',
  'listOverview',
  'listServers',
  'saveServer',
  'deleteServer',
  'setServerEnabled',
  'seedDemoData',
  'getServerDetail',
  'listGpuHistory',
  'listProcesses',
  'testConnection',
  'refreshServer',
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
  },
  migrationStatus: () => ({
    ipc: 'implemented-task-7',
    helperRunner: 'implemented-task-8',
    scheduler: 'implemented-task-8'
  })
} as const;

contextBridge.exposeInMainWorld('gpuwatcher', gpuwatcher);
contextBridge.exposeInMainWorld('gpuWatcherElectron', metadataBridge);
