import type {
  ConnectionTestResultDto,
  GpuHistoryResponseDto,
  ProcessRowDto,
  Server,
  ServerDetailDto,
  ServerInput,
  ServerOverviewDto,
  SshConfigImportResult
} from './lib/types';

type GpuwatcherHelperResponse<Data> = { ok: true; data: Data } | { ok: false; error: GpuwatcherHelperError };

interface GpuwatcherHelperError {
  layer?: string;
  type?: string;
  message?: string;
}

interface GpuwatcherBridge {
  initializeApp?: (payload?: object) => Promise<GpuwatcherHelperResponse<ServerOverviewDto[]>>;
  listOverview?: (payload?: object) => Promise<GpuwatcherHelperResponse<ServerOverviewDto[]>>;
  listServers?: (payload?: object) => Promise<GpuwatcherHelperResponse<Server[]>>;
  listSshConfigHosts?: (payload?: object) => Promise<GpuwatcherHelperResponse<SshConfigImportResult>>;
  saveServer?: (payload: { input: ServerInput }) => Promise<GpuwatcherHelperResponse<Server>>;
  deleteServer?: (payload: { id: string }) => Promise<GpuwatcherHelperResponse<void>>;
  setServerEnabled?: (payload: { id: string; enabled: boolean }) => Promise<GpuwatcherHelperResponse<Server>>;
  seedDemoData?: (payload?: object) => Promise<GpuwatcherHelperResponse<ServerOverviewDto[]>>;
  getServerDetail?: (payload: { id: string }) => Promise<GpuwatcherHelperResponse<ServerDetailDto | null>>;
  listGpuHistory?: (payload: {
    serverId: string;
    gpuIndex?: number | null;
    gpuUuid?: string | null;
    range: GpuHistoryResponseDto['range'];
  }) => Promise<GpuwatcherHelperResponse<GpuHistoryResponseDto>>;
  listProcesses?: (payload?: object) => Promise<GpuwatcherHelperResponse<ProcessRowDto[]>>;
  testConnection?: (payload: { id: string }) => Promise<GpuwatcherHelperResponse<ConnectionTestResultDto>>;
  refreshServer?: (payload: { id: string }) => Promise<GpuwatcherHelperResponse<ConnectionTestResultDto>>;
  helperHealth?: (payload?: object) => Promise<GpuwatcherHelperResponse<unknown>>;
}

interface GpuwatcherElectronMetadata {
  readonly isElectron: true;
  readonly platform: string;
  readonly versions: {
    readonly electron?: string;
    readonly chrome?: string;
  };
}

declare global {
  interface Window {
    gpuwatcher?: GpuwatcherBridge;
    gpuWatcherElectron?: GpuwatcherElectronMetadata;
  }
}

export {};
